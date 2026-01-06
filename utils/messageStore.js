/**
 * Message Store - Almacena historial de mensajes en memoria por canal
 * Combina mensajes consecutivos del mismo usuario
 */

// Map<channelId, Array<{role: 'user'|'assistant', content: string}>>
const channelMessages = new Map();

// Track active channels
const activeChannels = new Set();

// Track last user ID per channel for combining messages
const lastUserId = new Map();

// Límite de mensajes en memoria por canal
const MAX_MESSAGES = 50;

/**
 * Get all active channel IDs
 */
export function getActiveChannels() {
    return Array.from(activeChannels);
}

/**
 * Obtiene los mensajes de un canal
 */
export function getMessages(channelId) {
    if (!channelMessages.has(channelId)) {
        channelMessages.set(channelId, []);
    }
    return channelMessages.get(channelId);
}

/**
 * Agrega mensajes de usuario al historial
 * Combina mensajes consecutivos del mismo usuario en un solo mensaje
 * @param {string} channelId - ID del canal
 * @param {Array<{userId: string, userName: string, content: string, timestamp: string}>} userMessages - Mensajes a agregar
 */
export function addUserMessages(channelId, userMessages) {
    if (!userMessages || userMessages.length === 0) return;

    activeChannels.add(channelId);
    const messages = getMessages(channelId);
    const previousUserId = lastUserId.get(channelId);

    for (const msg of userMessages) {
        const formattedLine = `[${msg.timestamp}] (MsgID:${msg.messageId}) ${msg.userName}: ${msg.content}`;

        // Check if we can append to the last message (same user, last message is 'user')
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && previousUserId === msg.userId) {
            // Append to existing user message
            lastMsg.content += '\n' + formattedLine;
        } else {
            // Create new user message
            messages.push({ role: 'user', content: formattedLine });

            // Maintain limit
            if (messages.length > MAX_MESSAGES) {
                messages.shift();
            }
        }

        lastUserId.set(channelId, msg.userId);
    }
}

/**
 * Legacy: Agrega un mensaje de usuario (sin combinar)
 */
export function addUserMessage(channelId, content) {
    activeChannels.add(channelId);
    const messages = getMessages(channelId);
    messages.push({ role: 'user', content });
    lastUserId.set(channelId, null); // Reset user tracking

    if (messages.length > MAX_MESSAGES) {
        messages.shift();
    }
}

/**
 * Agrega un mensaje de asistente al historial
 */
export function addAssistantMessage(channelId, content) {
    if (!content || content.trim() === '') return;

    const messages = getMessages(channelId);
    messages.push({ role: 'assistant', content });
    lastUserId.set(channelId, null); // Reset - next user message won't combine

    if (messages.length > MAX_MESSAGES) {
        messages.shift();
    }
}

/**
 * Limpia el historial de un canal
 */
export function clearMessages(channelId) {
    channelMessages.set(channelId, []);
    lastUserId.delete(channelId);
}

/**
 * Obtiene el número de mensajes en el historial de un canal
 */
export function getMessageCount(channelId) {
    return getMessages(channelId).length;
}
