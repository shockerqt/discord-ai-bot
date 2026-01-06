/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Pipeline: Save -> Decision (Granular) -> Scheduler -> Lumi -> Response
 */
import { Mistral } from '@mistralai/mistralai';
import { getLumiSystemMessage, getDecisionSystemMessage, getLumiParams } from '../utils/agentManager.js';
import {
    getFormattedHistory,
    addUserMessages,
    addAssistantMessage,
    getUnprocessedMessages,
    updateMessageStatus,
    MSG_STATUS
} from '../utils/messageStore.js';
import { getDebugMode } from '../commands/debug.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

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
        messageId: msg.id
    }));
}

// ... (SendDebugAttachment and HandleDebugOutput omitted for brevity if unchanged, but I need to be careful with replace_file_content context matching)
// Actually I will target separate chunks.

// Chunk 1: Export extractUserMessages


async function sendDebugAttachment(channel, label, content, replyTo = null) {
    const buffer = Buffer.from('\uFEFF' + content, 'utf-8');
    const options = {
        content: `**[${label}]**`,
        files: [{ attachment: buffer, name: `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.txt` }]
    };
    if (replyTo) options.reply = { messageReference: replyTo };
    try { await channel.send(options); } catch (err) { console.error(`Failed to send ${label} debug:`, err); }
}

async function handleDebugOutput(debugMode, channel, lastMessage, contentStr) {
    if (debugMode === 'full') {
        await sendDebugOutput(channel, 'Chat Completions API', contentStr);
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
async function callDecisionAgent(history, unprocessedMessages) {
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
        const response = await client.chat.complete({
            model: MODEL,
            messages: [
                { role: 'system', content: getDecisionSystemMessage() },
                { role: 'user', content: contextContent }
            ],
            temperature: 0.1
        });

        const content = response.choices?.[0]?.message?.content || '';

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
async function callLumiAgent(historyMessages, targetIds = []) {
    let systemContent = getLumiSystemMessage();

    // Inject focus instructions if IDs present
    if (targetIds && targetIds.length > 0) {
        if (targetIds.length === 1) {
            systemContent += `\n\nSYSTEM UPDATE: You must respond specifically to the following message (identified by MsgID in history): ${targetIds[0]}.`;
        } else {
            // Even if we removed combined logic, we still tell Lumi "these messages caused the trigger"
            systemContent += `\n\nSYSTEM UPDATE: The interactions (identified by MsgID in history): ${targetIds.join(', ')} triggered this response. Address them.`;
        }
    }

    const params = getLumiParams();
    const response = await client.chat.complete({
        model: MODEL,
        messages: [
            { role: 'system', content: systemContent },
            ...historyMessages
        ],
        temperature: params.temperature,
        presence_penalty: params.presence_penalty,
        frequency_penalty: params.frequency_penalty
    });
    return response.choices?.[0]?.message?.content || '';
}

// ============================================================================
// LOGIC: TRIGGER RESPONSE
// ============================================================================

async function triggerLumiResponse(channel, lastMessage, targetIds = []) {
    const contextId = channel.id;
    const debugMode = getDebugMode(contextId);

    // IMPORTANT: Get formatted history for Lumi
    const history = getFormattedHistory(contextId);

    console.log(`[Trigger] Lumi response for ${contextId}. Targets: ${targetIds.join(',')}`);

    if (debugMode === 'full') {
        let systemMsg = getLumiSystemMessage();
        if (targetIds.length > 0) systemMsg += `\n\n[FOCUS IDs]: ${targetIds.join(', ')}`;
        const historyDebug = `[SYSTEM]\n${systemMsg}\n\n---\n\n` + history.map(m => `[${m.role}]: ${m.content}`).join('\n\n---\n\n');
        await sendDebugAttachment(channel, `🤖 LUMI INPUT`, historyDebug);
    }

    try {
        const rawResponse = await callLumiAgent(history, targetIds);
        if (!rawResponse) return;

        const parsed = parseAIResponse(rawResponse);
        if (parsed.send_text && parsed.text_content) {
            addAssistantMessage(contextId, parsed.text_content);
        }

        await handleDebugOutput(debugMode, channel, lastMessage, rawResponse);
        await sendTextMessage(channel, parsed);
        await sendReactions(lastMessage, parsed.reaction);

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

    // 1. Save messages (Status: PENDING) -> Now handled in discordClient.js
    // const userMsgs = extractUserMessages(msgs);
    // addUserMessages(contextId, userMsgs);

    // 2. Get all Unprocessed
    const unprocessed = getUnprocessedMessages(contextId);
    if (unprocessed.length === 0) return;

    // 3. Decision Agent
    const history = getFormattedHistory(contextId);
    console.log("--- DECISION AGENT (Binary) ---");
    const decisionResult = await callDecisionAgent(history, unprocessed);

    console.log(`Decision Reason: ${decisionResult.reason}`);
    decisionResult.decisions.forEach(d => console.log(` -> MSG ${d.id}: ${d.action}`));

    if (debugMode === 'full') {
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
