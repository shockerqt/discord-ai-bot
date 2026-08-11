/**
 * Mention Handler - Único punto de entrada del bot conversacional.
 *
 * Pipeline: mención -> contexto leído de Discord -> agente (con tools) -> respuesta.
 * No hay decision agent ni modos aleatorios: la mención ES la decisión de responder.
 */
import { ChatProviderFactory } from '../services/ai/ChatProviderFactory.js';
import { getSystemMessage, getAgentParams } from '../utils/agentManager.js';
import { buildConversationContext, renderHistory, extractMedia } from '../utils/contextBuilder.js';
import { getToolDefinitions, executeTool } from '../utils/tools/registry.js';
import { getConfig, getContextLimit } from '../utils/configStore.js';
import { getDebugMode } from '../commands/debug.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';
import { summarizeYouTubeVideo } from '../services/media/mediaProcessor.js';

const MAX_TOOL_ITERATIONS = 10;

// Modelos de respaldo si el principal se queda sin cuota o está sobrecargado
const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

// ============================================================================
// DEBUG
// ============================================================================

function wrapText(text, width = 100) {
    if (!text) return '';
    return text.split('\n').map(line => {
        if (line.length <= width) return line;
        const words = line.split(' ');
        let result = '', currentLine = words[0];
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

async function sendDebugAttachment(channel, label, content, replyTo = null) {
    const buffer = Buffer.from('﻿' + wrapText(content), 'utf-8');
    const options = {
        content: `**[${label}]**`,
        files: [{ attachment: buffer, name: `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt` }]
    };
    if (replyTo) options.reply = { messageReference: replyTo };
    try {
        await channel.send(options);
    } catch (err) {
        console.error(`Failed to send ${label} debug:`, err);
    }
}

async function sendResponseDebug(debugMode, channel, message, rawResponse, metadata = {}) {
    if (debugMode === 'full') {
        let metaInfo = '';
        if (metadata.usage) {
            metaInfo += `\n**Meta Info**\n`;
            metaInfo += `Provider: \`${metadata.provider || 'Unknown'}\` | Model: \`${metadata.model || 'Unknown'}\`\n`;
            metaInfo += `Tokens: Prompt: ${metadata.usage.promptTokens}, Completion: ${metadata.usage.completionTokens}, Total: ${metadata.usage.totalTokens}`;
        }
        await sendDebugOutput(channel, rawResponse, metaInfo);
    } else if (debugMode === 'thoughts') {
        const thought = rawResponse.match(/<THOUGHT>([\s\S]*?)<\/THOUGHT>/i);
        if (thought) await sendDebugAttachment(channel, '💭 THOUGHT', thought[1].trim(), message.id);
    }
}

// ============================================================================
// AGENTE
// ============================================================================

/**
 * Llama al modelo con soporte de tools, iterando hasta que devuelva una respuesta final.
 * @param {Array<Object>} history - Historial de conversación
 * @param {Object} context - Contexto para el system prompt { channel, guild, client }
 * @returns {Promise<{response: string, trace: Array, usage: Object, provider: string, model: string}>}
 */
async function callAgent(history, context = {}) {
    const provider = ChatProviderFactory.createProvider();
    const messages = [
        { role: 'system', content: await getSystemMessage(context) },
        ...history
    ];

    const params = getAgentParams();
    const tools = getToolDefinitions();

    const primaryModel = context.model || getConfig().model;
    const models = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];
    let modelIndex = 0;

    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finalContent = '';
    let finalProvider = '';
    let finalModel = '';
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;
        const currentModel = models[modelIndex];

        try {
            console.log(`[Agent] Iteración ${iterations} con modelo ${currentModel}${modelIndex > 0 ? ' (fallback)' : ''}`);
            const response = await provider.complete(messages, {
                model: currentModel,
                tools,
                toolChoice: 'auto',
                temperature: params.temperature,
                presencePenalty: params.presence_penalty,
                frequencyPenalty: params.frequency_penalty
            });

            const { content, toolCalls } = response;

            if (response.usage) {
                usage.promptTokens += response.usage.promptTokens || 0;
                usage.completionTokens += response.usage.completionTokens || 0;
                usage.totalTokens += response.usage.totalTokens || 0;
            }
            finalProvider = response.provider || finalProvider;
            finalModel = response.model || finalModel;

            if (!content && (!toolCalls || toolCalls.length === 0)) {
                console.warn('[Agent] Respuesta vacía y sin tool calls. Cortando el loop.');
                break;
            }

            const assistantMessage = { role: 'assistant', content };
            if (toolCalls?.length > 0) assistantMessage.toolCalls = toolCalls;
            messages.push(assistantMessage);

            if (!toolCalls || toolCalls.length === 0) {
                finalContent = content;
                break;
            }

            for (const toolCall of toolCalls) {
                const name = toolCall.function.name;
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments);
                } catch (err) {
                    console.error(`[Tool] Argumentos inválidos para ${name}:`, err.message);
                    args = { error: 'Invalid JSON arguments' };
                }

                console.log(`[Tool] Ejecutando ${name}`, args);
                let result;
                try {
                    result = await executeTool(name, args);
                } catch (err) {
                    console.error(`[Tool] Error ejecutando ${name}:`, err);
                    result = JSON.stringify({ error: err.message });
                }

                messages.push({ role: 'tool', name, content: result, toolCallId: toolCall.id });
            }

        } catch (error) {
            if (shouldFallback(error) && modelIndex < models.length - 1) {
                console.warn(`[Agent] ${models[modelIndex]} no disponible (${error.message}), probando ${models[modelIndex + 1]}`);
                modelIndex++;
                iterations--; // reintentar esta iteración con el modelo de respaldo
                continue;
            }
            console.error('[Agent] Error irrecuperable:', error);
            break;
        }
    }

    return { response: finalContent || '', trace: messages, usage, provider: finalProvider, model: finalModel };
}

