import { InteractionResponseType } from 'discord-interactions';
import {
    getConfig, getPersonality,
    setPersonality, setTemperature, setPresencePenalty, setFrequencyPenalty, setModel, setProvider,
    setPersona, setContextLimit, PERSONAS
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
                        { name: 'Gemini 3.1 Flash Lite Preview (Google)', value: 'gemini:gemini-3.1-flash-lite-preview' },
                        { name: 'Gemini 3 Flash Preview (Google)', value: 'gemini:gemini-3-flash-preview' },
                        { name: 'Gemini 2.5 Pro (Google)', value: 'gemini:gemini-2.5-pro' },
                        { name: 'Gemini 2.5 Flash (Google)', value: 'gemini:gemini-2.5-flash' },
                        { name: 'Gemini 2.5 Flash Lite (Google)', value: 'gemini:gemini-2.5-flash-lite' },
                        { name: 'Gemma 3 27B IT (Google)', value: 'gemini:gemma-3-27b-it' },
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
            name: 'persona',
            description: 'Switch between neutral assistant and the Lumi character',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 3, // STRING
                    name: 'mode',
                    description: 'Response style',
                    required: true,
                    choices: [
                        { name: 'Asistente informativo (neutro)', value: PERSONAS.ASSISTANT },
                        { name: 'Personaje Lumi', value: PERSONAS.LUMI }
                    ]
                }
            ]
        },
        {
            name: 'context_limit',
            description: 'How many previous channel messages to read as context (0-100)',
            type: 1, // SUB_COMMAND
            options: [
                {
                    type: 4, // INTEGER
                    name: 'value',
                    description: 'Number of messages',
                    required: true,
                    min_value: 0,
                    max_value: 100,
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
    const { data, application_id, token } = req.body;

    // Defer immediately: hay que responder a Discord en menos de 3 segundos
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        const subCommand = data.options[0].name;
        const subOptions = data.options[0].options || [];

        // SHOW
        if (subCommand === 'show') {
            await reply(endpoint, DiscordRequest,
                `ℹ️ **Current Configuration**\n\n${formatConfig()}`,
                getPersonality() || '(No custom personality set)');
            return;
        }

        // CLEAR_PERSONALITY
        if (subCommand === 'clear_personality') {
            setPersonality('');
            await reply(endpoint, DiscordRequest,
                '🗑️ **Personality cleared!** Base instructions are preserved.');
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
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // PERSONA
        if (subCommand === 'persona') {
            const modeOption = subOptions.find(o => o.name === 'mode');
            setPersona(modeOption.value);
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // CONTEXT LIMIT
        if (subCommand === 'context_limit') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setContextLimit(valueOption.value);
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // PERSONALITY
        if (subCommand === 'personality') {
            const textOption = subOptions.find(o => o.name === 'text');
            const fileOption = subOptions.find(o => o.name === 'file');

            if (fileOption) {
                // El archivo SOBREESCRIBE (permite pasarse de los 2000 chars del comando)
                const attachmentId = fileOption.value;
                const attachment = req.body.data.resolved?.attachments?.[attachmentId];
                let newText = '';
                if (attachment?.url) {
                    try {
                        const response = await fetch(attachment.url);
                        if (!response.ok) throw new Error(`Failed: ${response.status}`);
                        newText = await response.text();
                    } catch (fetchErr) {
                        await reply(endpoint, DiscordRequest, `❌ Failed: ${fetchErr.message}`);
                        return;
                    }
                }
                setPersonality(newText);
            } else if (textOption) {
                // El texto se AÑADE a lo que ya había
                const current = getPersonality();
                setPersonality(current ? `${current}\n\n${textOption.value}` : textOption.value);
            } else {
                await reply(endpoint, DiscordRequest, '❌ Provide text or file.');
                return;
            }

            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // CREATIVITY (temperature)
        if (subCommand === 'creativity') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setTemperature(valueOption.value);
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // PRESENCE_PENALTY
        if (subCommand === 'presence_penalty') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setPresencePenalty(valueOption.value);
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        // FREQUENCY_PENALTY
        if (subCommand === 'frequency_penalty') {
            const valueOption = subOptions.find(o => o.name === 'value');
            setFrequencyPenalty(valueOption.value);
            await replyWithConfig(endpoint, DiscordRequest);
            return;
        }

        await reply(endpoint, DiscordRequest, `❌ Subcomando desconocido: \`${subCommand}\``);

    } catch (err) {
        console.error('Config error:', err);
        try {
            await reply(endpoint, DiscordRequest, `❌ Error: ${err.message}`);
        } catch (e) {
            console.error('Failed to send error:', e);
        }
    }
}

/**
 * Responde a la interacción editando el mensaje diferido.
 *
 * Se usa el webhook de la interacción en vez del cliente de Gateway: así funciona
 * siempre, incluso en DMs o cuando la app está instalada a nivel de usuario, donde
 * el bot no puede hacer fetch del canal.
 *
 * @param {string} endpoint - webhooks/{app}/{token}/messages/@original
 * @param {Function} DiscordRequest
 * @param {string} content - Texto de la respuesta
 * @param {string} [fileContent] - Si viene, se adjunta como personality.txt
 */
async function reply(endpoint, DiscordRequest, content, fileContent = null) {
    if (!fileContent) {
        await DiscordRequest(endpoint, { method: 'PATCH', body: { content } });
        return;
    }

    const form = new FormData();
    form.append('payload_json', JSON.stringify({
        content,
        attachments: [{ id: 0, filename: 'personality.txt' }]
    }));
    form.append('files[0]', new Blob(['\uFEFF' + fileContent], { type: 'text/plain' }), 'personality.txt');

    await DiscordRequest(endpoint, { method: 'PATCH', body: form });
}

/**
 * Confirma un cambio mostrando la configuración resultante.
 */
async function replyWithConfig(endpoint, DiscordRequest) {
    await reply(endpoint, DiscordRequest,
        `✅ **Configuration Updated!**\n\n${formatConfig()}`,
        getPersonality() || '(empty)');
}

/**
 * Resumen legible de la configuración actual.
 */
function formatConfig() {
    const cfg = getConfig();
    const personaLabel = cfg.persona === PERSONAS.LUMI
        ? 'Personaje Lumi'
        : 'Asistente informativo (neutro)';
    return [
        `**Persona:** ${personaLabel}`,
        `**AI Provider:** \`${cfg.provider}\``,
        `**Model:** \`${cfg.model}\``,
        `**Mensajes de contexto:** ${cfg.context_limit}`,
        `**Temperature:** ${cfg.temperature}`,
        `**Presence Penalty:** ${cfg.presence_penalty}`,
        `**Frequency Penalty:** ${cfg.frequency_penalty}`,
    ].join('\n');
}
