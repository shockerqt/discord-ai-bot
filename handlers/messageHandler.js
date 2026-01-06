/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Pipeline: Save -> Decision (Wait/Respond) -> Scheduler -> Lumi -> Response
 */
import { Mistral } from '@mistralai/mistralai';
import { getLumiSystemMessage, getDecisionSystemMessage, getLumiParams } from '../utils/agentManager.js';
import { getMessages, addUserMessages, addAssistantMessage } from '../utils/messageStore.js';
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
        for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= width) {
                currentLine = (currentLine + ' ' + word).trim();
            } else {
                if (currentLine) result += currentLine + '\n';
                currentLine = word;
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

function buildMessageContent(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => {
        const author = msg.member?.displayName || msg.author.username;
        return `[${now}] ${author}: ${msg.content}`;
    }).join('\n');
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
 * Call Decision Agent
 * Returns: { status: 'RESPONDER'|'ESPERAR'|'IGNORAR', reason: string, ... }
 */
async function callDecisionAgent(history, currentMessage) {
    let contextContent = '';
    if (history.length > 0) {
        contextContent += '--- CONVERSATION HISTORY ---\n' + history.map(m => `[${m.role}]: ${m.content}`).join('\n') + '\n\n';
    }
    contextContent += '--- CURRENT MESSAGE ---\n' + currentMessage;

    try {
        const response = await client.chat.complete({
            model: MODEL,
            messages: [
                { role: 'system', content: getDecisionSystemMessage() },
                ...history,
                { role: 'user', content: currentMessage }
            ],
            temperature: 0.1
        });

        const content = response.choices?.[0]?.message?.content || '';
        const decisionMatch = content.match(/<DECISION>(.*?)<\/DECISION>/i);
        const reasonMatch = content.match(/<REASON>(.*?)<\/REASON>/i);

        let decision = decisionMatch?.[1]?.trim().toUpperCase() || 'IGNORAR';
        const reason = reasonMatch?.[1]?.trim() || 'Sin razón';

        // Normalize decision (fallback to IGNORAR if unknown)
        if (!['RESPONDER', 'ESPERAR', 'IGNORAR'].includes(decision)) {
            decision = 'IGNORAR';
        }

        return { status: decision, reason, rawResponse: content, contextSent: contextContent };
    } catch (error) {
        console.error("Decision agent error:", error);
        return { status: 'IGNORAR', reason: 'Error en agente', rawResponse: '', contextSent: contextContent };
    }
}

async function callLumiAgent(historyMessages) {
    const params = getLumiParams();
    const response = await client.chat.complete({
        model: MODEL,
        messages: [
            { role: 'system', content: getLumiSystemMessage() },
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

/**
 * Executes the actual response generation (Lumi)
 */
async function triggerLumiResponse(channel, lastMessage) {
    const contextId = channel.id;
    const debugMode = getDebugMode(contextId);
    const history = getMessages(contextId);

    console.log(`[Trigger] Executing Lumi response for ${contextId}`);

    // Debug: Show Input
    if (debugMode === 'full') {
        const systemMsg = getLumiSystemMessage();
        const historyDebug = `[SYSTEM MESSAGE]\n${systemMsg}\n\n---\n\n` +
            history.map(m => `[${m.role}]: ${m.content}`).join('\n\n---\n\n');
        await sendDebugAttachment(channel, `🤖 LUMI INPUT (${history.length} msgs)`, historyDebug);
    }

    try {
        const rawResponse = await callLumiAgent(history);

        if (!rawResponse) {
            console.log("[Lumi] Empty response.");
            return;
        }

        console.log("--- RAW RESPONSE ---");
        console.log(rawResponse);

        const parsed = parseAIResponse(rawResponse);
        console.log("--- PARSED ---", parsed);

        if (parsed.send_text && parsed.text_content) {
            addAssistantMessage(contextId, parsed.text_content);
        }

        await handleDebugOutput(debugMode, channel, lastMessage, rawResponse);
        await sendTextMessage(channel, parsed);
        await sendReactions(lastMessage, parsed.reaction);

    } catch (error) {
        console.error("Lumi agent error:", error);
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

    // 1. Save messages always
    const userMsgs = extractUserMessages(msgs);
    addUserMessages(contextId, userMsgs);

    // 2. Decision Agent
    const messageContent = buildMessageContent(msgs);
    const history = getMessages(contextId);

    console.log("--- DECISION AGENT ---");
    const decision = await callDecisionAgent(history, messageContent);
    console.log(`Decision: ${decision.status} - ${decision.reason}`);

    // Debug Decision
    if (debugMode === 'full') {
        const decisionDebug = `[INPUT TO DECISION AGENT]
${decision.contextSent}

[RAW OUTPUT]
${decision.rawResponse}`;
        await sendDebugAttachment(lastMessage.channel, `🧠 DECISION (${decision.status})`, decisionDebug, lastMessage.id);
    }

    // 3. Act on Decision
    if (decision.status === 'RESPONDER') {
        // Cancel any waiting timer and respond immediately
        cancelPendingResponse(contextId);
        await triggerLumiResponse(lastMessage.channel, lastMessage);
    }
    else if (decision.status === 'ESPERAR') {
        // Schedule response in 10s (resets if already waiting)
        console.log(`[Scheduler] Waiting 10s for more context...`);
        scheduleResponse(contextId, 10000, () => {
            triggerLumiResponse(lastMessage.channel, lastMessage);
        });
    }
    else { // IGNORAR
        console.log("[Decision] Ignoring message.");
        // We DO NOT cancel pending responses here. 
        // If user said "Hello" (WAIT) then "jajaja" (IGNORE), we still want to answer "Hello" after timeout.
        // UNLESS the ignore reason implies the conversation ended? 
        // For safety, let's keep the pending timeout alive.
    }
}