/**
 * Decide si un error justifica cambiar de modelo (cuota agotada o servicio saturado).
 */
function shouldFallback(error) {
    const status = error?.status || error?.httpStatus;
    const message = (error?.message || '').toLowerCase();
    return status === 429 || status === 503
        || message.includes('resource_exhausted')
        || message.includes('"code":429')
        || message.includes('"code":503')
        || message.includes('quota')
        || message.includes('high demand')
        || message.includes('overloaded');
}

// ============================================================================
// MEDIA
// ============================================================================

/**
 * Si la mención trae un video de YouTube, lo resume antes de responder.
 * Avisa en el canal porque puede tardar varios segundos.
 * @returns {Promise<string>} Nota para inyectar en el prompt (vacía si no aplica)
 */
async function resolveVideoContext(message) {
    const video = extractMedia(message)?.find(m => m.type === 'youtube');
    if (!video) return '';

    const notice = await message.channel.send('👀 **Estoy viendo el video...** dame unos segundos.')
        .catch(() => null);

    try {
        const summary = await summarizeYouTubeVideo(video.url);
        await notice?.delete().catch(() => { });
        return `[Resumen automático del video ${video.url}, extraído por el sistema]:\n${summary}`;
    } catch (err) {
        console.error('[Media] No se pudo resumir el video:', err.message);
        await notice?.edit('⚠️ No pude ver el video, respondo con lo que dice el chat.').catch(() => { });
        return `[El sistema no pudo procesar el video ${video.url}. Dile al usuario que no pudiste verlo.]`;
    }
}

// ============================================================================
// ENTRADA PRINCIPAL
// ============================================================================

/**
 * Responde a una mención directa al bot.
 * @param {import('discord.js').Message} message - Mensaje que mencionó al bot
 */
export async function handleMention(message) {
    const channel = message.channel;
    const debugMode = getDebugMode(channel.id);

    console.log(`[Mention] ${message.author?.username} en #${channel.name ?? channel.id}`);

    // Indicador de "escribiendo..." mientras se genera la respuesta
    channel.sendTyping?.().catch(() => { });

    const promptContext = {
        channel,
        guild: channel.guild,
        client: message.client,
        model: getConfig().model
    };

    try {
        const extraNote = await resolveVideoContext(message);
        // Resumir un video tarda más que el indicador de escritura: refrescarlo
        if (extraNote) channel.sendTyping?.().catch(() => { });

        const history = await buildConversationContext(message, {
            limit: getContextLimit(),
            extraNote
        });

        if (debugMode === 'full') {
            await sendDebugAttachment(channel, '⚙️ SYSTEM PROMPT', await getSystemMessage(promptContext));
            await sendDebugAttachment(channel, '💬 CONTEXTO ENVIADO', renderHistory(history));
        }

        const { response, trace, usage, provider, model } = await callAgent(history, promptContext);

        if (debugMode === 'full' && trace) {
            const toolTrace = trace
                .filter(m => m.role === 'tool' || m.toolCalls)
                .map(m => m.role === 'tool'
                    ? `[TOOL RESULT] (${m.name}): ${m.content}`
                    : `[TOOL CALLS]: ${m.toolCalls.map(c => `${c.function.name}(${c.function.arguments})`).join(', ')}`)
                .join('\n\n');
            if (toolTrace) await sendDebugAttachment(channel, '🛠️ TOOL TRACE', toolTrace);
        }

        if (!response) {
            console.warn('[Mention] El modelo no devolvió respuesta.');
            return;
        }

        const parsed = parseAIResponse(response);

        let isFirst = true;
        for (const output of parsed.messages) {
            if (output.text_content || output.attachment) {
                // Solo el primer mensaje se envía como reply, para no repetir la cita
                await sendTextMessage(channel, { ...output, reply_to: isFirst ? message.id : null });
                isFirst = false;
            }
            if (output.reaction) {
                await sendReactions(message, output.reaction);
            }
        }

        await sendResponseDebug(debugMode, channel, message, response, { usage, provider, model });

    } catch (error) {
        console.error('[Mention] Error procesando la mención:', error);
        if (debugMode && debugMode !== 'off') {
            await channel.send(`**Error**: ${error.message}`).catch(() => { });
        }
    }
}
