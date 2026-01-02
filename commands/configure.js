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
    const { data, member, user, application_id, token } = req.body;

    // 1. Defer immediately
    res.send({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        // Dynamic import to avoid circular dependency
        const { updateAgentPersona, getAgentPersona } = await import('../utils/agentManager.js');

        const personalityOption = data.options ? data.options.find(opt => opt.name === 'personality') : null;
        const creativityOption = data.options ? data.options.find(opt => opt.name === 'creativity') : null;

        // CASE 1: No arguments provided -> Show current settings
        if (!personalityOption && !creativityOption) {
            const currentParams = await getAgentPersona();
            // Assuming structure, verify actual response structure. 
            // Usually agent.instructions and agent.completion_args.temperature or similar.
            // Mistral API agent object: instructions, temperature (sometimes undefined if default).

            const currentInstructions = currentParams.instructions;
            // SDK might nest it in completion_args?? Or top level in 'get' response?
            // Checking docs: 'agent' object has 'instructions'. Temperature is likely in agent metadata or root if supported.
            // Let's assume root or completionArgs.

            // Safe access
            const currentTemp = currentParams.temperature ?? (currentParams.completionArgs?.temperature) ?? "Default";

            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: {
                    content: `ℹ️ **Current Configuration for Zavier Sama**\n\n**Personality:**\n> ${currentInstructions || '(None)'}\n\n**Creativity:** ${currentTemp}`,
                },
            });
            return;
        }

        // CASE 2: Arguments provided -> Update and Show Result
        let instructions = personalityOption ? personalityOption.value : undefined;
        let temperature = creativityOption ? creativityOption.value : undefined;

        // Perform update
        const updatedAgent = await updateAgentPersona(instructions, temperature);

        // Retrieve final values to display "Unchanged" values correctly
        // updatedAgent should contain the full new state
        const finalInstructions = updatedAgent.instructions;
        const finalTemp = updatedAgent.temperature ?? (updatedAgent.completionArgs?.temperature) ?? "Default";

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: `✅ **Configuration Updated!**\n\n**Personality:**\n> ${finalInstructions || '(None)'}\n\n**Creativity:** ${finalTemp}`,
            },
        });

    } catch (err) {
        console.error("Config update error:", err);
        try {
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
