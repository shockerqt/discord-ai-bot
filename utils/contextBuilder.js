/**
 * Context Builder - Construye el contexto de conversación para una mención.
 *
 * El bot no guarda historial: cada vez que lo mencionan lee los últimos mensajes
 * directamente desde Discord. Esto significa que el contexto siempre está fresco
 * (incluye ediciones y borrados) y que no hay estado que reiniciar.
 */

// Detecta URLs de YouTube en el texto (protocolo opcional)
export const YOUTUBE_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w\-]+(?:[?&]\S+)*/gi;

// MIME types de audio soportados (los mensajes de voz de Discord son audio/ogg)
const AUDIO_MIME_TYPES = new Set([
    'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff',
    'audio/aac', 'audio/ogg', 'audio/flac', 'audio/webm',
]);

// Cuántos mensajes previos se piden a Discord como máximo (límite de la API)
const MAX_FETCH_LIMIT = 100;

/**
 * Extrae media relevante de un mensaje de Discord.
 * Mantiene el formato que consumen los adaptadores de IA (mediaAttachments).
 * @param {import('discord.js').Message} message
 * @returns {Array<Object>|null}
 */
export function extractMedia(message) {
    const media = [];

    // 1. URLs de YouTube en el texto
    for (const match of (message.content || '').matchAll(YOUTUBE_URL_REGEX)) {
        media.push({ type: 'youtube', url: match[0] });
    }

    // 2. Audios adjuntos
    for (const [, attachment] of message.attachments ?? []) {
        const mimeType = attachment.contentType?.split(';')[0].trim().toLowerCase() || '';
        if (AUDIO_MIME_TYPES.has(mimeType)) {
            media.push({
                type: 'audio',
                url: attachment.url,
                mimeType,
                filename: attachment.name || 'audio',
                size: attachment.size || 0,
            });
        }
    }

    return media.length > 0 ? media : null;
}

/**
 * Quita la mención al bot del texto para que el modelo no la lea como parte de la pregunta.
 * @param {string} content
 * @param {string} botId
 * @returns {string}
 */
