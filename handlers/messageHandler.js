/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Usa cadena de agentes: Decision Agent -> Lumi
 */
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId, getDecisionAgentId } from '../utils/agentManager.js';
import { debugChannels } from '../commands/debug.js';

// Importar módulos del handler
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

/**
 * Llama al agente de decisión para determinar si Lumi debe responder
 * @param {string} messageContent - Contenido del mensaje a evaluar
 * @returns {Promise<{shouldRespond: boolean, reason: string}>}
 */
async function callDecisionAgent(messageContent) {
    try {
        const decisionAgentId = await getDecisionAgentId();

        const response = await client.beta.agents.complete({
            agentId: decisionAgentId,
            messages: [{ role: 'user', content: messageContent }]
        });

        const content = response.choices?.[0]?.message?.content || '';

        // Parse decision
        const decisionMatch = content.match(/<DECISION>(.*?)<\/DECISION>/i);
        const reasonMatch = content.match(/<REASON>(.*?)<\/REASON>/i);

        const decision = decisionMatch ? decisionMatch[1].trim().toUpperCase() : 'IGNORAR';
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Sin razón';

        return {
            shouldRespond: decision === 'RESPONDER',
            reason: reason,
            rawResponse: content
        };
    } catch (error) {
        console.error("Error calling decision agent:", error);
        // En caso de error, ignorar por seguridad
        return { shouldRespond: false, reason: 'Error en agente de decisión', rawResponse: '' };
    }
}

/**
 * Maneja mensajes pasivos del chat
 * @param {Object|Object[]} messages - Mensaje o array de mensajes de Discord
 */
export async function handlePassiveMessage(messages) {
    // Ensure array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1];
    const contextId = lastMessage.channel.id;
    const debugMode = debugChannels.get(contextId);

    // Construct Context from Batch
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    let messageContext = "--- CURRENT MESSAGES ---\n";

    for (const msg of msgs) {
        const authorName = msg.member ? msg.member.displayName : msg.author.username;
        messageContext += `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${authorName}: ${msg.content}\n`;
    }

    // 1. Call Decision Agent
    console.log("--- CALLING DECISION AGENT ---");
    const decision = await callDecisionAgent(messageContext);
    console.log(`Decision: ${decision.shouldRespond ? 'RESPONDER' : 'IGNORAR'} - ${decision.reason}`);

    // Debug: Show decision
    if (debugMode === 'full') {
        const decisionContent = `DECISION: ${decision.shouldRespond ? 'RESPONDER' : 'IGNORAR'}\nREASON: ${decision.reason}\n\n--- RAW ---\n${decision.rawResponse}`;
        const buffer = Buffer.from('\uFEFF' + decisionContent, 'utf-8');
        try {
            await lastMessage.channel.send({
                content: `**[🧠 DECISION AGENT]**`,
                files: [{
                    attachment: buffer,
                    name: `decision-${Date.now()}.txt`
                }],
                reply: { messageReference: lastMessage.id }
            });
        } catch (err) {
            console.error("Failed to send decision debug:", err);
        }
    }

    // 2. If decision is IGNORAR, stop here
    if (!decision.shouldRespond) {
        console.log("[Decision Agent] Ignoring message.");
        return;
    }

    // 3. Call Lumi (main agent)
    console.log("--- CALLING LUMI AGENT ---");

    // Debug: Echo Input to Chat (only in 'full' mode)
    if (debugMode === 'full') {
        const buffer = Buffer.from('\uFEFF' + messageContext, 'utf-8');
        try {
            await lastMessage.channel.send({
                content: `**[DEBUG INPUT]**`,
                files: [{
                    attachment: buffer,
                    name: `debug-input-${Date.now()}.txt`
                }]
            });
        } catch (err) {
            console.error("Failed to send debug input attachment:", err);
        }
    }

    try {
        let conversationId = getConversationId(contextId);
        let contentStr = "";
        let response;

        if (!conversationId) {
            const agentId = await getOmniAgentId();
            response = await client.beta.conversations.start({
                agentId: agentId,
                inputs: [{ role: 'user', content: messageContext }]
            });

            if (response && response.conversationId) {
                conversationId = response.conversationId;
                setConversationId(contextId, conversationId);
            }
        } else {
            response = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: messageContext }]
                }
            });
        }

        // Extraer contenido de la respuesta
        if (response.outputs && response.outputs.length > 0) {
            const output = response.outputs.find(o => o.role === 'assistant' || o.content);
            if (output) {
                contentStr = output.content;
            }
        }

        if (!contentStr) {
            console.log("[DEBUG] Empty content extracted. Full Response:", JSON.stringify(response, null, 2));
            return;
        }

        console.log("--- RAW RESPONSE ---");
        console.log(contentStr);
        console.log("--------------------");

        // Parsear respuesta usando el módulo
        const parsedResponse = parseAIResponse(contentStr);

        console.log("--- PARSED RESPONSE ---");
        console.log(parsedResponse);
        console.log("-----------------------");

        // Debug Mode Output
        if (debugMode === 'full') {
            await sendDebugOutput(lastMessage.channel, 'Decision Agent', contentStr);
        } else if (debugMode === 'thoughts') {
            // Extract only the THOUGHT section
            const thoughtMatch = contentStr.match(/<THOUGHT>([\s\S]*?)<\/THOUGHT>/i);
            if (thoughtMatch) {
                // Word wrap for better Discord preview (80 chars)
                const wrapText = (text, width = 80) => {
                    const lines = text.split('\n');
                    return lines.map(line => {
                        if (line.length <= width) return line;
                        const words = line.split(' ');
                        let result = '';
                        let currentLine = '';
                        for (const word of words) {
                            if ((currentLine + ' ' + word).trim().length <= width) {
                                currentLine = (currentLine + ' ' + word).trim();
                            } else {
                                if (currentLine) result += currentLine + '\n';
                                currentLine = word;
                            }
                        }
                        if (currentLine) result += currentLine;
                        return result;
                    }).join('\n');
                };

                const thoughtContent = wrapText(thoughtMatch[1].trim());
                const buffer = Buffer.from('\uFEFF' + thoughtContent, 'utf-8');
                try {
                    await lastMessage.channel.send({
                        content: `**[💭 THOUGHT]**`,
                        files: [{
                            attachment: buffer,
                            name: `thought-${Date.now()}.txt`
                        }],
                        reply: { messageReference: lastMessage.id }
                    });
                } catch (err) {
                    console.error("Failed to send thought attachment:", err);
                }
            }
        }

        // Enviar mensaje de texto
        await sendTextMessage(lastMessage.channel, parsedResponse);

        // Enviar reacciones
        await sendReactions(lastMessage, parsedResponse.reaction);

    } catch (error) {
        console.error("Error calling Mistral:", error);
        if (debugMode) {
            await lastMessage.channel.send(`**Error**: ${error.message}`);
        }
    }
}
