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
        },
        {
            type: 5, // BOOLEAN
            name: 'image_generation',
            description: 'Enable or disable image generation capabilities',
            required: false,
        }
    ],
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { data, channel_id, application_id, token } = req.body;

    // 1. Defer immediately
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        // Dynamic imports
        const { updateAgentPersona, getAgentPersona } = await import('../utils/agentManager.js');
        const { client: discordClient } = await import('../discordClient.js');

        const personalityOption = data.options ? data.options.find(opt => opt.name === 'personality') : null;
        const creativityOption = data.options ? data.options.find(opt => opt.name === 'creativity') : null;
        const imageGenOption = data.options ? data.options.find(opt => opt.name === 'image_generation') : null;

        // CASE 1: No arguments provided -> Show current settings
        if (!personalityOption && !creativityOption && !imageGenOption) {
            const currentParams = await getAgentPersona();

            const currentInstructions = currentParams.instructions || '(None)';
            const currentTemp = currentParams.temperature ?? (currentParams.completionArgs?.temperature) ?? "Default";
            const currentTools = currentParams.tools || [];
            const hasImageGen = currentTools.some(t => t.type === 'image_generation');

            // Create personality file attachment with UTF-8 BOM for proper emoji/accent display
            const personalityBuffer = Buffer.from('\uFEFF' + currentInstructions, 'utf-8');

            // Send file via Discord.js client (same pattern as history.js)
            const channel = await discordClient.channels.fetch(channel_id);
            if (!channel) {
                throw new Error("Channel not found.");
            }

            await channel.send({
                content: `ℹ️ **Current Configuration**\n\n**Creativity:** ${currentTemp}\n**Image Generation:** ${hasImageGen ? '✅ Enabled' : '❌ Disabled'}\n\n📄 **Personality:** Ver archivo adjunto`,
                files: [{
                    attachment: personalityBuffer,
                    name: 'personality.txt'
                }]
            });

            // Update the deferred interaction
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: "Configuration shown! (See attachment below)" }
            });
            return;
        }

        // CASE 2: Arguments provided -> Update and Show Result
        let instructions = personalityOption ? personalityOption.value : undefined;
        let temperature = creativityOption ? creativityOption.value : undefined;
        let enableImage = imageGenOption ? imageGenOption.value : undefined;

        // Perform update
        const updatedAgent = await updateAgentPersona(instructions, temperature, enableImage);

        // Retrieve final values to display
        const finalInstructions = updatedAgent.instructions || '(None)';
        const finalTemp = updatedAgent.temperature ?? (updatedAgent.completionArgs?.temperature) ?? "Default";
        const finalTools = updatedAgent.tools || [];
        const finalHasImageGen = finalTools.some(t => t.type === 'image_generation');

        // Create personality file attachment with UTF-8 BOM for proper emoji/accent display
        const personalityBuffer = Buffer.from('\uFEFF' + finalInstructions, 'utf-8');

        // Send file via Discord.js client
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel) {
            throw new Error("Channel not found.");
        }

        await channel.send({
            content: `✅ **Configuration Updated!**\n\n**Creativity:** ${finalTemp}\n**Image Generation:** ${finalHasImageGen ? '✅ Enabled' : '❌ Disabled'}\n\n📄 **Personality:** Ver archivo adjunto`,
            files: [{
                attachment: personalityBuffer,
                name: 'personality.txt'
            }]
        });

        // Update the deferred interaction
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: { content: "Configuration updated! (See attachment below)" }
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
