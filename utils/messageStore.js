/**
 * Message Store - Almacena historial de mensajes en memoria por canal
 * Permite control activo sobre qué mensajes se agregan al contexto
 */

// Map<channelId, Array<{role: 'user'|'assistant', content: string}>>
const channelMessages = new Map();

// Límite de mensajes en memoria por canal
const MAX_MESSAGES = 50;

/**
 * Obtiene los mensajes de un canal
 * @param {string} channelId - ID del canal
 * @returns {Array<{role: string, content: string}>}
 */
export function getMessages(channelId) {
    if (!channelMessages.has(channelId)) {
        channelMessages.set(channelId, []);
    }
    return channelMessages.get(channelId);
}

/**
 * Agrega un mensaje de usuario al historial
 * @param {string} channelId - ID del canal
 * @param {string} content - Contenido del mensaje
 */
export function addUserMessage(channelId, content) {
    const messages = getMessages(channelId);
    messages.push({ role: 'user', content });

    // Mantener límite
    if (messages.length > MAX_MESSAGES) {
        messages.shift();
    }
}

/**
 * Agrega un mensaje de asistente al historial
 * Solo agrega el contenido de texto, NO los pensamientos
 * @param {string} channelId - ID del canal
 * @param {string} content - Contenido del mensaje (solo texto visible)
 */
export function addAssistantMessage(channelId, content) {
    if (!content || content.trim() === '') return;

    const messages = getMessages(channelId);
    messages.push({ role: 'assistant', content });

    // Mantener límite
    if (messages.length > MAX_MESSAGES) {
        messages.shift();
    }
}

/**
 * Limpia el historial de un canal
 * @param {string} channelId - ID del canal
 */
export function clearMessages(channelId) {
    channelMessages.set(channelId, []);
}

/**
 * Obtiene el número de mensajes en el historial de un canal
 * @param {string} channelId - ID del canal
 * @returns {number}
 */
export function getMessageCount(channelId) {
    return getMessages(channelId).length;
}
