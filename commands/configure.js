import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'configure',
    description: 'Configure bot personality and settings',
    options: [
        {
            name: 'show',
            description: 'Show current configuration',
            type: 1, // SUB_COMMAND
        },
        {
            name: 'personality',
            description: 'Add personality instructions (appends to existing)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 3, // STRING
                    name: 'text',
                    description: 'The personality instructions to add',
                    required: true,
                }
            ]
        },
        {
            name: 'creativity',
            description: 'Set creativity/temperature (0.0 to 1.0)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 10, // NUMBER
                    name: 'value',
                    description: 'Temperature value (0.0 to 1.0)',
                    required: true,
                    min_value: 0.0,
                    max_value: 1.0,
                }
            ]
        },
        {
            name: 'image_generation',
            description: 'Enable or disable image generation',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 5, // BOOLEAN
                    name: 'enabled',
                    description: 'Enable or disable',
                    required: true,
                }
            ]
        },
        {
            name: 'clear_personality',
            description: 'Clear all personality instructions',
            type: 1, // SUB_COMMAND
        },
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
        const { updateAgentPersona, getAgentPersona } = await import('../utils/agentManager.js');
        const { client: discordClient } = await import('../discordClient.js');

        const subCommand = data.options[0].name;
        const subOptions = data.options[0].options || [];

        // SHOW - Display current settings
        if (subCommand === 'show') {
            const currentParams = await getAgentPersona();

            const currentInstructions = currentParams.instructions || '';
            const currentTemp = currentParams.temperature ?? (currentParams.completionArgs?.temperature) ?? "Default";
            const currentTools = currentParams.tools || [];
            const hasImageGen = currentTools.some(t => t.type === 'image_generation');

            const personalityBuffer = Buffer.from('\uFEFF' + currentInstructions, 'utf-8');

            const channel = await discordClient.channels.fetch(channel_id);
            if (!channel) throw new Error("Channel not found.");

            await channel.send({
                content: `ℹ️ **Current Configuration**\n\n**Creativity:** ${currentTemp}\n**Image Generation:** ${hasImageGen ? '✅ Enabled' : '❌ Disabled'}\n\n📄 **Personality:** Ver archivo adjunto`,
                files: [{ attachment: personalityBuffer, name: 'personality.txt' }]
            });

            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: "Configuration shown! (See attachment below)" }
            });
            return;
        }

        // CLEAR_PERSONALITY - Clear all instructions
        if (subCommand === 'clear_personality') {
            await updateAgentPersona('', undefined, undefined);

            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: '🗑️ **Personality cleared!** The bot now has no custom instructions.' }
            });
            return;
        }

        // PERSONALITY - Append new instructions
        if (subCommand === 'personality') {
            const textOption = subOptions.find(o => o.name === 'text');
            const newText = textOption.value;

            const currentParams = await getAgentPersona();
            const currentInstructions = currentParams.instructions || '';
            const instructions = currentInstructions
                ? `${currentInstructions}\n\n${newText}`
                : newText;

            const updatedAgent = await updateAgentPersona(instructions, undefined, undefined);
            await sendConfigUpdate(discordClient, channel_id, updatedAgent, endpoint, DiscordRequest);
            return;
        }

        // CREATIVITY - Set temperature
        if (subCommand === 'creativity') {
            const valueOption = subOptions.find(o => o.name === 'value');
            const updatedAgent = await updateAgentPersona(undefined, valueOption.value, undefined);
            await sendConfigUpdate(discordClient, channel_id, updatedAgent, endpoint, DiscordRequest);
            return;
        }

        // IMAGE_GENERATION - Toggle
        if (subCommand === 'image_generation') {
            const enabledOption = subOptions.find(o => o.name === 'enabled');
            const updatedAgent = await updateAgentPersona(undefined, undefined, enabledOption.value);
            await sendConfigUpdate(discordClient, channel_id, updatedAgent, endpoint, DiscordRequest);
            return;
        }

    } catch (err) {
        console.error("Config update error:", err);
        try {
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: `❌ Failed to update configuration: ${err.message}` },
            });
        } catch (e) {
            console.error("Failed to send error message:", e);
        }
    }
}

// Helper function to send config update with attachment
async function sendConfigUpdate(discordClient, channel_id, updatedAgent, endpoint, DiscordRequest) {
    const finalInstructions = updatedAgent.instructions || '';
    const finalTemp = updatedAgent.temperature ?? (updatedAgent.completionArgs?.temperature) ?? "Default";
    const finalTools = updatedAgent.tools || [];
    const finalHasImageGen = finalTools.some(t => t.type === 'image_generation');

    const personalityBuffer = Buffer.from('\uFEFF' + finalInstructions, 'utf-8');

    const channel = await discordClient.channels.fetch(channel_id);
    if (!channel) throw new Error("Channel not found.");

    await channel.send({
        content: `✅ **Configuration Updated!**\n\n**Creativity:** ${finalTemp}\n**Image Generation:** ${finalHasImageGen ? '✅ Enabled' : '❌ Disabled'}\n\n📄 **Personality:** Ver archivo adjunto`,
        files: [{ attachment: personalityBuffer, name: 'personality.txt' }]
    });

    await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: { content: "Configuration updated! (See attachment below)" }
    });
}
