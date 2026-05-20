/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Pipeline: Save -> Decision (Granular) -> Scheduler -> Lumi -> Response
 */
import { ChatProviderFactory } from '../services/ai/ChatProviderFactory.js';
import { getLumiSystemMessage, getDecisionSystemMessage, getLumiParams } from '../utils/agentManager.js';
import {
    getFormattedHistory,
    getDecisionHistory,
    addUserMessages,
    addAssistantMessage,
    getUnprocessedMessages,
    updateMessageStatus,
    MSG_STATUS
} from '../utils/messageStore.js';
import { getDebugMode } from '../commands/debug.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';
import { getConfig, getDecisionModel } from '../utils/configStore.js';
import { summarizeYouTubeVideo } from '../services/media/mediaProcessor.js';
import { updateMessageContent } from '../utils/messageStore.js';
import { checkAndEvolvePersonality } from '../services/ai/personalityEvolutionService.js';

// Dynamic provider instantiation takes place locally within agents

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function wrapText(text, width = 80) {
    return text.split('\n').map(line => {
        if (line.length <= width) return line;
        const words = line.split(' ');
        let result = '', currentLine = '';
        currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            if ((currentLine + ' ' + words[i]).length <= width) {
                currentLine += ' ' + words[i];
            } else {
                result += currentLine + '\n';
                currentLine = words[i];
            }
        }
        return result + currentLine;
    }).join('\n');
}

// Regex to detect YouTube URLs in message content (protocol optional)
const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w\-]+(?:[?&]\S+)*/gi;

// Supported audio MIME types (Discord voice messages are audio/ogg)
const AUDIO_MIME_TYPES = new Set([
    'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff',
    'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm',
]);

export function extractUserMessages(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => {
        const mediaAttachments = [];

        // 1. Detect YouTube URLs in text content
        const ytMatches = msg.content?.matchAll(YOUTUBE_URL_REGEX);
        if (ytMatches) {
            for (const match of ytMatches) {
                console.log(`[MediaDetect] YouTube URL detected: ${match[0]}`);
                mediaAttachments.push({ type: 'youtube', url: match[0] });
            }
        }

        // 2. Detect audio file attachments
        if (msg.attachments?.size > 0) {
            for (const [, attachment] of msg.attachments) {
                const ct = attachment.contentType?.split(';')[0].trim().toLowerCase() || '';
                if (AUDIO_MIME_TYPES.has(ct)) {
                    mediaAttachments.push({
                        type: 'audio',
                        url: attachment.url,
                        mimeType: ct,
                        filename: attachment.name || 'audio',
                        size: attachment.size || 0,
                    });
                }
            }
        }

        return {
            userId: msg.author.id,
            userName: msg.member?.displayName || msg.author.username,
            content: msg.content,
            timestamp: now,
            messageId: msg.id,
            replyTo: msg.reference?.messageId || null,
            mediaAttachments: mediaAttachments.length > 0 ? mediaAttachments : null,
        };
    });
}

// ... (SendDebugAttachment and HandleDebugOutput omitted for brevity if unchanged, but I need to be careful with replace_file_content context matching)
// Actually I will target separate chunks.

// Chunk 1: Export extractUserMessages


async function sendDebugAttachment(channel, label, content, replyTo = null) {
    const wrapped = wrapText(content, 100);
    const buffer = Buffer.from('\uFEFF' + wrapped, 'utf-8');
    const options = {
        content: `**[${label}]**`,
        files: [{ attachment: buffer, name: `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt` }]
    };
    if (replyTo) options.reply = { messageReference: replyTo };
    try { await channel.send(options); } catch (err) { console.error(`Failed to send ${label} debug:`, err); }
}

async function handleDebugOutput(debugMode, channel, lastMessage, contentStr, metadata = {}) {
    if (debugMode === 'full') {
        console.log('[Debug] Metadata received:', JSON.stringify(metadata, null, 2));
        let metaInfo = '';
        if (metadata.usage) {
            metaInfo += `\n**Meta Info**\n`;
            metaInfo += `Provider: \`${metadata.provider || 'Unknown'}\` | Model: \`${metadata.model || 'Unknown'}\`\n`;
            metaInfo += `Tokens: Prompt: ${metadata.usage.promptTokens}, Completion: ${metadata.usage.completionTokens}, Total: ${metadata.usage.totalTokens}`;
        }
        await sendDebugOutput(channel, contentStr, metaInfo);
    } else if (debugMode === 'thoughts') {
        const thoughtMatch = contentStr.match(/<THOUGHT>([\s\S]*?)<\/THOUGHT>/i);
        if (thoughtMatch) {
            const wrappedThought = wrapText(thoughtMatch[1].trim());
            await sendDebugAttachment(channel, '💭 THOUGHT', wrappedThought, lastMessage.id);
        }
    }
}

