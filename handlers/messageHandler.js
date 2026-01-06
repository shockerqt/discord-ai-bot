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
import { scheduleResponse, cancelPendingResponse } from '../utils/responseScheduler.js';

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

function extractUserMessages(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => ({
        userId: msg.author.id,
        userName: msg.member?.displayName || msg.author.username,
        content: msg.content,
        timestamp: now,
        messageId: msg.id
    }));
}

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
 * Call Decision Agent with granular message control
 * Returns: { decisions: [{id: string, action: string}], reason: string }
 */
async function callDecisionAgent(history, unprocessedMessages) {
    // Build context
    let contextContent = '';

    // 1. History (Processed context)
    if (history.length > 0) {
        contextContent += '--- CONVERSATION HISTORY (Context) ---\n';
        // Basic reformatting for decision agent (just role: content)
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
        // <MSG id="123" action="RESPONDER" />
        const decisions = [];
        const msgRegex = /<MSG\s+id="([^"]+)"\s+action="([^"]+)"\s*\/>/gi;
        let match;
        while ((match = msgRegex.exec(content)) !== null) {
            decisions.push({ id: match[1], action: match[2].toUpperCase() });
        }

        const reasonMatch = content.match(/<REASON>(.*?)<\/REASON>/i);
        const reason = reasonMatch?.[1]?.trim() || 'Sin razón';

        // Fallback if generic IGNORAR/ESP/RESP found but no strict XML
        if (decisions.length === 0) {
            if (content.includes('RESPONDER')) {
                unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'RESPONDER' }));
            } else if (content.includes('ESPERAR')) {
                unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'ESPERAR' }));
            } else {
                unprocessedMessages.forEach(m => decisions.push({ id: m.id, action: 'IGNORAR' }));
            }
        }

        return { decisions, reason, rawResponse: content, contextSent: contextContent };

    } catch (error) {
        console.error("Decision agent error:", error);
        // Default safe action: Wait to avoid losing messages due to error
        return {
            decisions: unprocessedMessages.map(m => ({ id: m.id, action: 'ESPERAR' })),
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
        systemContent += `\n\nSYSTEM UPDATE: You are responding to a batch of messages. Focus specifically on these message IDs: ${targetIds.join(', ')}.`;
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

    // 1. Save messages (Status: PENDING)
    const userMsgs = extractUserMessages(msgs);
    addUserMessages(contextId, userMsgs);

    // 2. Get all Unprocessed (PENDING + WAITING)
    const unprocessed = getUnprocessedMessages(contextId);
    if (unprocessed.length === 0) return; // Should not happen

    // 3. Decision Agent
    const history = getFormattedHistory(contextId); // Context history
    console.log("--- DECISION AGENT (Granular) ---");
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
    const waitIds = [];
    const ignoreIds = [];

    decisionResult.decisions.forEach(d => {
        if (d.action === 'RESPONDER') respondIds.push(d.id);
        else if (d.action === 'ESPERAR') waitIds.push(d.id);
        else ignoreIds.push(d.id);
    });

    // Update States
    if (respondIds.length > 0) updateMessageStatus(contextId, respondIds, MSG_STATUS.PROCESSED);
    if (ignoreIds.length > 0) updateMessageStatus(contextId, ignoreIds, MSG_STATUS.PROCESSED);
    if (waitIds.length > 0) updateMessageStatus(contextId, waitIds, MSG_STATUS.WAITING);

    // 5. Execution Logic

    // Determine overall status for logging
    const hasResponse = respondIds.length > 0;
    const hasWait = waitIds.length > 0;

    if (hasResponse) {
        // Trigger Lumi immediately for the ones that need response
        cancelPendingResponse(contextId); // Cancel previous timer

        // If we also have waiting messages, we should probably start a new timer for them?
        // OR, if we are responding, maybe we should respond to EVERYTHING now to avoid fragmentation?
        // Current logic: Respond only to 'respondIds'. 'waitIds' stay waiting.

        await triggerLumiResponse(lastMessage.channel, lastMessage, respondIds);

        // If there are lingering wait items left behind, start a timer for them
        if (hasWait) {
            console.log(`[Scheduler] Keeping timer needed for ${waitIds.length} waiting messages.`);
            scheduleResponse(contextId, 10000, () => handleTimeout(contextId, lastMessage.channel));
        }
    } else if (hasWait) {
        // No response, but waiting -> Start/Reset Timer
        console.log(`[Scheduler] Waiting 10s for ${waitIds.length} messages...`);
        scheduleResponse(contextId, 10000, () => handleTimeout(contextId, lastMessage.channel));
    } else {
        // All ignored
        console.log("[Decision] All messages ignored.");
        // Should we cancel timer? Converting everything to ignore generally means "done".
        // But if there was a timer running for previous messages, and we just ignored NEW ones, 
        // we shouldn't kill the old timer unless the old ones were also considered here.
        // Processed messages are handled.
    }
}

/**
 * Handle Timeout (force process remaining waiting messages)
 */
async function handleTimeout(contextId, channel) {
    console.log(`[Timeout] Force processing waiting messages for ${contextId}`);

    const waitingMessages = getUnprocessedMessages(contextId);
    if (waitingMessages.length === 0) return;

    const ids = waitingMessages.map(m => m.id);

    // Mark all as processed
    updateMessageStatus(contextId, ids, MSG_STATUS.PROCESSED);

    // Trigger Lumi
    // Need a dummy message object for lastMessage? Or just use null and handle safe in trigger
    // We pass null as lastMessage for reply context if not available, but triggerLumiResponse needs lastMessage for reactions.
    // Ideally we should cache last message object or fetch it.
    // For now, we will try to fetch or just error safe.

    try {
        // Hack: triggerLumiResponse needs a message object mostly for channel.send and reactions.
        // We have channel object. We don't have msg object for reactions if we don't fetch it.
        // Passing { channel, id: null } allows sending text but fail reactions.
        const dummyMsg = { channel, id: null };
        await triggerLumiResponse(channel, dummyMsg, ids);
    } catch (e) {
        console.error("Timeout trigger error:", e);
    }
}
