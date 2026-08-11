/**
 * Message Sender - Maneja el envío de mensajes y reacciones a Discord
 */

/**
 * Resuelve un nombre de emoji (shortcode) a su formato completo <...>
 * Soporta coincidencia parcial (fuzzy) si el nombre exacto no existe.
 */
function resolveEmoji(name, guild, client) {
    const target = name.toLowerCase();

    const findEmoji = (collection) => {
        if (!collection) return null;
        // 1. Exact Match
        let match = collection.find(e => e.name === name);
        if (match) return match;

        // 2. Case Insensitive Match
        match = collection.find(e => e.name.toLowerCase() === target);
        if (match) return match;

        // 3. Fuzzy Match (Ends with - helpful for "123name" -> "name")
        match = collection.find(e => e.name.toLowerCase().endsWith(target));
        if (match) return match;

        // 4. Broad Fuzzy (Includes)
        return collection.find(e => e.name.toLowerCase().includes(target));
    };

    // 1. Check Guild
    if (guild) {
        const guildEmoji = findEmoji(guild.emojis.cache);
        if (guildEmoji) return guildEmoji.toString();
    }
    // 2. Check App
    if (client && client.application) {
        const appEmoji = findEmoji(client.application.emojis.cache);
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

// Límite de caracteres de un mensaje de Discord
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Parte un texto en trozos que quepan en un mensaje de Discord.
 *
 * Corta por párrafos, luego por líneas y solo como último recurso a mitad de línea,
 * respetando los bloques de código (```) para no dejarlos abiertos.
 *
 * @param {string} text
 * @param {number} limit
 * @returns {Array<string>}
 */
export function splitMessage(text, limit = MAX_MESSAGE_LENGTH) {
    if (text.length <= limit) return [text];

    const chunks = [];
    // Fence abierto: se cierra al final del chunk y se reabre en el siguiente
    let openFence = null;
    let current = '';

    // Espacio que hay que dejar libre para cerrar el bloque de código ('\n```')
    const reserve = () => (openFence ? 4 : 0);
    const prefix = () => (openFence ? `${openFence}\n` : '');

    const flush = () => {
        if (current.trim()) {
            chunks.push(current.trimEnd() + (openFence ? '\n```' : ''));
        }
        current = prefix();
    };

    // Largo máximo que puede tener una línea en un chunk vacío
    const maxLineLength = () => Math.max(limit - reserve() - prefix().length - 1, 1);

    for (const line of text.split('\n')) {
        const fence = line.trim().match(/^```(\S*)/);

        // Una línea que no cabe ni en un chunk vacío se trocea a lo bruto
        const pieces = [];
        let rest = line;
        while (rest.length > maxLineLength()) {
            pieces.push(rest.slice(0, maxLineLength()));
            rest = rest.slice(maxLineLength());
        }
        pieces.push(rest);

        // Si abre un bloque de código, empezar chunk nuevo si no queda espacio útil
        if (fence && !openFence && current.length + line.length + 60 > limit) flush();

        for (const piece of pieces) {
            if (current.length + piece.length + 1 + reserve() > limit) flush();
            current += piece + '\n';
        }

        if (fence) openFence = openFence ? null : '```' + (fence[1] || '');
    }

    flush();

    // Descartar chunks vacíos y bloques de código que quedaron sin contenido
    return chunks.filter(chunk => chunk.trim() && !/^```\S*\s*```$/.test(chunk.trim()));
}

/**
 * Envía un mensaje de texto al canal, partiéndolo si excede el límite de Discord.
 * @param {Object} channel - Canal de Discord
 * @param {Object} output - Output parseado del AI
 * @returns {Promise<Object|undefined>} - El último mensaje enviado
 */
export async function sendTextMessage(channel, output) {
    if (!output.send_text || !output.text_content) {
        // Allow empty text if attachment is present
        if (!output.attachment) return;
        // If attachment present, but no text, ensure contentToSend is empty string, not skipped
    }
    if (output.text_content && output.text_content.trim() === 'NULL' && !output.attachment) return;

    let contentToSend = replaceEmojiShortcodes(output.text_content || '', channel.guild, channel.client);

    // Respuestas largas: enviar en varios mensajes en vez de truncar la información
    if (contentToSend.length > MAX_MESSAGE_LENGTH) {
        const chunks = splitMessage(contentToSend);
        let lastSent;
        for (const [index, chunk] of chunks.entries()) {
            const isLast = index === chunks.length - 1;
            lastSent = await sendSingleMessage(channel, {
                ...output,
                // El adjunto y la cita van solo en el primer/último mensaje que corresponda
                attachment: isLast ? output.attachment : null,
                reply_to: index === 0 ? output.reply_to : null,
            }, chunk);
        }
        return lastSent;
    }

    return sendSingleMessage(channel, output, contentToSend);
}

/**
 * Envía un único mensaje ya dentro del límite de caracteres.
 * @param {Object} channel - Canal de Discord
 * @param {Object} output - Output parseado del AI
 * @param {string} contentToSend - Texto ya resuelto y acotado
 * @returns {Promise<Object|undefined>}
 */
async function sendSingleMessage(channel, output, contentToSend) {
    const msgOptions = { content: contentToSend };
    // Link de GIF que no cabe en este mensaje y se envía aparte
    let gifFollowUp = null;

    // Attachments
    if (output.attachment && output.attachment.startsWith('http')) {
        // Optimization: If it's a GIF link from Klipy/Tenor, append it to text content so Discord embeds it directly.
        // This avoids:
        // 1. Downloading and re-uploading large GIF files (saving bot bandwidth).
        // 2. Discord's file upload size limits (e.g. 10MB/25MB) which causes messages to fail completely.
        // 3. Excessive response delay.
        const isGifLink = output.attachment.toLowerCase().endsWith('.gif') || 
                            output.attachment.includes('klipy.com') || 
                            output.attachment.includes('tenor.com');
                            
        if (isGifLink) {
            if (!contentToSend.includes(output.attachment)) {
                const combined = (contentToSend + '\n' + output.attachment).trim();
                if (combined.length <= MAX_MESSAGE_LENGTH) {
                    msgOptions.content = combined;
                } else {
                    // No cabe: se envía en un mensaje aparte para no truncar el texto
                    gifFollowUp = output.attachment;
                }
            }
        } else {
            msgOptions.files = [output.attachment];
        }
    }

    if (output.reply_to) {
        msgOptions.reply = { messageReference: output.reply_to };
    }

    try {
        const sent = await channel.send(msgOptions);
        if (gifFollowUp) {
            await channel.send({ content: gifFollowUp }).catch(err =>
                console.error('Failed to send GIF follow-up:', err));
        }
        return sent;
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
function wrapText(text, width = 100) {
    if (!text) return "";
    return text.split('\n').map(line => {
        if (line.length <= width) return line;
        const words = line.split(' ');
        let result = '', currentLine = words[0];
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

export async function sendDebugOutput(channel, contentStr, extraInfo = '') {
    const debugContent = `
--- COMPLETE RAW XML ---
${wrapText(contentStr)}
`;
    const buffer = Buffer.from('\uFEFF' + debugContent, 'utf-8');
    try {
        await channel.send({
            content: `**[DEBUG OUTPUT]**\n${extraInfo}`,
            files: [{
                attachment: buffer,
                name: `debug-${Date.now()}.txt`
            }]
        });
    } catch (err) {
        console.error("Failed to send debug attachment:", err);
    }
}
