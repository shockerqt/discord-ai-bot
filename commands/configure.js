import { InteractionResponseType } from 'discord-interactions';
import { updateAgentPersona } from '../utils/agentManager.js';

export const data = {
    name: 'configure',
    description: 'Configure Zavier Sama personality and creativity',
    options: [
        {
            type: 3, // STRING
            name: 'personality',
            description: 'Define the personality instructions (e.g., "You are a pirate...")',
            required: false,
        },
        {
            type: 10, // NUMBER
            name: 'creativity',
            description: 'Set creativity/temperature (0.0 to 1.0)',
            required: false,
            min_value: 0.0,
            max_value: 1.0,
        }
    ],
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { data, member, user } = req.body;
    const userId = member ? member.user.id : user.id;

    // Optional: Restrict to specific users or admins if needed.
    // For now, anyone can configure it as requested.

    const personalityOption = data.options ? data.options.find(opt => opt.name === 'personality') : null;
    const creativityOption = data.options ? data.options.find(opt => opt.name === 'creativity') : null;

    if (!personalityOption && !creativityOption) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '⚠️ Please provide at least one option to configure (Personality or Creativity).',
            },
        });
    }

    // Acknowledge request immediately significantly it might take a few seconds
    // Wait, Discord interactions require response within 3s. `updateAgent` might be slow.
    // Ideally we defer, but our architecture currently uses simple res.send.
    // Let's rely on update being fast enough or handle potential timeout. 
    // Actually, for "configuration", we can just send the request.

    // We can't defer easily with express res.send without complex callback logic or separate InteractionResponse.
    // We'll try to do it and send result. If it times out, Discord usually shows "Application did not respond".
    // We can use DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (type 5) but then we need to edit original interaction.
    // Given the architecture refactor, I will emit type 5 and then run update asynchronously.

    // HOWEVER, standard express approach: 
    // 1. Send type 5 (DEFER).
    // 2. Perform async work.
    // 3. Edit original message using webhook.

    // I need `application_id` and `token` from req.body to edit.

    // Send DEFER first
    res.send({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const { application_id, token } = req.body;

    // Async operation
    try {
        let instructions = personalityOption ? personalityOption.value : undefined;
        let temperature = creativityOption ? creativityOption.value : undefined;

        await updateAgentPersona(instructions, temperature);

        // Edit response
        const endpoint = `webhooks/${application_id}/${token}/messages/@original`;
        const { DiscordRequest } = await import('../utils.js'); // Dynamic import to avoid circular dependency if any? No, local import is fine.

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: `✅ **Configuration Updated!**\n\n**Personality:** ${instructions || '(Unchanged)'}\n**Creativity:** ${temperature !== undefined ? temperature : '(Unchanged)'}`,
            },
        });

    } catch (err) {
        console.error("Config update error:", err);
        // Attempt to report error to user
        try {
            const endpoint = `webhooks/${application_id}/${token}/messages/@original`;
            const { DiscordRequest } = await import('../utils.js');
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: {
                    content: `❌ Failed to update configuration: ${err.message}`,
                },
            });
        } catch (e) {
            console.error("Failed to send error message:", e);
        }
    }
}
