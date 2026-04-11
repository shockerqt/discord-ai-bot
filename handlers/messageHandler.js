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
import { getConfig } from '../utils/configStore.js';

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

export function extractUserMessages(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => ({
        userId: msg.author.id,
        userName: msg.member?.displayName || msg.author.username,
        content: msg.content,
        timestamp: now,
        messageId: msg.id,
        replyTo: msg.reference?.messageId || null
    }));
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
 */
async function callDecisionAgent(history, unprocessedMessages, model = null) {
    const aiProvider = ChatProviderFactory.createProvider();
    const activeModel = model || aiProvider.decisionModel;

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

    try {
        const response = await aiProvider.complete([
            { role: 'system', content: getDecisionSystemMessage() },
            { role: 'user', content: contextContent }
        ], {
            model: activeModel,
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

        // Fallback
        if (decisions.length === 0) {
            if (content.includes('RESPONDER')) {
                unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'RESPONDER' }));
            } else {
                unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'IGNORAR' }));
            }
        }

        return { decisions, reason, rawResponse: content, contextSent: contextContent };

    } catch (error) {
        console.error("Decision agent error:", error);
        // Default safe action: Ignore to avoid loops on error, or Respond?
        // Let's safe fail to Ignore.
        return {
            decisions: unprocessedMessages.map(m => ({ id: m.id, action: 'IGNORAR' })),
            reason: 'Error en agente',
            rawResponse: '', contextSent: contextContent
        };
    }
}

/**
 * Call Lumi Agent
 */
import { getToolDefinitions, executeTool } from '../utils/tools/registry.js';

/**
 * Call Lumi Agent with Tool Support
 */
async function callLumiAgent(historyMessages, targetIds = [], context = {}) {
    const aiProvider = ChatProviderFactory.createProvider();
    let systemContent = await getLumiSystemMessage(context);

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

    while (!finished && iterations < MAX_ITERATIONS) {
        iterations++;

        try {
            const currentModel = context.model || 'mistral-small-latest';
            console.log(`[LumiAgent] Iteration ${iterations}. Sending to AI using model: ${currentModel}...`);
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
            console.error("Error in Lumi Agent loop:", error);
            // If error occurs, return what we have or generic error
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

async function triggerLumiResponse(channel, lastMessage, targetIds = []) {
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
        const { response: finalResponse, trace, usage, provider, model } = await callLumiAgent(history, targetIds, promptContext);
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
                    addAssistantMessage(contextId, msg.text_content, realId);

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

    } catch (error) {
        console.error("Lumi error:", error);
        if (debugMode) await channel.send(`**Error**: ${error.message}`);
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
    if (respondIds.length > 0) updateMessageStatus(contextId, respondIds, MSG_STATUS.PROCESSED);
    if (ignoreIds.length > 0) updateMessageStatus(contextId, ignoreIds, MSG_STATUS.PROCESSED);

    // 5. Execution Logic
    if (respondIds.length > 0) {
        // Trigger Lumi immediately
        await triggerLumiResponse(lastMessage.channel, lastMessage, respondIds);
    } else {
        console.log("[Decision] All messages ignored.");
    }
}
