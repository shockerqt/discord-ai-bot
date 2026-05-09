import { InteractionResponseType } from 'discord-interactions';
import {
    getConfig, getPersonality, getTemperature, getPresencePenalty, getFrequencyPenalty, getProvider,
    setPersonality, setTemperature, setPresencePenalty, setFrequencyPenalty, setModel, setProvider
} from '../utils/configStore.js';

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
            name: 'model',
            description: 'Set the AI model to use',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 3, // STRING
                    name: 'name',
                    description: 'Model name (provider:model)',
                    required: true,
                    choices: [
                        { name: 'Gemini 3.1 Flash Lite (Google)', value: 'gemini:gemini-3.1-flash-lite' },
                        { name: 'Gemma 4 31B (Google)', value: 'gemini:gemma-4-31b-it' },
                        { name: 'Gemma 4 26B MoE (Google)', value: 'gemini:gemma-4-26b-a4b-it' },
                        { name: 'Gemma 3 27B (Google)', value: 'gemini:gemma-3-27b-it' },
                        { name: 'Gemma 3 12B (Google)', value: 'gemini:gemma-3-12b-it' },
                        { name: 'Llama 3.3 70B (Groq)', value: 'groq:llama-3.3-70b-versatile' },
                        { name: 'Llama 3.1 8B Instant (Groq)', value: 'groq:llama-3.1-8b-instant' },
                        { name: 'Llama-4 Scout 17B (Groq)', value: 'groq:meta-llama/llama-4-scout-17b-16e-instruct' },
                        { name: 'Qwen 3 32B (Groq)', value: 'groq:qwen/qwen3-32b' },
                        { name: 'Kimi K2 Instruct (Groq)', value: 'groq:moonshotai/kimi-k2-instruct' },
                        { name: 'Mixtral 8x7B (Groq)', value: 'groq:mixtral-8x7b-32768' },
                        { name: 'Mistral Large (Mistral)', value: 'mistral:mistral-large-latest' },
                        { name: 'Mistral Small (Mistral)', value: 'mistral:mistral-small-latest' },
                        { name: 'Ministral 14B (Mistral)', value: 'mistral:ministral-14b-latest' }
                    ]
                }
            ]
        },
        {
            name: 'personality',
            description: 'Set personality instructions (text appends, file overwrites)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 3, // STRING
                    name: 'text',
                    description: 'Personality instructions to APPEND',
                    required: false,
                },
                {
                    type: 11, // ATTACHMENT
                    name: 'file',
                    description: 'Text file to OVERWRITE personality (bypasses 2000 char limit)',
                    required: false,
                }
            ]
        },
        {
            name: 'creativity',
            description: 'Set temperature (0.0 to 1.0)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 10, // NUMBER
                    name: 'value',
                    description: 'Temperature value',
                    required: true,
                    min_value: 0.0,
                    max_value: 1.0,
                }
            ]
        },
        {
            name: 'presence_penalty',
            description: 'Set presence penalty (-2.0 to 2.0)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 10, // NUMBER
                    name: 'value',
                    description: 'Presence penalty value',
                    required: true,
                    min_value: -2.0,
                    max_value: 2.0,
                }
            ]
        },
        {
            name: 'frequency_penalty',
            description: 'Set frequency penalty (-2.0 to 2.0)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 10, // NUMBER
                    name: 'value',
                    description: 'Frequency penalty value',
                    required: true,
                    min_value: -2.0,
                    max_value: 2.0,
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

    // Defer immediately
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        const { client: discordClient } = await import('../discordClient.js');

        const subCommand = data.options[0].name;
        const subOptions = data.options[0].options || [];

        // SHOW
        if (subCommand === 'show') {
            const cfg = getConfig();
            const personalityBuffer = Buffer.from('\uFEFF' + (cfg.personality || '(No custom personality set)'), 'utf-8');

            const channel = await discordClient.channels.fetch(channel_id);
            if (!channel) throw new Error("Channel not found.");

            await channel.send({
                content: `ℹ️ **Current Configuration**\n\n**AI Provider:** \`${cfg.provider}\`\n**Model:** \`${cfg.model}\`\n**Temperature:** ${cfg.temperature}\n**Presence Penalty:** ${cfg.presence_penalty}\n**Frequency Penalty:** ${cfg.frequency_penalty}\n\n📄 **Personality:** Ver archivo adjunto`,
                files: [{ attachment: personalityBuffer, name: 'personality.txt' }]
            });

            await DiscordRequest(endpoint, { method: 'PATCH', body: { content: "Configuration shown!" } });
            return;
        }

        // CLEAR_PERSONALITY
        if (subCommand === 'clear_personality') {
            setPersonality('');
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: '🗑️ **Personality cleared!** Base instructions are preserved.' }
            });
            return;
        }

        // MODEL
        if (subCommand === 'model') {
            const nameOption = subOptions.find(o => o.name === 'name');
            const parts = nameOption.value.split(':');
            if (parts.length >= 2) {
                setProvider(parts[0]);
                setModel(parts.slice(1).join(':'));
            } else {
                setModel(nameOption.value);
            }
            await sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest);
            return;
        }

        // PERSONALITY
        if (subCommand === 'personality') {
            const textOption = subOptions.find(o => o.name === 'text');
            const fileOption = subOptions.find(o => o.name === 'file');

            let newText = '';

            if (fileOption) {
                const attachmentId = fileOption.value;
                const attachment = req.body.data.resolved?.attachments?.[attachmentId];
                if (attachment?.url) {
                    try {
                        const response = await fetch(attachment.url);
                        if (!response.ok) throw new Error(`Failed: ${response.status}`);
                        newText = await response.text();
                    } catch (fetchErr) {
                        await DiscordRequest(endpoint, { method: 'PATCH', body: { content: `❌ Failed: ${fetchErr.message}` } });
                        return;
                    }
                }
                // File OVERWRITES
                setPersonality(newText);
            } else if (textOption) {
                // Text APPENDS
                const current = getPersonality();
                newText = current ? `${current}\n\n${textOption.value}` : textOption.value;
                setPersonality(newText);
            } else {
                await DiscordRequest(endpoint, { method: 'PATCH', body: { content: '❌ Provide text or file.' } });
                return;
            }

            await sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest);
            return;
        }

        // CREATIVITY (temperature)
        if (subCommand === 'creativity') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setTemperature(valueOption.value);
            await sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest);
            return;
        }

        // PRESENCE_PENALTY
        if (subCommand === 'presence_penalty') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setPresencePenalty(valueOption.value);
            await sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest);
            return;
        }

        // FREQUENCY_PENALTY
        if (subCommand === 'frequency_penalty') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setFrequencyPenalty(valueOption.value);
            await sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest);
            return;
        }

    } catch (err) {
        console.error("Config error:", err);
        try {
            await DiscordRequest(endpoint, { method: 'PATCH', body: { content: `❌ Error: ${err.message}` } });
        } catch (e) { console.error("Failed to send error:", e); }
    }
}

async function sendConfigUpdate(discordClient, channel_id, endpoint, DiscordRequest) {
    const cfg = getConfig();
    const personalityBuffer = Buffer.from('\uFEFF' + (cfg.personality || '(empty)'), 'utf-8');

    const channel = await discordClient.channels.fetch(channel_id);
    if (!channel) throw new Error("Channel not found.");

    await channel.send({
        content: `✅ **Configuration Updated!**\n\n**AI Provider:** \`${cfg.provider}\`\n**Model:** \`${cfg.model}\`\n**Temperature:** ${cfg.temperature}\n**Presence Penalty:** ${cfg.presence_penalty}\n**Frequency Penalty:** ${cfg.frequency_penalty}\n\n📄 **Personality:** Ver archivo adjunto`,
        files: [{ attachment: personalityBuffer, name: 'personality.txt' }]
    });

    await DiscordRequest(endpoint, { method: 'PATCH', body: { content: "Configuration updated!" } });
}
