/**
 * Mode Handler - Gestiona los modos de interacción (Active, Passive, RNG)
 */

// State for Active Mode (3 minutes window)
const channelLastActive = new Map();

/**
 * Determina el modo de respuesta y genera la instrucción correspondiente.
 * @param {Object} params - Parámetros de entrada
 * @param {string} params.contextId - ID del canal/contexto
 * @param {boolean} params.isMentioned - Si el bot fue mencionado
 * @returns {{ forcedInstruction: string, debugRngInfo: string }}
 */
export function determineMode({ contextId, isMentioned }) {
    const lastActiveTime = channelLastActive.get(contextId) || 0;
    const nowTime = Date.now();
    const isActiveMode = (nowTime - lastActiveTime) < (3 * 60 * 1000); // 3 minutes

    let forcedInstruction = "";
    let debugRngInfo = "";

    if (isMentioned) {
        // Update Active Timestamp
        channelLastActive.set(contextId, nowTime);
        debugRngInfo = "Mode: Active (Mentioned) | 3.0m left";
        forcedInstruction = "\n\n[SISTEMA]: MODO ACTIVO INICIADO. Tienes 3.0 minutos de atención prioritaria. Responde (TEXTO o REACCIÓN) SOLO si el mensaje ES RELEVANTE para la conversación en curso o si te mencionan directamente. Si cambian de tema a algo que no te incumbe, IGNORA (<SEND_TEXT>: FALSE, <REACTION>: NULL).";
        console.log("[Active Mode] Refreshed by Mention.");
    } else if (isActiveMode) {
        // ACTIVE MODE (Timer) - Probabilistic: 50% Silent, 30% Emote, 20% Text
        const timeLeft = (3 - (nowTime - lastActiveTime) / 60000).toFixed(1);
        const activeRoll = Math.random() * 100;
        let activeModeType = "Unknown";

        if (activeRoll < 50) {
            // 50% Silent
            activeModeType = "Silent";
            forcedInstruction = `\n\n[SISTEMA]: MODO ACTIVO (${timeLeft}m restantes). RNG: ${activeRoll.toFixed(2)}. MODO SILENCIOSO (ACTIVO). Aunque estás en tiempo activo, el RNG decidió silencio. <SEND_TEXT>: FALSE. <REACTION>: NULL (Prohibido).`;
        } else if (activeRoll < 80) {
            // 30% Emote
            activeModeType = "Emote";
            forcedInstruction = `\n\n[SISTEMA]: MODO ACTIVO (${timeLeft}m restantes). RNG: ${activeRoll.toFixed(2)}. MODO EMOTE (ACTIVO). Solo emojis permitidos si el contexto lo amerita. <SEND_TEXT>: FALSE.`;
        } else {
            // 20% Free / Text
            activeModeType = "Text";
            forcedInstruction = `\n\n[SISTEMA]: MODO ACTIVO (${timeLeft}m restantes). RNG: ${activeRoll.toFixed(2)}. MODO LIBRE (ACTIVO). Tienes permiso para hablar (<SEND_TEXT>: TRUE) si sigue el hilo de la conversación.`;
        }

        debugRngInfo = `Mode: Active (${activeModeType}) | ${timeLeft}m left`;
        console.log(`[Active Mode] Timer Active. ${debugRngInfo}`);
    } else {
        // PASSIVE MODE (RNG)
        const roll = Math.random() * 100;
        let modeName = "Unknown";

        if (roll < 85) {
            // 85% Silent Mode
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO SILENCIOSO. El RNG SOLO decidió que NO tienes permiso para hablar esta vez. Tu personalidad y nivel de caos NO cambian por el RNG. Configura <SEND_TEXT> en FALSE. <REACTION> DEBE SER NULL (Prohibido reaccionar en este modo).`;
            modeName = "Silent";
        } else if (roll < 95) {
            // 10% Emote Mode (Reaction Only, No Text)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO EMOTE. El RNG decidió que SOLO puedes usar emojis. Configura <SEND_TEXT> en FALSE. <REACTION> está PERMITIDA si el contexto lo amerita (no es obligatorio, sé selectiva).`;
            modeName = "Emote Mode";
        } else {
            // 5% Free Mode (Text + Reaction Allowed)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO LIBRE. El RNG SOLO decidió que TIENES permiso para hablar esta vez. Tu personalidad y nivel de caos NO cambian por el RNG - siempre eres tú misma. Puedes responder (<SEND_TEXT>: TRUE) o reaccionar si el contexto lo amerita.`;
            modeName = "Free Mode";
        }

        debugRngInfo = `Mode: ${modeName} (Roll: ${roll.toFixed(2)}%)`;
        console.log(`[RNG] Triggered! ${debugRngInfo}`);
    }

    return { forcedInstruction, debugRngInfo };
}

/**
 * Expone el Map para uso externo si es necesario (ej: reset)
 */
export { channelLastActive };