// ============================================================================
// AGENTS
// ============================================================================

/**
 * Call Decision Agent with binary control (RESPONDER / IGNORAR)
 * Uses an independent provider fallback chain:
 *   1. Configured provider + decision_model (e.g. Gemini flash-lite)
 *   2. Same provider fallbacks
 *   3. Groq llama-3.1-8b-instant as final safety net (no daily quota)
 */
async function callDecisionAgent(history, unprocessedMessages, model = null) {
    const activeModel = model || getDecisionModel();

    // Build context
    let contextContent = '';

    // 1. History (Processed context)
    if (history.length > 0) {
        contextContent += '--- CONVERSATION HISTORY (Context) ---\n';
        contextContent += history.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n');
        contextContent += '\n\n';
    }

    // 2. Unprocessed Messages (Actionable items)
    contextContent += '--- UNPROCESSED MESSAGES (Evaluate these) ---\n';
    unprocessedMessages.forEach(msg => {
        contextContent += `${msg.status}: [${msg.author}] (ID:${msg.id}) "${msg.content}"\n`;
    });

    // Provider-specific fallback chains — always end in Groq as the free-tier safety net
    const primaryProvider = ChatProviderFactory.createProvider();
    const groqProvider = ChatProviderFactory.createProvider('groq');

    const modelsToTry = [
        { provider: primaryProvider, model: activeModel },
        { provider: groqProvider, model: 'llama-3.1-8b-instant' },
        { provider: groqProvider, model: 'llama-3.3-70b-versatile' },
    ];

    for (const attempt of modelsToTry) {
        try {
            const response = await attempt.provider.complete([
                { role: 'system', content: getDecisionSystemMessage() },
                { role: 'user', content: contextContent }
            ], {
                model: attempt.model,
                temperature: 0.1
            });

            const content = response.content || '';

            // Parse Decisions XML
            const decisions = [];
            const msgRegex = /<MSG\s+id="([^"]+)"\s+action="([^"]+)"\s*\/>/gi;
            let match;
            while ((match = msgRegex.exec(content)) !== null) {
                decisions.push({ id: match[1], action: match[2].toUpperCase() });
            }

            const reasonMatch = content.match(/<REASON>(.*?)<\/REASON>/i);
            const reason = reasonMatch?.[1]?.trim() || 'Sin razón';

            // Fallback parse
            if (decisions.length === 0) {
                if (content.includes('RESPONDER')) {
                    unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'RESPONDER' }));
                } else {
                    unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'IGNORAR' }));
                }
            }

            if (attempt.model !== activeModel) {
                console.warn(`[DecisionAgent] Used fallback: ${attempt.model}`);
            }

            return { decisions, reason, rawResponse: content, contextSent: contextContent, decisionModel: attempt.model };

        } catch (error) {
            const isLast = attempt === modelsToTry[modelsToTry.length - 1];
            console.error(`[DecisionAgent] Error with model ${attempt.model}:`, error.message);
            if (isLast) {
                return {
                    decisions: unprocessedMessages.map(m => ({ id: m.id, action: 'IGNORAR' })),
                    reason: 'Error en agente',
                    rawResponse: '', contextSent: contextContent, decisionModel: attempt.model
                };
            }
            const next = modelsToTry[modelsToTry.indexOf(attempt) + 1];
            console.warn(`[DecisionAgent] Falling back to: ${next.model}`);
        }
    }
}

/**
 * Call Lumi Agent
 */
import { getToolDefinitions, executeTool } from '../utils/tools/registry.js';

/**
 * Call Lumi Agent with Tool Support
 */
