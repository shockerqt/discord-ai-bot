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
        await channel.send(msgOptions);
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
        // Support multiple reactions (e.g. "🎲⏳💀")
        // Use Intl.Segmenter to properly split emojis (grapheme clusters)
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        const reactions = Array.from(segmenter.segment(reactionString)).map(s => s.segment);

        // Limit to first 3 to avoid spam if AI goes crazy
        for (const reactionEmoji of reactions.slice(0, 3)) {
            try {
                await message.react(reactionEmoji);
            } catch (e) {
                console.error(`Failed to react with ${reactionEmoji}:`, e.message);
            }
        }
    } catch (e) {
        console.error(`Failed to process reactions:`, e.message);
    }
}

/**
 * Envía un archivo de debug al canal.
 * @param {Object} channel - Canal de Discord
 * @param {string} debugRngInfo - Info de RNG
 * @param {string} contentStr - Contenido raw XML
 * @returns {Promise<void>}
 */
export async function sendDebugOutput(channel, debugRngInfo, contentStr) {
    const debugContent = `
RNG INFO: ${debugRngInfo}

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
