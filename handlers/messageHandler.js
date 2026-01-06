/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Pipeline: Decision Agent -> Lumi Agent -> Discord Response
 * Usando Chat Completions API
 */
import { Mistral } from '@mistralai/mistralai';
import { getLumiSystemMessage, getDecisionSystemMessage, getLumiParams } from '../utils/agentManager.js';
import { getMessages, addUserMessage, addAssistantMessage } from '../utils/messageStore.js';
import { getDebugMode } from '../commands/debug.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
const MODEL = process.env.MISTRAL_MODEL || 'mistral-medium-latest';

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
 * Build message context from Discord messages
 */
function buildMessageContext(msgs) {
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    return msgs.map(msg => {
        const author = msg.member?.displayName || msg.author.username;
        return `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${author}: ${msg.content}`;
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
    // Build context message for decision
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

/**
 * Handle debug output based on mode
 */
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
 * Pipeline: Decision -> Lumi -> Response
 */
export async function handlePassiveMessage(messages) {
    // Normalize to array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1];
    const contextId = lastMessage.channel.id;
    const debugMode = getDebugMode(contextId);

    // Build message context
    const messageContent = buildMessageContext(msgs);

    // ========== STEP 1: Decision Agent ==========
    console.log("--- DECISION AGENT ---");
    const history = getMessages(contextId);
    const decision = await callDecisionAgent(history, messageContent);
    console.log(`Decision: ${decision.shouldRespond ? 'RESPONDER' : 'IGNORAR'} - ${decision.reason}`);

    if (debugMode === 'full') {
        const decisionDebug = `========== DECISION CHAIN ==========

[INPUT TO DECISION AGENT]
${decision.contextSent}

[DECISION AGENT OUTPUT]
${decision.rawResponse}

[PARSED RESULT]
DECISION: ${decision.shouldRespond ? 'RESPONDER' : 'IGNORAR'}
REASON: ${decision.reason}`;
        await sendDebugAttachment(lastMessage.channel, '🧠 DECISION CHAIN', decisionDebug, lastMessage.id);
    }

    if (!decision.shouldRespond) {
        console.log("[Decision] Ignoring message.");
        return;
    }

    // ========== STEP 2: Add to History ==========
    addUserMessage(contextId, messageContent);
    const updatedHistory = getMessages(contextId);

    if (debugMode === 'full') {
        const historyDebug = updatedHistory.map(m => `[${m.role}]: ${m.content}`).join('\n\n---\n\n');
        await sendDebugAttachment(lastMessage.channel, `DEBUG INPUT (${updatedHistory.length} msgs)`, historyDebug);
    }

    // ========== STEP 3: Lumi Agent ==========
    console.log("--- LUMI AGENT ---");

    try {
        const rawResponse = await callLumiAgent(updatedHistory);

        if (!rawResponse) {
            console.log("[Lumi] Empty response received.");
            return;
        }

        console.log("--- RAW RESPONSE ---");
        console.log(rawResponse);

        // ========== STEP 4: Parse Response ==========
        const parsed = parseAIResponse(rawResponse);
        console.log("--- PARSED ---", parsed);

        // ========== STEP 5: Save to History ==========
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
