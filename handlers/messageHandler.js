/**
 * Message Handler - Maneja mensajes pasivos del bot
 * Procesa mensajes del Gateway de Discord (no slash commands)
 */
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId } from '../utils/agentManager.js';
import { debugChannels } from '../commands/debug.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Importar módulos del handler
import { determineMode } from './message/modeHandler.js';
import { parseAIResponse } from './message/responseParser.js';
import { sendTextMessage, sendReactions, sendDebugOutput } from './message/messageSender.js';

// ES Module directory resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load prompts from external files
const OUTPUT_INSTRUCTION = readFileSync(join(__dirname, '../prompts/output_format.md'), 'utf-8');

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

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

    // Check if ANY message in the batch mentions the bot
    const botUser = lastMessage.client.user;
    const isMentioned = msgs.some(m =>
        m.mentions.users.has(botUser.id) ||
        /^lumi\b/i.test(m.content.trim())
    );

    // Determinar modo usando el módulo
    const { forcedInstruction, debugRngInfo } = determineMode({ contextId, isMentioned });

    // Construct Context from Batch
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    let fullContent = "--- CURRENT MESSAGES ---\n";

    for (const msg of msgs) {
        const authorName = msg.member ? msg.member.displayName : msg.author.username;
        fullContent += `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${authorName}: ${msg.content}\n`;
    }

    // Append instructions
    fullContent += forcedInstruction;
    fullContent += OUTPUT_INSTRUCTION;

    // Log Prompt
    console.log("--- PROMPT SENT TO AGENT ---");
    console.log(fullContent);
    console.log("----------------------------");

    // Debug: Echo Input to Chat
    if (debugChannels.has(contextId)) {
        const debugInputContent = `RNG: ${debugRngInfo}\n\n${fullContent}`;
        const buffer = Buffer.from('\uFEFF' + debugInputContent, 'utf-8');
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
                inputs: [{ role: 'user', content: fullContent }]
            });

            if (response && response.conversationId) {
                conversationId = response.conversationId;
                setConversationId(contextId, conversationId);
            }
        } else {
            response = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: fullContent }]
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
        if (debugChannels.has(contextId)) {
            await sendDebugOutput(lastMessage.channel, debugRngInfo, contentStr);
        }

        // Enviar mensaje de texto
        await sendTextMessage(lastMessage.channel, parsedResponse);

        // Enviar reacciones
        await sendReactions(lastMessage, parsedResponse.reaction);

    } catch (error) {
        console.error("Error calling Mistral:", error);
        if (debugChannels.has(contextId)) {
            await lastMessage.channel.send(`**Error**: ${error.message}`);
        }
    }
}
