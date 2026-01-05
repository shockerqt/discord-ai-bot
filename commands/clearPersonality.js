import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'clear-personality',
    description: 'Clear the bot personality instructions completely',
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { channel_id, application_id, token } = req.body;

    // 1. Defer immediately
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        const { updateAgentPersona } = await import('../utils/agentManager.js');

        // Clear personality by setting empty instructions
        await updateAgentPersona('', undefined, undefined);

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: '🗑️ **Personality cleared!** The bot now has no custom instructions.',
            },
        });

    } catch (err) {
        console.error("Clear personality error:", err);
        try {
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: {
                    content: `❌ Failed to clear personality: ${err.message}`,
                },
            });
        } catch (e) {
            console.error("Failed to send error message:", e);
        }
    }
}
