/**
 * Message Store - Almacena historial de mensajes en memoria con estados
 * Gestiona estados PENDING, WAITING, PROCESSED para el Decision Agent
 */

// Tipos de estado
export const MSG_STATUS = {
    PENDING: 'PENDING',     // Recién llegado
    WAITING: 'WAITING',     // Decision Agent dijo ESPERAR
    PROCESSED: 'PROCESSED'  // Ya respondido o ignorado
};

// Map<channelId, Array<RawMessage>>
// RawMessage: { id, role, content, author, timestamp, status }
const channelMessages = new Map();

// Track active channels
const activeChannels = new Set();
const MAX_MESSAGES = 100; // Aumentado ligeramente ya que ahora no combinamos en almacenamiento

/**
 * Get all active channel IDs
 */
export function getActiveChannels() {
    return Array.from(activeChannels);
}

/**
 * Obtiene los mensajes raw de un canal
 */
function getRawMessages(channelId) {
    if (!channelMessages.has(channelId)) {
        channelMessages.set(channelId, []);
    }
    return channelMessages.get(channelId);
}

/**
 * Agrega mensajes de usuario al historial (PENDING por defecto)
 * @param {string} channelId
 * @param {Array<{userId: string, userName: string, content: string, timestamp: string, messageId: string}>} userMessages
 */
export function addUserMessages(channelId, userMessages) {
    if (!userMessages || userMessages.length === 0) return;

    activeChannels.add(channelId);
    const messages = getRawMessages(channelId);

    for (const msg of userMessages) {
        messages.push({
            id: msg.messageId,
            role: 'user',
            content: msg.content,
            author: msg.userName,
            timestamp: msg.timestamp,
            status: MSG_STATUS.PENDING
        });
    }

    // Maintain limit
    if (messages.length > MAX_MESSAGES) {
        const removeCount = messages.length - MAX_MESSAGES;
        messages.splice(0, removeCount);
    }
}

/**
 * Agrega mensaje de asistente (PROCESSED por defecto)
 */
export function addAssistantMessage(channelId, content) {
    if (!content || content.trim() === '') return;
    const messages = getRawMessages(channelId);
    messages.push({
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: content,
        author: 'Lumi',
        timestamp: new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' }),
        status: MSG_STATUS.PROCESSED
    });
}

/**
 * Obtiene historial formateado para Mistral API
 * Combina mensajes consecutivos del mismo rol/autor para ahorrar tokens y dar contexto limpio
 */
export function getFormattedHistory(channelId) {
    const raw = getRawMessages(channelId);
    if (!raw.length) return [];

    const history = [];
    let currentMsg = null;

    for (const msg of raw) {
        if (msg.role === 'user') {
            const line = `[${msg.timestamp}] (MsgID:${msg.id}) ${msg.author}: ${msg.content}`;

            // Combinar con anterior si es usuario
            if (currentMsg && currentMsg.role === 'user') {
                currentMsg.content += '\n' + line;
            } else {
                currentMsg = { role: 'user', content: line };
                history.push(currentMsg);
            }
        } else {
            // Assistant message
            if (currentMsg && currentMsg.role === 'user') currentMsg = null; // Break user block
            history.push({ role: 'assistant', content: msg.content });
        }
    }
    return history;
}

/**
 * Obtiene mensajes no procesados (PENDING o WAITING) para el Decision Agent
 */
export function getUnprocessedMessages(channelId) {
    const messages = getRawMessages(channelId);
    return messages.filter(m => m.role === 'user' && m.status !== MSG_STATUS.PROCESSED);
}

/**
 * Actualiza el estado de mensajes específicos
 */
export function updateMessageStatus(channelId, messageIds, newStatus) {
    const messages = getRawMessages(channelId);
    const idsSet = new Set(messageIds);
    let count = 0;

    for (const msg of messages) {
        if (idsSet.has(msg.id)) {
            msg.status = newStatus;
            count++;
        }
    }
    return count;
}

/**
 * Limpia historial
 */
export function clearMessages(channelId) {
    channelMessages.set(channelId, []);
}

/**
 * Count messages
 */
export function getMessageCount(channelId) {
    return getRawMessages(channelId).length;
}
