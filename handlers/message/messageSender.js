/**
 * Message Sender - Maneja el envío de mensajes y reacciones a Discord
 */

/**
 * Resuelve un nombre de emoji (shortcode) a su formato completo <...>
 */
function resolveEmoji(name, guild, client) {
    // 1. Check Guild
    if (guild) {
        const guildEmoji = guild.emojis.cache.find(e => e.name === name);
        if (guildEmoji) return guildEmoji.toString(); // <a:name:id> or <:name:id>
    }
    // 2. Check App
    if (client && client.application) {
        const appEmoji = client.application.emojis.cache.find(e => e.name === name);
        if (appEmoji) return `${appEmoji.animated ? '<a:' : '<:'}${appEmoji.name}:${appEmoji.id}>`;
    }
    return null;
}

/**
 * Reemplaza :shortcodes: por el formato correcto de Discord
 */
function replaceEmojiShortcodes(text, guild, client) {
    if (!text) return text;
    return text.replace(/:(\w+):/g, (match, name) => {
        const resolved = resolveEmoji(name, guild, client);
        return resolved || match; // Fallback to original if not found
    });
}

/**
 * Envía un mensaje de texto al canal.
 * @param {Object} channel - Canal de Discord
 * @param {Object} output - Output parseado del AI
 * @returns {Promise<void>}
 */
export async function sendTextMessage(channel, output) {
    if (!output.send_text || !output.text_content) return;
    if (output.text_content.trim() === 'NULL') return;

    let contentToSend = replaceEmojiShortcodes(output.text_content, channel.guild, channel.client);

    // Safety truncate if expansion pushed it over 2000 (unlikely but possible)
    if (contentToSend.length > 2000) {
        contentToSend = contentToSend.substring(0, 2000);
    }

    const msgOptions = { content: contentToSend };
    if (output.reply_to) {
        // Validate reply_to is a valid ID (digits) logic elsewhere or verify here
        // If reply_to is "ID1" from prompt placeholder, it might be invalid, but usually parsed.
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
        let emojiToReact = reactionString;

        // 1. Try to extract ID if it's already in <...> format (unlikely with new prompt but safe)
        const customEmojiRegex = /<a?:.+:(\d+)>/;
        const match = reactionString.match(customEmojiRegex);
        if (match) {
            emojiToReact = match[1];
        } else {
            // 2. Try to resolve shortcode :name: -> ID
            const shortcodeMatch = reactionString.match(/:(\w+):/);
            if (shortcodeMatch) {
                const name = shortcodeMatch[1];
                const resolved = resolveEmoji(name, message.guild, message.client);
                if (resolved) {
                    // Extract ID from resolved string
                    const idMatch = resolved.match(/:(\d+)>/);
                    if (idMatch) emojiToReact = idMatch[1];
                }
            }
            // 3. Fallback: maybe it's a raw Unicode emoji, use as is.
        }

        await message.react(emojiToReact);
        console.log(`[Reactions] Reacted with ${emojiToReact} to ${message.id}`);
    } catch (error) {
        console.error(`Failed to react with ${reactionString}: ${error.message}`);
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
