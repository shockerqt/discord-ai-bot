/**
 * Message Sender - Maneja el envío de mensajes y reacciones a Discord
 */

/**
 * Envía un mensaje de texto al canal.
 * @param {Object} channel - Canal de Discord
 * @param {Object} output - Output parseado del AI
 * @returns {Promise<void>}
 */
export async function sendTextMessage(channel, output) {
    if (!output.send_text || !output.text_content) return;

    const msgOptions = { content: output.text_content };
    if (output.reply_to) {
        msgOptions.reply = { messageReference: output.reply_to };
    }

    try {
        return await channel.send(msgOptions);
    } catch (sendErr) {
        console.error("Failed to send message:", sendErr);
    }
}

/**
 * Añade reacciones a un mensaje.
 * @param {Object} message - Mensaje de Discord al que reaccionar
 * @param {string} reactionString - String de emojis (puede ser múltiple)
 * @returns {Promise<void>}
 */
export async function sendReactions(message, reactionString) {
    if (!reactionString) return;
    if (!message || typeof message.react !== 'function') return;

    try {
        let emojiToReact = reaction;

        // Parse Custom Emojis of format <:name:id> or <a:name:id>
        // Regex to capture the ID (last group of digits)
        const customEmojiRegex = /<a?:.+:(\d+)>/;
        const match = reaction.match(customEmojiRegex);
        if (match) {
            emojiToReact = match[1]; // Use the ID
            console.log(`[Reactions] Extracted ID ${emojiToReact} from ${reaction}`);
        }

        await message.react(emojiToReact);
        console.log(`[Reactions] Reacted with ${emojiToReact} to ${message.id}`);
    } catch (error) {
        console.error(`Failed to react with ${reaction}: ${error.message}`);
    }
}

/**
 * Envía un archivo de debug al canal.
 * @param {Object} channel - Canal de Discord
 * @param {string} debugRngInfo - Info de RNG
 * @param {string} contentStr - Contenido raw XML
 * @returns {Promise<void>}
 */
export async function sendDebugOutput(channel, contentStr) {
    const debugContent = `
--- COMPLETE RAW XML ---
${contentStr}
`;
    const buffer = Buffer.from('\uFEFF' + debugContent, 'utf-8');
    try {
        await channel.send({
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