export function stripBotMention(content, botId) {
    if (!content || !botId) return content || '';
    return content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Nombre visible del autor de un mensaje.
 */
function authorName(message) {
    return message.member?.displayName || message.author?.username || 'Usuario';
}

/**
 * Hora local (Chile) de un mensaje, para que el modelo entienda el orden temporal.
 */
function shortTime(message) {
    try {
        return message.createdAt.toLocaleTimeString('es-ES', {
            timeZone: 'America/Santiago',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

/**
 * Describe los adjuntos no multimedia (imágenes, documentos) como texto.
 */
function describeOtherAttachments(message) {
    const notes = [];
    for (const [, attachment] of message.attachments ?? []) {
        const mimeType = attachment.contentType?.split(';')[0].trim().toLowerCase() || '';
        if (AUDIO_MIME_TYPES.has(mimeType)) continue; // ya va como mediaAttachment
        notes.push(`[Adjunto: ${attachment.name || 'archivo'}]`);
    }
    return notes;
}

/**
 * Convierte un mensaje de Discord en una línea de texto para el contexto.
 */
function formatLine(message, botId) {
    const time = shortTime(message);
    const prefix = time ? `[${time}] ` : '';
    let line = `${prefix}${authorName(message)}: ${stripBotMention(message.content, botId)}`;

    const extras = describeOtherAttachments(message);
    for (const media of extractMedia(message) ?? []) {
        if (media.type === 'youtube') extras.push(`[Video de YouTube: ${media.url}]`);
        else if (media.type === 'audio') extras.push(`[Audio adjunto: ${media.filename}]`);
    }
    if (extras.length > 0) line += ` ${extras.join(' ')}`;

    return line;
}

/**
 * Lee los mensajes previos del canal y los devuelve en orden cronológico.
 * @param {import('discord.js').Message} message - Mensaje que disparó la invocación
 * @param {number} limit - Cuántos mensajes previos leer
 * @returns {Promise<Array<import('discord.js').Message>>}
 */
async function fetchPreviousMessages(message, limit) {
    if (limit <= 0) return [];

    try {
        const fetched = await message.channel.messages.fetch({
            limit: Math.min(limit, MAX_FETCH_LIMIT),
            before: message.id,
        });
        // Discord devuelve del más nuevo al más viejo
        return Array.from(fetched.values()).reverse();
    } catch (error) {
        console.warn(`[Context] No se pudo leer el historial del canal: ${error.message}`);
        return [];
    }
}

/**
 * Construye el historial de mensajes para el modelo.
 *
 * Los mensajes del propio bot van como `assistant` y el resto como `user`,
 * agrupando consecutivos del mismo rol para ahorrar tokens. El último elemento
 * es siempre el mensaje que mencionó al bot.
 *
 * @param {import('discord.js').Message} message - Mensaje que mencionó al bot
 * @param {Object} options
 * @param {number} [options.limit=20] - Mensajes previos de contexto
 * @param {string} [options.extraNote] - Nota del sistema a añadir al mensaje final (ej. resumen de video)
 * @returns {Promise<Array<{role: string, content: string, mediaAttachments?: Array<Object>}>>}
 */
export async function buildConversationContext(message, { limit = 20, extraNote = '' } = {}) {
    const botId = message.client.user?.id;
    const previous = await fetchPreviousMessages(message, limit);

    const history = [];

    for (const previousMessage of previous) {
        const isBot = previousMessage.author?.id === botId;
        const line = isBot
            ? stripBotMention(previousMessage.content, botId)
            : formatLine(previousMessage, botId);

        // Saltar mensajes vacíos (embeds sueltos, adjuntos ya descritos, etc.)
        if (!line.trim()) continue;

        const role = isBot ? 'assistant' : 'user';
        const last = history[history.length - 1];

        if (last && last.role === role) {
            last.content += '\n' + line;
        } else {
            history.push({ role, content: line });
        }
    }

    // El mensaje que disparó la invocación va siempre aparte y al final,
    // para que quede claro qué es lo que hay que responder.
    const question = stripBotMention(message.content, botId);
    let triggerContent = `${authorName(message)} te mencionó y dijo: ${question || '(sin texto)'}`;

    if (message.reference?.messageId) {
        const quoted = await resolveReference(message);
        if (quoted) triggerContent += `\n(Está respondiendo a este mensaje: "${quoted}")`;
    }
    if (extraNote) triggerContent += `\n${extraNote}`;

    // Los videos no van como adjunto multimedia: llegan ya resumidos en extraNote,
    // y su URL sigue visible en el texto. Solo el audio se pasa al modelo tal cual.
    const media = extractMedia(message)?.filter(m => m.type !== 'youtube') ?? null;

    history.push({
        role: 'user',
        content: triggerContent,
        mediaAttachments: media?.length > 0 ? media : null,
    });

    return history;
}

/**
 * Resuelve el texto del mensaje al que se está respondiendo, si existe.
 * @returns {Promise<string|null>}
 */
async function resolveReference(message) {
    try {
        const referenced = await message.fetchReference();
        if (!referenced?.content) return null;
        const author = referenced.author?.id === message.client.user?.id
            ? 'tú'
            : authorName(referenced);
        return `${author}: ${referenced.content.slice(0, 500)}`;
    } catch {
        return null;
    }
}

/**
 * Lee el canal y lo devuelve como log de texto plano (para /history).
 * @param {import('discord.js').TextBasedChannel} channel
 * @param {number} limit - Cuántos mensajes leer
 * @returns {Promise<{text: string, count: number}>}
 */
export async function fetchChannelLog(channel, limit = 20) {
    const botId = channel.client.user?.id;
    const fetched = await channel.messages.fetch({ limit: Math.min(limit, MAX_FETCH_LIMIT) });
    const ordered = Array.from(fetched.values()).reverse();

    const lines = ordered
        .map(message => message.author?.id === botId
            ? `[LUMI] ${stripBotMention(message.content, botId)}`
            : formatLine(message, botId))
        .filter(line => line.trim());

    return { text: lines.join('\n'), count: lines.length };
}

/**
 * Renderiza el historial como texto plano (para debug).
 * @param {Array<{role: string, content: string}>} history
 * @returns {string}
 */
export function renderHistory(history) {
    return history
        .map(entry => `[${entry.role === 'assistant' ? 'LUMI' : 'CHAT'}]\n${entry.content}`)
        .join('\n\n---\n\n');
}
