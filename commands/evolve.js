import { InteractionResponseType } from 'discord-interactions';
import { client } from '../discordClient.js';
import { getFormattedHistory } from '../utils/messageStore.js';
import { checkAndEvolvePersonality } from '../services/ai/personalityEvolutionService.js';

export const data = {
    name: 'evolve',
    description: 'Manually force Lumi\'s dynamic personality to evolve based on recent chat history',
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { channel_id } = req.body;

    // Execute in the background to avoid Discord's 3-second timeout
    (async () => {
        try {
            console.log(`[Evolve Command] Manually triggered in channel ${channel_id}`);
            const channel = await client.channels.fetch(channel_id);
            if (!channel) {
                console.error(`[Evolve Command] Channel ${channel_id} not found.`);
                return;
            }

            const history = getFormattedHistory(channel_id);
            if (!history || history.length === 0) {
                await channel.send('⚠️ **[Evolución de Personalidad]** No hay suficientes mensajes en el historial de este canal para evaluar una evolución.');
                return;
            }

            const result = await checkAndEvolvePersonality(channel, history, { force: true });
            
            if (result.evaluated) {
                if (result.evolved) {
                    // Success! The service already sends a beautiful message to the channel via changeSummary.
                    console.log(`[Evolve Command] Evolved successfully: ${result.changeSummary}`);
                } else {
                    await channel.send(`ℹ️ **[Evolución de Personalidad]** La evaluación determinó que no es necesario evolucionar la personalidad en este momento.\n**Razón:** *${result.reason}*`);
                }
            } else {
                await channel.send('❌ **[Evolución de Personalidad]** No se pudo ejecutar la evaluación de evolución en este momento.');
            }
        } catch (err) {
            console.error('[Evolve Command] Error forcing evolution:', err);
            try {
                const channel = await client.channels.fetch(channel_id);
                if (channel) {
                    await channel.send(`❌ **[Evolución de Personalidad]** Error al intentar forzar la evolución: ${err.message}`);
                }
            } catch (innerErr) {
                // Ignore if we can't even fetch channel or send message
            }
        }
    })();

    // Respond immediately to the slash command interaction
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '🌀 **Analizando el historial reciente del canal para evaluar una evolución de personalidad...** (Esto tomará unos segundos)',
        },
    });
}