async function callLumiAgent(historyMessages, targetIds = [], context = {}, options = {}) {
    const aiProvider = ChatProviderFactory.createProvider();
    
    const fullContext = { ...context, bypassPersonality: options.bypassPersonality };
    let systemContent = await getLumiSystemMessage(fullContext);

    // Inject focus instructions if IDs present
    if (targetIds && targetIds.length > 0) {
        systemContent += `\n\n[REPLY TO MESSAGE_IDs]: ${targetIds.join(', ')}`;
    }

    const messages = [
        { role: 'system', content: systemContent },
        ...historyMessages
    ];

    const params = getLumiParams();
    const tools = getToolDefinitions();

    let finished = false;
    let finalContent = '';
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finalProvider = '';
    let finalModel = '';

    const LUMI_FALLBACK_CHAIN = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    const primaryModel = context.model || 'gemini-2.5-flash';
    const lumiModels = [primaryModel, ...LUMI_FALLBACK_CHAIN.filter(m => m !== primaryModel)];
    let lumiModelIdx = 0;

    while (!finished && iterations < MAX_ITERATIONS) {
        iterations++;

        try {
            const currentModel = lumiModels[lumiModelIdx];
            console.log(`[LumiAgent] Iteration ${iterations}. Sending to AI using model: ${currentModel}${lumiModelIdx > 0 ? ' (fallback)' : ''}...`);
            const response = await aiProvider.complete(messages, {
                model: currentModel,
                tools: tools,
                toolChoice: 'auto',
                temperature: params.temperature,
                presencePenalty: params.presence_penalty,
                frequencyPenalty: params.frequency_penalty
            });

            const { content, toolCalls, usage, provider, model } = response;
            console.log(`[LumiAgent] Response content length: ${content ? content.length : 0}, ToolCalls: ${toolCalls ? toolCalls.length : 0}`);

            // Accumulate usage
            if (usage) {
                totalUsage.promptTokens += usage.promptTokens || 0;
                totalUsage.completionTokens += usage.completionTokens || 0;
                totalUsage.totalTokens += usage.totalTokens || 0;
            }
            finalProvider = provider || finalProvider;
            finalModel = model || finalModel;

            if (!content && (!toolCalls || toolCalls.length === 0)) {
                console.warn('[LumiAgent] Received empty content and no tool calls. Breaking loop.');
                break;
            }

            // Add assistant message to history context
            // Note: Adapter returns clean content/toolCalls. converting back to message object for history
            const assistantMessage = { role: 'assistant', content: content };
            if (toolCalls && toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;

            messages.push(assistantMessage);

            if (toolCalls && toolCalls.length > 0) {
                // Handle Tool Calls
                console.log(`[Tool] Processing ${toolCalls.length} tool calls...`);

                for (const toolCall of toolCalls) {
                    const funcName = toolCall.function.name;
                    const argsString = toolCall.function.arguments;
                    let args = {};

                    try {
                        args = JSON.parse(argsString);
                    } catch (e) {
                        console.error(`[Tool] Failed to parse args for ${funcName}:`, e);
                        args = { error: 'Invalid JSON arguments' };
                    }

                    console.log(`[Tool] Executing ${funcName} with args:`, args);
                    let result;
                    try {
                        result = await executeTool(funcName, args);
                    } catch (err) {
                        result = JSON.stringify({ error: err.message });
                        console.error(`[Tool] Execution error:`, err);
                    }

                    // Push Tool Result
                    messages.push({
                        role: 'tool',
                        name: funcName,
                        content: result,
                        toolCallId: toolCall.id
                    });
                }
                // Loop continues to get next response from AI
            } else {
                // Final response
                finalContent = content;
                finished = true;
            }

        } catch (error) {
            const status = error?.status || error?.httpStatus;
            const errMsg = error?.message || '';
            const isQuotaError = status === 429
                || errMsg.includes('RESOURCE_EXHAUSTED')
                || errMsg.includes('"code":429')
                || errMsg.toLowerCase().includes('quota');

            if (isQuotaError && lumiModelIdx < lumiModels.length - 1) {
                const nextModel = lumiModels[lumiModelIdx + 1];
                console.warn(`[LumiAgent] Quota exhausted on ${lumiModels[lumiModelIdx]}, falling back to ${nextModel}`);
                lumiModelIdx++;
                iterations--; // retry this iteration with the fallback model
                continue;
            }

            console.error("Error in Lumi Agent loop:", error);
            return {
                response: finalContent || '',
                trace: messages,
                usage: totalUsage,
                provider: finalProvider,
                model: finalModel
            };
        }
    }

    return {
        response: finalContent || '',
        trace: messages,
        usage: totalUsage,
        provider: finalProvider,
        model: finalModel
    };
}

// ============================================================================
// LOGIC: TRIGGER RESPONSE
// ============================================================================

async function triggerLumiResponse(channel, lastMessage, targetIds = [], options = {}) {
    const contextId = channel.id;
    const debugMode = getDebugMode(contextId);

    // IMPORTANT: Get formatted history for Lumi
    const history = getFormattedHistory(contextId);

    // Context for System Prompt Injection
    const promptContext = {
        channel: channel,
        guild: channel.guild,
        client: channel.client,
        model: getConfig().model
    };

    console.log(`[Trigger] Lumi response for ${contextId}. Targets: ${targetIds.join(',')}`);

    // DEBUG: Full trace
    if (debugMode === 'full') {
        let systemMsg = await getLumiSystemMessage(promptContext);
        if (targetIds.length > 0) systemMsg += `\n\n[REPLY TO MESSAGE_IDs]: ${targetIds.join(', ')}`;

        // System Prompt Attachment
        await sendDebugAttachment(channel, `⚙️ LUMI SYSTEM PROMPT`, systemMsg);

        // Input History Attachment (No system prompt)
        const historyDebug = history.slice().reverse().map(m => `[${m.role}]: ${m.content}`).join('\n\n---\n\n');
        await sendDebugAttachment(channel, `🤖 LUMI INPUT HISTORY`, historyDebug);
    }

    try {
        // Generate response
        console.log(`[Trigger] Calling callLumiAgent...`);
        const { response: finalResponse, trace, usage, provider, model } = await callLumiAgent(history, targetIds, promptContext, options);
        console.log(`[Trigger] output received. Response length: ${finalResponse ? finalResponse.length : 0}`);

        // DEBUG: Full trace including tools
        if (debugMode === 'full' && trace) {
            const fullTrace = trace
                .filter(m => m.role !== 'system') // Filter out system prompt
                .slice().reverse()
                .map(m => {
                    if (m.role === 'tool') {
                        return `[TOOL RESULT] (${m.name}): ${m.content}`;
                    }
                    if (m.toolCalls) {
                        const calls = m.toolCalls.map(c => `${c.function.name}(${c.function.arguments})`).join(', ');
                        return `[ASSISTANT TOOL CALLS]: ${calls}`;
                    }
                    return `[${m.role.toUpperCase()}]: ${m.content}`;
                }).join('\n\n---\n\n');

            await sendDebugAttachment(channel, `🛠️ LUMI TRACE (Tools & History)`, fullTrace);
        }

        const rawResponse = finalResponse;
        if (!rawResponse) return;

        const parsed = parseAIResponse(rawResponse);
        if (parsed.messages && parsed.messages.length > 0) {
            for (const msg of parsed.messages) {
                if (msg.send_text && msg.text_content) {
                    const sentMsg = await sendTextMessage(channel, msg);
                    // Usar el ID real si se envió, sino fallback
                    const realId = sentMsg ? sentMsg.id : null;
                    addAssistantMessage(contextId, msg.text_content, realId, { usage, provider, model });

                    // Small delay to ensure order in Discord if rapid fire?
                    // await new Promise(r => setTimeout(r, 200)); 
                    // Not strictly necessary if await sendTextMessage waits for API. Await is sufficient.
                }

                if (msg.reaction) {
                    let reactionTarget = lastMessage;
                    if (msg.reply_to && msg.reply_to !== lastMessage.id && msg.reply_to.toLowerCase() !== 'null') {
                        try {
                            reactionTarget = await channel.messages.fetch(msg.reply_to);
                        } catch (e) {
                            console.warn(`Could not fetch message ${msg.reply_to} for reaction:`, e.message);
                        }
                    }
                    await sendReactions(reactionTarget, msg.reaction);
                }
            }
        }

        await handleDebugOutput(debugMode, channel, lastMessage, rawResponse, { usage, provider, model });

        // Trigger personality evolution evaluation in the background (do not await)
        checkAndEvolvePersonality(channel, history).catch(err => {
            console.error('[BackgroundEvolution] Error in dynamic personality evolution:', err);
        });

    } catch (error) {
        console.error("Lumi error:", error);
        if (debugMode) await channel.send(`**Error**: ${error.message}`);
    }
}

// ============================================================================
// BACKGROUND MEDIA PROCESSING
// ============================================================================

/**
 * Procesa videos de YouTube en segundo plano.
 * Avisa al usuario, extrae resumen y lo inyecta en el historial.
 */
async function processBackgroundMedia(channel, originalMsg, mediaItem) {
    const contextId = channel.id;
    const userName = originalMsg.member?.displayName || originalMsg.author.username;

    try {
        // 1. Avisar que empezamos
        const statusMsg = await channel.send(`👀 **Lumi está viendo el video de ${userName}...**\nEsto puede tomar unos segundos.`);

        // 2. Etiqueta temporal en el historial
        const tempNote = `\n\n[Estado: Lumi está procesando este video en segundo plano. Aún no está listo.]`;
        const currentMsgContent = originalMsg.content;
        updateMessageContent(contextId, originalMsg.id, currentMsgContent + tempNote);

        // 3. Procesar con Gemini
        const summary = await summarizeYouTubeVideo(mediaItem.url);

        // 4. Inyectar resumen real
        const finalNote = `\n\n[Resumen Automático del Video extraído por el sistema]:\n${summary}`;
        updateMessageContent(contextId, originalMsg.id, currentMsgContent + finalNote);

        // 5. Avisar que terminó
        await statusMsg.edit(`✅ **¡Ya terminé de ver el video de ${userName}!**\n¿Qué quieres saber sobre él?`);

    } catch (err) {
        console.error(`[BackgroundMedia] Error processing video:`, err);
        // Opcional: avisar del error
    }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function handlePassiveMessage(messages) {
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1];
    const contextId = lastMessage.channel.id;
    const debugMode = getDebugMode(contextId);

    // 1. Save messages (Status: PENDING)
    const userMsgs = extractUserMessages(msgs);
    addUserMessages(contextId, userMsgs);

    // 2. Get all Unprocessed
    const unprocessed = getUnprocessedMessages(contextId);
    if (unprocessed.length === 0) return;

    // Check for Direct Agent Mode
    const isDirectMention = lastMessage.mentions.has(lastMessage.client.user);
    if (isDirectMention) {
        console.log("--- DIRECT AGENT MODE ---");
        const respondIds = unprocessed.map(m => m.id);
        updateMessageStatus(contextId, respondIds, MSG_STATUS.PROCESSED, { 
            decision: 'RESPONDER', 
            reason: 'Direct Mention (Agent Mode)', 
            decisionModel: 'Bypass' 
        });
        
        // --- BACKGROUND MEDIA LOGIC ---
        // Buscamos si hay videos de YouTube en los mensajes dirigidos a Lumi
        let hasVideo = false;
        for (const msgData of unprocessed) {
            const ytMedia = msgData.mediaAttachments?.find(m => m.type === 'youtube');
            if (ytMedia) {
                // Encontrar el objeto de mensaje de Discord correspondiente
                const discordMsg = msgs.find(m => m.id === msgData.id) || lastMessage;
                // Lanzar en background (no await!)
                processBackgroundMedia(lastMessage.channel, discordMsg, ytMedia);
                hasVideo = true;
            }
        }

        // Si hay video, ya enviamos el aviso de "Viendo...", así que no disparamos respuesta de Lumi inmediata
        // a menos que quieras que TAMBIÉN responda algo extra. 
        // Según el usuario: "que lumi diga entretanto que lo esta viendo... y luego si se le pregunta responder"
        if (!hasVideo) {
            await triggerLumiResponse(lastMessage.channel, lastMessage, respondIds, { bypassPersonality: true });
        }
        return;
    }

    // 3. Decision Agent
    const history = getDecisionHistory(contextId);
    console.log("--- DECISION AGENT (Binary) ---");
    const decisionResult = await callDecisionAgent(history, unprocessed);

    console.log(`Decision Reason: ${decisionResult.reason}`);
    decisionResult.decisions.forEach(d => console.log(` -> MSG ${d.id}: ${d.action}`));

    if (debugMode === 'full' || debugMode === 'decisions') {
        await sendDebugAttachment(lastMessage.channel, '🧠 DECISION',
            `Input:\n${decisionResult.contextSent}\n\nOutput:\n${decisionResult.rawResponse}`,
            lastMessage.id);
    }

    // 4. Process Decisions
    const respondIds = [];
    const ignoreIds = [];

    decisionResult.decisions.forEach(d => {
        if (d.action === 'RESPONDER') {
            respondIds.push(d.id);
        } else {
            // IGNORAR, ESPERAR (fallback), COMBINADO (fallback) -> All treated as processed/ignored
            ignoreIds.push(d.id);
        }
    });

    // Update States
    if (respondIds.length > 0) updateMessageStatus(contextId, respondIds, MSG_STATUS.PROCESSED, { decision: 'RESPONDER', reason: decisionResult.reason, decisionModel: decisionResult.decisionModel });
    if (ignoreIds.length > 0) updateMessageStatus(contextId, ignoreIds, MSG_STATUS.PROCESSED, { decision: 'IGNORAR', reason: decisionResult.reason, decisionModel: decisionResult.decisionModel });

    // 5. Execution Logic
    if (respondIds.length > 0) {
        // Trigger Lumi immediately
        await triggerLumiResponse(lastMessage.channel, lastMessage, respondIds);
    } else {
        console.log("[Decision] All messages ignored.");
    }
}
