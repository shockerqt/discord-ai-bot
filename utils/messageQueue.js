/**
 * Message Queue - Procesa mensajes en cola por canal
 * Evita errores cuando el agente está procesando un mensaje
 */

import { addUserMessages } from './messageStore.js';
import { extractUserMessages } from '../handlers/messageHandler.js';

// Cola de mensajes por canal: Map<channelId, { queue: Message[], processing: boolean }>
const channelQueues = new Map();

/**
 * Agrega un mensaje a la cola del canal y procesa si está libre
 * @param {Object} message - Mensaje de Discord
 * @param {Function} processor - Función async para procesar el mensaje
 */
export async function enqueueMessage(message, processor) {
    // Save to history IMMEDIATELY (inside queue)
    const userMsgs = extractUserMessages([message]);
    addUserMessages(message.channel.id, userMsgs);

    const channelId = message.channel.id;

    // Inicializar cola si no existe
    if (!channelQueues.has(channelId)) {
        channelQueues.set(channelId, { queue: [], processing: false });
    }

    const channelState = channelQueues.get(channelId);
    channelState.queue.push(message);

    console.log(`[Queue] Message added to channel ${channelId}. Queue size: ${channelState.queue.length}`);

    // Si ya está procesando, el mensaje será procesado cuando termine el actual
    if (channelState.processing) {
        console.log(`[Queue] Channel ${channelId} is busy. Message queued.`);
        return;
    }

    // Procesar la cola
    await processQueue(channelId, processor);
}

/**
 * Procesa la cola de un canal de forma secuencial
 * @param {string} channelId - ID del canal
 * @param {Function} processor - Función async para procesar el mensaje
 */
async function processQueue(channelId, processor) {
    const channelState = channelQueues.get(channelId);
    if (!channelState || channelState.processing) return;

    channelState.processing = true;

    while (channelState.queue.length > 0) {
        // Tomar todos los mensajes acumulados como un batch
        const messageBatch = channelState.queue.splice(0, channelState.queue.length);

        console.log(`[Queue] Processing batch of ${messageBatch.length} message(s) for channel ${channelId}`);

        try {
            await processor(messageBatch);
        } catch (error) {
            console.error(`[Queue] Error processing batch for channel ${channelId}:`, error);
        }
    }

    channelState.processing = false;
    console.log(`[Queue] Channel ${channelId} queue is now empty.`);
}

/**
 * Obtiene el estado de la cola (para debugging)
 * @param {string} channelId - ID del canal
 * @returns {{ queueSize: number, processing: boolean } | null}
 */
export function getQueueStatus(channelId) {
    const state = channelQueues.get(channelId);
    if (!state) return null;
    return { queueSize: state.queue.length, processing: state.processing };
}
