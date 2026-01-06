/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Pipeline: Save to History -> Decision Agent -> Lumi Agent -> Discord Response
 * Usando Chat Completions API
 */
import { Mistral } from '@mistralai/mistralai';
import { getLumiSystemMessage, getDecisionSystemMessage, getLumiParams } from '../utils/agentManager.js';
import { getMessages, addUserMessages, addAssistantMessage } from '../utils/messageStore.js';
import { getDebugMode } from '../commands/debug.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Word wrap text for better Discord preview
 */
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

/**
 * Convert Discord messages to structured format for messageStore
 */
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

/**
 * Build simple message content for display/debug
 */
function buildMessageContent(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => {
        const author = msg.member?.displayName || msg.author.username;
        return `[${now}] ${author}: ${msg.content}`;
    }).join('\n');
}

/**
 * Send a debug attachment to Discord
 */
async function sendDebugAttachment(channel, label, content, replyTo = null) {
    const buffer = Buffer.from('\uFEFF' + content, 'utf-8');
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

// ============================================================================
// DECISION AGENT - Uses chat.complete()
// ============================================================================

/**
 * Call the decision agent to determine if Lumi should respond
 */
async function callDecisionAgent(history, currentMessage) {
    // Build context for debug
    let contextContent = '';
    if (history.length > 0) {
        contextContent += '--- CONVERSATION HISTORY ---\n';
        contextContent += history.map(m => `[${m.role}]: ${m.content}`).join('\n');
        contextContent += '\n\n';
    }
    contextContent += '--- CURRENT MESSAGE ---\n';
    contextContent += currentMessage;

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

        return {
            shouldRespond: (decisionMatch?.[1]?.trim().toUpperCase() === 'RESPONDER'),
            reason: reasonMatch?.[1]?.trim() || 'Sin razón',
            rawResponse: content,
            contextSent: contextContent
        };
    } catch (error) {
        console.error("Decision agent error:", error);
        return { shouldRespond: false, reason: 'Error en agente', rawResponse: '', contextSent: contextContent };
    }
}

// ============================================================================
// LUMI AGENT - Uses chat.complete()
// ============================================================================

/**
 * Call the main Lumi agent with conversation history
 */
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
// DEBUG HANDLERS
// ============================================================================

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
// MAIN HANDLER
// ============================================================================

/**
 * Main entry point for passive message handling
 * Pipeline: Save to History -> Decision -> Lumi -> Response
 */
export async function handlePassiveMessage(messages) {
    // Normalize to array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1];
    const contextId = lastMessage.channel.id;
    const debugMode = getDebugMode(contextId);

    // ========== STEP 1: Save messages to history (ALWAYS) ==========
    const userMsgs = extractUserMessages(msgs);
    addUserMessages(contextId, userMsgs);

    // Build display content
    const messageContent = buildMessageContent(msgs);

    // ========== STEP 2: Get history and call Decision Agent ==========
    console.log("--- DECISION AGENT ---");
    const history = getMessages(contextId);
    const decision = await callDecisionAgent(history, messageContent);
    console.log(`Decision: ${decision.shouldRespond ? 'RESPONDER' : 'IGNORAR'} - ${decision.reason}`);

    if (debugMode === 'full') {
        const decisionDebug = `[INPUT TO DECISION AGENT]
${decision.contextSent}

[RAW OUTPUT]
${decision.rawResponse}`;
        await sendDebugAttachment(lastMessage.channel, '🧠 DECISION', decisionDebug, lastMessage.id);
    }

    if (!decision.shouldRespond) {
        console.log("[Decision] Ignoring message (already saved to history).");
        return;
    }

    // ========== STEP 3: Call Lumi Agent ==========
    console.log("--- LUMI AGENT ---");

    if (debugMode === 'full') {
        const systemMsg = getLumiSystemMessage();
        const historyDebug = `[SYSTEM MESSAGE]\n${systemMsg}\n\n---\n\n` +
            history.map(m => `[${m.role}]: ${m.content}`).join('\n\n---\n\n');
        await sendDebugAttachment(lastMessage.channel, `🤖 LUMI INPUT (${history.length} msgs)`, historyDebug);
    }

    try {
        const rawResponse = await callLumiAgent(history);

        if (!rawResponse) {
            console.log("[Lumi] Empty response received.");
            return;
        }

        console.log("--- RAW RESPONSE ---");
        console.log(rawResponse);

        // ========== STEP 4: Parse Response ==========
        const parsed = parseAIResponse(rawResponse);
        console.log("--- PARSED ---", parsed);

        // ========== STEP 5: Save assistant response to History ==========
        if (parsed.send_text && parsed.text_content) {
            addAssistantMessage(contextId, parsed.text_content);
        }

        // ========== STEP 6: Debug Output ==========
        await handleDebugOutput(debugMode, lastMessage.channel, lastMessage, rawResponse);

        // ========== STEP 7: Send Response ==========
        await sendTextMessage(lastMessage.channel, parsed);
        await sendReactions(lastMessage, parsed.reaction);

    } catch (error) {
        console.error("Lumi agent error:", error);
        if (debugMode) {
            await lastMessage.channel.send(`**Error**: ${error.message}`);
        }
    }
}
