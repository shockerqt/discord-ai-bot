import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId, deleteConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId } from '../utils/agentManager.js';
import { debugChannels } from './debug.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// Slash command removed. This module now only handles passive messages.


// Helper to send interleaved messages
export async function handlePassiveMessage(messages) {
    // Ensure array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1]; // Use last message for context ID, channel, author(if needed generic)
    const contextId = lastMessage.channel.id;

    // Check for mentions to bypass RNG
    const botId = client.user?.id; // Need to ensure client is imported or accessible. 
    // Wait, 'client' is not imported in chat.js? 
    // chat.js imports Mistral client as 'client'. DISCORD client is passed in req? No.
    // handlePassiveMessage receives 'messages' (Discord Message objects).
    // messsage.mentions.users.has(botId)
    // We can get botId from the message.client.user.id

    // State for Active Mode (3 minutes)
    // Note: In a persistent bot, this should be outside the function scope. 
    // Since 'handlePassiveMessage' is exported, we need a module-level variable. 
    // Let's assume we can declare it at the top of the file, but for now, we'll check if we can attach it to the client or use a global.
    // Ideally, define `const channelLastActive = new Map();` at the top of the file. 
    // BUT since we are editing a chunk inside a function, I will rely on a module-level variable that I will ADD in a separate edit or assume exists? 
    // No, I should add it at the top level first or check if I can add it here. 
    // Wait, the user wants me to edit `chat.js`. I can't easily see the top level right now without viewing the file again, 
    // but I can add it to the `client` object if passed? No, `client` is the Mistral client.
    // Let's use a static property on the function or a global map in this module. 

    // Better idea: I will add the Map declaration at the top level in a separate edit if needed, 
    // OR I can use a property on `handlePassiveMessage` itself to simulate static state.
    if (!handlePassiveMessage.channelLastActive) {
        handlePassiveMessage.channelLastActive = new Map();
    }
    const lastActiveTime = handlePassiveMessage.channelLastActive.get(contextId) || 0;
    const nowTime = Date.now();
    const isActiveMode = (nowTime - lastActiveTime) < (3 * 60 * 1000); // 3 minutes

    // Check if ANY message in the batch mentions the bot
    const botUser = lastMessage.client.user;
    const isMentioned = msgs.some(m =>
        m.mentions.users.has(botUser.id) ||
        /^lumi\b/i.test(m.content.trim())
    );

    let forcedInstruction = "";
    let debugRngInfo = "";

    if (isMentioned) {
        // Update Active Timestamp
        handlePassiveMessage.channelLastActive.set(contextId, nowTime);
        debugRngInfo = "Mode: Active (Mentioned) | 3.0m left";
        forcedInstruction = "\n\n[SISTEMA]: MODO ACTIVO INICIADO. Tienes 3.0 minutos de atención prioritaria. Responde libremente si el mensaje es relevante.";
        console.log("[Active Mode] Refreshed by Mention.");
    } else if (isActiveMode) {
        // ACTIVE MODE (Timer)
        // Bypass RNG, but conditional response based on relevance logic
        const timeLeft = (3 - (nowTime - lastActiveTime) / 60000).toFixed(1);
        debugRngInfo = `Mode: Active (Timer) | ${timeLeft}m left`;
        forcedInstruction = `\n\n[SISTEMA]: MODO ACTIVO (${timeLeft}m restantes). El usuario te habló hace poco. Responde si el mensaje sigue el hilo o es relevante. Si cambia de tema a algo irrelevante, puedes ignorar (<SEND_TEXT>: FALSE).`;
        console.log(`[Active Mode] Timer Active. ${debugRngInfo}`);
    } else {
        // PASSIVE MODE (RNG)
        const roll = Math.random() * 100;
        let modeName = "Unknown";

        if (roll < 90) {
            // 90% Silent Mode (Process but don't output)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO SILENCIOSO. Solo procesa el contexto. Configura <SEND_TEXT> en FALSE. <REACTION> debe ser NULL.`;
            modeName = "Silent";
        } else if (roll < 96) {
            // 6% Emoji Only
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. REACCIÓN OBLIGATORIA. Tu respuesta TIENE QUE SER SOLO una reacción (campo <REACTION> con emoji). <SEND_TEXT> debe ser FALSE. NO envíes texto.`;
            modeName = "Emoji Only";
        } else if (roll < 99) {
            // 3% Text Only
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. TEXTO OBLIGATORIO. Tu respuesta TIENE QUE SER SOLO texto. <REACTION> debe ser NULL.`;
            modeName = "Text Only";
        } else {
            // 1% Text + Emoji (Default behavior mostly, but forced)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. TEXTO Y REACCIÓN OBLIGATORIOS. Tu respuesta DEBE tener texto Y reacción.`;
            modeName = "Text + Emoji";
        }

        debugRngInfo = `Mode: ${modeName} (Roll: ${roll.toFixed(2)}%)`;
        console.log(`[RNG] Triggered! ${debugRngInfo}`);
    }

    // Construct Context from Batch
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    let fullContent = "--- CURRENT MESSAGES ---\n";

    // Append batch messages line by line
    for (const msg of msgs) {
        fullContent += `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${msg.author.username}: ${msg.content}\n`;
    }

    const OUTPUT_INSTRUCTION = `
### FORMATO DE SALIDA (TAGS OBLIGATORIO) -- NO USES JSON
Responde SIEMPRE usando estos tags exactos. No incluyas nada fuera de los tags.
<THOUGHT>
Analiza la situacion paso a paso. Explayate todo lo necesario para razonar la respuesta correcta.
</THOUGHT>
<SEND_TEXT>
TRUE o FALSE
</SEND_TEXT>
<TEXT_CONTENT>
Tu respuesta de texto aquí. Vacío si SEND_TEXT es FALSE.
</TEXT_CONTENT>
<REPLY_TO>
ID del mensaje al que respondes o NULL
</REPLY_TO>
<REACTION>
Emoji o NULL
</REACTION>`;

    fullContent += OUTPUT_INSTRUCTION;
    fullContent += forcedInstruction;

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
        let outputs = [];

        if (!conversationId) {
            const agentId = await getOmniAgentId();
            // Start new conversation
            const startParams = {
                agentId: agentId,
                inputs: [{ role: 'user', content: fullContent }]
            };
            const convoResponse = await client.beta.conversations.start(startParams);
            conversationId = convoResponse.conversationId || convoResponse.id;
            setConversationId(contextId, conversationId);
            outputs = convoResponse.outputs;
        } else {
            // Append
            const convoResponse = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: fullContent }]
                }
            });
            outputs = convoResponse.outputs;
        }

        // Parse Output
        // The beta API returns 'outputs' array. We usually want the last one.
        if (outputs && outputs.length > 0) {
            const lastOutput = outputs[outputs.length - 1];
            let contentStr = "";

            if (lastOutput.content) {
                if (Array.isArray(lastOutput.content)) {
                    // Combine text parts if it's an array
                    contentStr = lastOutput.content
                        .filter(p => p.type === 'text')
                        .map(p => p.text)
                        .join("");
                } else if (typeof lastOutput.content === 'string') {
                    contentStr = lastOutput.content;
                }
            }

            // Strip code blocks if AI wrapped it in ```xml ... ```
            contentStr = contentStr.replace(/```xml/g, '').replace(/```/g, '').trim();

            console.log("--- RAW RESPONSE ---");
            console.log(contentStr);
            console.log("--------------------");

            // PARSE TAGS using Regex
            const extract = (tag) => {
                const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, 'i');
                const match = contentStr.match(regex);
                return match ? match[1].trim() : null;
            };

            const thought = extract('THOUGHT');
            const sendTextRaw = extract('SEND_TEXT');
            const textContent = extract('TEXT_CONTENT');
            const replyToRaw = extract('REPLY_TO');
            const reactionRaw = extract('REACTION');

            const parsedResponse = {
                thought: thought || "",
                send_text: sendTextRaw && sendTextRaw.toUpperCase().includes('TRUE'),
                text_content: textContent || "",
                reply_to: (replyToRaw && replyToRaw.toUpperCase() !== 'NULL') ? replyToRaw : null,
                reaction: (reactionRaw && reactionRaw.toUpperCase() !== 'NULL') ? reactionRaw : null
            };

            console.log("--- PARSED RESPONSE ---");
            console.log(parsedResponse);
            console.log("-----------------------");

            // --- Process Parsed Output ---
            // Fix: Do not push to outputs and iterate, use parsedResponse directly.
            const output = parsedResponse;

            // Debug Mode Output
            if (debugChannels.has(contextId)) {
                const debugContent = `
RNG INFO: ${debugRngInfo}

--- COMPLETE RAW XML ---
${contentStr}
`;
                const buffer = Buffer.from('\uFEFF' + debugContent, 'utf-8');
                try {
                    await lastMessage.channel.send({
                        content: `**[DEBUG OUTPUT]**`,
                        files: [{
                            attachment: buffer,
                            name: `debug-${Date.now()}.txt`
                        }]
                    });
                } catch (err) {
                    console.error("Failed to send debug attachment:", err);
                }
            }

            if (output.send_text && output.text_content) {
                // Send Typing
                await lastMessage.channel.sendTyping();

                // ... logic to send message ...
                const msgOptions = { content: output.text_content };
                if (output.reply_to) {
                    msgOptions.reply = { messageReference: output.reply_to };
                }

                try {
                    await lastMessage.channel.send(msgOptions);
                } catch (sendErr) {
                    console.error("Failed to send message:", sendErr);
                }
            }

            if (output.reaction) {
                try {
                    // Support multiple reactions (e.g. "🎲⏳💀")
                    // Use Intl.Segmenter to properly split emojis (grapheme clusters)
                    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                    const reactions = Array.from(segmenter.segment(output.reaction)).map(s => s.segment);

                    // Limit to first 3 to avoid spam if AI goes crazy
                    for (const reactionEmoji of reactions.slice(0, 3)) {
                        try {
                            await lastMessage.react(reactionEmoji);
                        } catch (e) {
                            console.error(`Failed to react with ${reactionEmoji}:`, e.message);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to process reactions:`, e.message);
                }
            }
        } // End if (outputs)

    } catch (error) { // End try
        console.error("Error calling Mistral:", error);
        if (debugChannels.has(contextId)) {
            await lastMessage.channel.send(`**Error**: ${error.message}`);
        }
    }
}
