/**
 * Personality Evolution Service - Analiza y evoluciona la personalidad de Lumi dinámicamente
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPersonality, setPersonality } from '../../utils/configStore.js';
import { ChatProviderFactory } from './ChatProviderFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load base Lumi character personality instructions for the Evolution Agent
let LUMI_BASE_INSTRUCTIONS = '';
try {
    LUMI_BASE_INSTRUCTIONS = readFileSync(join(__dirname, '../../LUMI_INSTRUCTIONS.md'), 'utf-8');
} catch (e) {
    console.error('[EvolutionService] Failed to load LUMI_INSTRUCTIONS.md:', e);
}

// Cooldown tracking per channel
const channelCooldowns = new Map();
const COOLDOWN_LIMIT = 6; // Evaluate only every 6 messages in the channel

/**
 * Checks if the channel is eligible for personality evolution and triggers the evolution agent.
 * @param {Object} channel - Discord.js channel object
 * @param {Array} recentMessages - Array of recent user/assistant messages in this channel
 * @param {Object} options - { force: boolean, model: string }
 */
export async function checkAndEvolvePersonality(channel, recentMessages, options = {}) {
    const channelId = channel.id;
    const force = options.force || false;

    // 1. Manage Cooldown
    if (!channelCooldowns.has(channelId)) {
        channelCooldowns.set(channelId, 0);
    }

    let count = channelCooldowns.get(channelId);
    count++;
    channelCooldowns.set(channelId, count);

    if (!force && count < COOLDOWN_LIMIT) {
        console.log(`[EvolutionService] Cooldown: ${count}/${COOLDOWN_LIMIT} messages for channel ${channelId}. Skipping evolution check.`);
        return { evaluated: false };
    }

    // Reset counter if we proceed with evaluation
    channelCooldowns.set(channelId, 0);
    console.log(`[EvolutionService] Cooldown reached or forced. Running evolution evaluation for channel ${channelId}...`);

    try {
        const currentDynamic = getPersonality() || '';
        const aiProvider = ChatProviderFactory.createProvider();

        // 2. Format history for Evolution Agent
        // Take the last 15 messages for context
        const formattedHistory = recentMessages.slice(-15).map(m => {
            const author = m.author || (m.role === 'assistant' ? 'Lumi' : 'Usuario');
            return `[${author}]: ${m.content}`;
        }).join('\n');

        // 3. Assemble System Prompt for Evolution Agent
        const systemPrompt = `Eres el Agente de Evolución y Refinamiento de Lumi. Tu objetivo es analizar la conversación reciente de un canal de Discord y determinar si la personalidad de Lumi (un bot de IA cute but psycho con jerga chilena) debe evolucionar para mantenerse fresca, evitar la repetición y adaptarse mejor al flujo de la conversación y al contexto del grupo.

Lumi tiene dos tipos de instrucciones:
1. Las INSTRUCCIONES BASE DE CARÁCTER (que definen quién es y su arquetipo "cute but psycho").
2. Las REGLAS DINÁMICAS/EVOLUCIONADAS (que son reglas específicas que ella ha aprendido o modificado durante la conversación).

### INSTRUCCIONES BASE DE CARÁCTER:
${LUMI_BASE_INSTRUCTIONS || '(No se pudieron cargar)'}

### REGLAS DINÁMICAS/EVOLUCIONADAS ACTUALES:
${currentDynamic.trim() || '(Ninguna regla dinámica registrada aún)'}

Tu tarea es analizar el historial de chat provisto y evaluar si deberíamos EVOLUCIONAR sus REGLAS DINÁMICAS/EVOLUCIONADAS.

### CRITERIOS PARA EVOLUCIONAR:
- **Repetición**: ¿Ha estado Lumi repitiendo demasiado las mismas frases, chistes, o temas en los últimos mensajes? Si es así, debes proponer una regla dinámica para evitarlo (ej. "Evita usar la palabra X o el chiste Y por ahora").
- **Hitos o Chistes Internos**: ¿Ha surgido una dinámica graciosa en el chat, un apodo recurrente, o una burla específica hacia un usuario que Lumi debería adoptar en su memoria a corto/mediano plazo? (ej. "Ahora Lumi sabe que el usuario X es malo para Y y se burlará de eso").
- **Cambio de Relación**: ¿Ha cambiado drásticamente la relación con algún miembro del canal que deba reflejarse en sus instrucciones?

### REGLAS DE SALIDA (ESTRICTO FORMATO XML):
Debes responder en el siguiente formato XML, sin ningún otro texto adicional, markdown o explicaciones:

<evolution>
    <should_evolve>SI o NO</should_evolve>
    <reason>Explicación lógica de por qué decides si debe evolucionar o no en base al análisis.</reason>
    <new_instructions>
    (Aquí colocas la LISTA COMPLETA de las REGLAS DINÁMICAS/EVOLUCIONADAS actualizadas. Esto REEMPLAZARÁ por completo las reglas dinámicas anteriores. Debe ser una lista clara y concisa de instrucciones adicionales y memorias dinámicas. NO copies aquí las instrucciones base de carácter completas, solo las reglas dinámicas añadidas o modificadas).
    </new_instructions>
    <change_summary>Un resumen muy corto (máximo 1 o 2 frases) de la evolución escrita con el estilo "cute but psycho" de Lumi (ej. "✨ ¡Lumi evolucionó! Ahora sabe que el yue no tiene brillo y le recordará que es un bot secundario cada vez que moleste. Además, prometo usar menos la palabra 'cachan' porque sonaba muy repetitiva. 💅"). Debe estar en español chileno informal.</change_summary>
</evolution>`;

        const userPrompt = `### HISTORIAL RECIENTE DEL CHAT (Analiza esto):
${formattedHistory}

---
Por favor, responde usando el formato XML exacto de <evolution>...`;

        // 4. Run completion
        const activeModel = options.model || aiProvider.decisionModel; // Use decisionModel or similar lightweight model
        const response = await aiProvider.complete([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], {
            model: activeModel,
            temperature: 0.2
        });

        const rawContent = response.content || '';
        console.log(`[EvolutionService] Raw AI Response received.`);

        // 5. Parse XML output
        const shouldEvolveMatch = rawContent.match(/<should_evolve>([\s\S]*?)<\/should_evolve>/i);
        const reasonMatch = rawContent.match(/<reason>([\s\S]*?)<\/reason>/i);
        const newInstructionsMatch = rawContent.match(/<new_instructions>([\s\S]*?)<\/new_instructions>/i);
        const changeSummaryMatch = rawContent.match(/<change_summary>([\s\S]*?)<\/change_summary>/i);

        const shouldEvolveStr = shouldEvolveMatch?.[1]?.trim() || 'NO';
        const reason = reasonMatch?.[1]?.trim() || 'Sin razón especificada';
        const newInstructions = newInstructionsMatch?.[1]?.trim() || '';
        const changeSummary = changeSummaryMatch?.[1]?.trim() || '';

        const shouldEvolve = shouldEvolveStr.toUpperCase() === 'SI' || shouldEvolveStr.toUpperCase() === 'YES' || shouldEvolveStr.toUpperCase() === 'TRUE';

        console.log(`[EvolutionService] Evaluation: shouldEvolve=${shouldEvolve}, Reason: ${reason}`);

        if (shouldEvolve && newInstructions !== '') {
            // Update configuration in configStore
            setPersonality(newInstructions);
            console.log(`[EvolutionService] Evolved instructions updated in configStore.`);

            // Send feedback in Discord chat
            if (changeSummary) {
                try {
                    await channel.send({
                        content: `✨ **[Evolución de Personalidad]**\n${changeSummary}`
                    });
                    console.log(`[EvolutionService] Evolution feedback posted to channel ${channelId}`);
                } catch (sendErr) {
                    console.error(`[EvolutionService] Failed to send feedback message to channel:`, sendErr.message);
                }
            }
            return { evaluated: true, evolved: true, reason, newInstructions, changeSummary };
        }

        return { evaluated: true, evolved: false, reason };

    } catch (err) {
        console.error(`[EvolutionService] Error in evaluation:`, err);
        return { evaluated: true, error: err.message };
    }
}
