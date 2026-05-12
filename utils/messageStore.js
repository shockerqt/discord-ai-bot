/**
 * Message Store - Almacena historial de mensajes en memoria con estados
 * Gestiona estados PENDING, WAITING, PROCESSED para el Decision Agent
 */

// Tipos de estado
export const MSG_STATUS = {
    PENDING: 'PENDING',     // Recién llegado
    WAITING: 'WAITING',     // Decision Agent dijo ESPERAR
    PROCESSED: 'PROCESSED', // Ya respondido o ignorado
    GENERATING: 'GENERATING' // Placeholder reservando lugar
};

// Map<channelId, Array<RawMessage>>
// RawMessage: { id, role, content, author, timestamp, status }
const channelMessages = new Map();

// Track active channels
const activeChannels = new Set();
const MAX_MESSAGES = 30; // Límite reducido para consistencia con recolección de feedback y ahorro de tokens

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
        // Prevent duplicates
        if (messages.some(m => m.id === msg.messageId)) continue;

        messages.push({
            id: msg.messageId,
            role: 'user',
            content: msg.content,
            author: msg.userName,
            timestamp: msg.timestamp,
            status: MSG_STATUS.PENDING,
            replyTo: msg.replyTo,
            mediaAttachments: msg.mediaAttachments || null,
            metadata: {}
        });
    }

    // Maintain limit
    if (messages.length > MAX_MESSAGES) {
        const removeCount = messages.length - MAX_MESSAGES;
        messages.splice(0, removeCount);
    }
}

/**
 * Agrega un placeholder para la respuesta del asistente que se está generando
 * Retorna el ID temporal para resolverlo luego
 */
export function addAssistantPlaceholder(channelId) {
    const messages = getRawMessages(channelId);
    const id = `asst-placeholder-${Date.now()}`;
    messages.push({
        id: id,
        role: 'assistant',
        content: '(Escribiendo...)',
        author: 'Lumi',
        timestamp: new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' }),
        status: MSG_STATUS.GENERATING,
        metadata: {}
    });
    return id;
}

/**
 * Resuelve el placeholder con la respuesta real
 */
export function resolveAssistantMessage(channelId, placeholderId, content) {
    const messages = getRawMessages(channelId);
    const msg = messages.find(m => m.id === placeholderId);
    if (msg) {
        msg.content = content;
        msg.status = MSG_STATUS.PROCESSED;
    } else {
        addAssistantMessage(channelId, content);
    }
}

/**
 * Actualiza el contenido de un mensaje específico por su ID.
 * Útil para inyectar contexto procesado asíncronamente (ej. resúmenes de video).
 */
export function updateMessageContent(channelId, messageId, newContent) {
    const messages = getRawMessages(channelId);
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
        msg.content = newContent;
        console.log(`[MessageStore] Updated content for message ${messageId} in channel ${channelId}`);
        return true;
    }
    return false;
}

/**
 * Agrega mensaje de asistente (Legacy / Direct)
 */
export function addAssistantMessage(channelId, content, messageId = null, metadata = {}) {
    if (!content || content.trim() === '') return;
    const messages = getRawMessages(channelId);
    messages.push({
        id: messageId || `asst-${Date.now()}`,
        role: 'assistant',
        content: content,
        author: 'Lumi',
        timestamp: new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' }),
        status: MSG_STATUS.PROCESSED,
        metadata: metadata || {}
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
            let line = `[${msg.timestamp}] (MsgID:${msg.id}) ${msg.author}: ${msg.content}`;
            if (msg.replyTo) {
                line += ` [Replying to: ${msg.replyTo}]`;
            }
            if (msg.mediaAttachments?.length > 0) {
                for (const m of msg.mediaAttachments) {
                    if (m.type === 'youtube') line += ` [YouTube: ${m.url}]`;
                    else if (m.type === 'audio') line += ` [Audio adjunto: ${m.filename}]`;
                }
            }

            // Combinar con anterior si es usuario
            if (currentMsg && currentMsg.role === 'user') {
                currentMsg.content += '\n' + line;
                // Merge mediaAttachments from consecutive user messages
                if (msg.mediaAttachments?.length > 0) {
                    currentMsg.mediaAttachments = [
                        ...(currentMsg.mediaAttachments || []),
                        ...msg.mediaAttachments
                    ];
                }
            } else {
                currentMsg = {
                    role: 'user',
                    content: line,
                    mediaAttachments: msg.mediaAttachments?.length > 0 ? [...msg.mediaAttachments] : null
                };
                history.push(currentMsg);
            }

        } else {
            // Assistant message
            if (currentMsg && currentMsg.role === 'user') currentMsg = null; // Break user block

            // Check if previous message was assistant to combine
            const lastMsg = history.length > 0 ? history[history.length - 1] : null;
            if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content += '\n\n' + msg.content;
            } else {
                history.push({ role: 'assistant', content: msg.content });
            }
        }
    }
    return history;
}

/**
 * Obtiene historial específico para el Decision Agent
 * Formato simplificado o ajustado para toma de decisiones
 */
export function getDecisionHistory(channelId) {
    const raw = getRawMessages(channelId);
    if (!raw.length) return [];

    const history = [];
    let currentMsg = null;

    for (const msg of raw) {
        // Para Decision Agent, mantenemos el formato rico con Timestamp ID y Autor
        // Esto es crucial para que pueda referenciar mensajes anteriores si es necesario
        // O entender el flujo temporal.
        if (msg.role === 'user') {
            let line = `[${msg.timestamp}] (MsgID:${msg.id}) ${msg.author}: ${msg.content}`;
            if (msg.replyTo) {
                line += ` [Replying to: ${msg.replyTo}]`;
            }
            if (msg.mediaAttachments?.length > 0) {
                for (const m of msg.mediaAttachments) {
                    if (m.type === 'youtube') line += ` [YouTube: ${m.url}]`;
                    else if (m.type === 'audio') line += ` [Audio adjunto: ${m.filename}]`;
                }
            }

            if (currentMsg && currentMsg.role === 'user') {
                currentMsg.content += '\n' + line;
            } else {
                currentMsg = { role: 'user', content: line };
                history.push(currentMsg);
            }
        } else {
            // Assistant (Lumi)
            // Mostrar ID también para que el agente sepa si le están respondiendo
            const line = `(MsgID:${msg.id}) [Lumi]: ${msg.content}`;

            if (currentMsg && currentMsg.role === 'user') currentMsg = null;

            const lastMsg = history.length > 0 ? history[history.length - 1] : null;
            if (lastMsg && lastMsg.role === 'assistant') {
                lastMsg.content += '\n\n' + line;
            } else {
                history.push({ role: 'assistant', content: line });
            }
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
 * Actualiza el estado de mensajes específicos y opcionalmente añade metadata
 */
export function updateMessageStatus(channelId, messageIds, newStatus, additionalMetadata = null) {
    const messages = getRawMessages(channelId);
    const idsSet = new Set(messageIds);
    let count = 0;

    for (const msg of messages) {
        if (idsSet.has(msg.id)) {
            msg.status = newStatus;
            if (additionalMetadata) {
                msg.metadata = { ...(msg.metadata || {}), ...additionalMetadata };
            }
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

/**
 * Obtiene todos los mensajes raw de un canal (para el dashboard)
 */
export function getAllMessages(channelId) {
    return getRawMessages(channelId);
}

// Alias for compatibility
export { getFormattedHistory as getMessages };
