import { InteractionResponseType } from 'discord-interactions';
import { fetchChannelLog } from '../utils/contextBuilder.js';
import { getContextLimit } from '../utils/configStore.js';

export const data = {
    name: 'history',
    description: 'Download the recent messages of this channel (the context the bot reads).',
    type: 1, // CHAT_INPUT
    options: [
        {
            type: 4, // INTEGER
            name: 'limit',
            description: 'How many messages to export (default: the configured context size)',
            required: false,
            min_value: 1,
            max_value: 100,
        }
    ]
};

export async function execute(req, res) {
    const { channel_id, application_id, token, data: commandData } = req.body;

    const limitOption = commandData.options?.find(o => o.name === 'limit');
    const limit = limitOption ? limitOption.value : getContextLimit();

    // Defer: leer el canal y subir el archivo toma más de 3 segundos
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    const { DiscordRequest } = await import('../utils.js');
    const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

    try {
        const { client: discordClient } = await import('../discordClient.js');
        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel) throw new Error('Channel not found.');

        const { text, count } = await fetchChannelLog(channel, Math.max(limit, 1));

        if (count === 0) {
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: 'No hay mensajes para exportar en este canal.' }
            });
            return;
        }

        const buffer = Buffer.from('﻿' + text, 'utf-8');
        await channel.send({
            content: `**Últimos mensajes del canal** (${count})`,
            files: [{ attachment: buffer, name: `history-${channel_id}-${Date.now()}.txt` }]
        });

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: { content: 'History exported! (See attachment below)' }
        });

    } catch (error) {
        console.error('Error exporting history:', error);
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: { content: `Failed to export history: ${error.message}` }
        }).catch(() => { });
    }
}
