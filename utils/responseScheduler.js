/**
 * Response Scheduler - Gestiona la espera y ejecución de respuestas
 * Permite manejar el estado "ESPERAR" del Decision Agent
 */

const pendingTimeouts = new Map(); // channelId -> { timeoutId, resolve }

/**
 * Programa una espera para un canal.
 * Si llega una orden de "RESPONDER" antes, se cancela la espera y se procede.
 * Si llega otra orden de "ESPERAR", se reinicia el timer.
 * 
 * @param {string} channelId 
 * @param {number} durationMs 
 * @param {Function} onTimeoutCallback - Función a ejecutar si expira el tiempo
 */
export function scheduleResponse(channelId, durationMs, onTimeoutCallback) {
    // Si ya existe un timer, lo cancelamos (reinicio de espera)
    if (pendingTimeouts.has(channelId)) {
        clearTimeout(pendingTimeouts.get(channelId).timeoutId);
        pendingTimeouts.delete(channelId);
        console.log(`[Scheduler] Timer reset for channel ${channelId}`);
    }

    // Crear nuevo timer
    const timeoutId = setTimeout(() => {
        console.log(`[Scheduler] Timer expired for ${channelId}. Executing callback.`);
        pendingTimeouts.delete(channelId);
        onTimeoutCallback();
    }, durationMs);

    pendingTimeouts.set(channelId, { timeoutId, callback: onTimeoutCallback });
}

/**
 * Cancela cualquier espera pendiente y ejecuta inmediatamente (o permite ejecución externa).
 * Se usa cuando el Decision Agent decide RESPONDER inmediatamente.
 */
export function cancelPendingResponse(channelId) {
    if (pendingTimeouts.has(channelId)) {
        clearTimeout(pendingTimeouts.get(channelId).timeoutId);
        pendingTimeouts.delete(channelId);
        console.log(`[Scheduler] Timer cancelled for ${channelId} (Immediate response triggered)`);
    }
}

/**
 * Verifica si hay una respuesta pendiente para este canal
 */
export function hasPendingResponse(channelId) {
    return pendingTimeouts.has(channelId);
}
