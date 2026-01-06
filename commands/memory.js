import { getMessages, clearMessages, getMessageCount, getActiveChannels } from '../utils/messageStore.js';
import { InteractionResponseType } from 'discord-interactions';

export const MEMORY_COMMAND = {
    name: 'memory',
    description: 'Manage bot conversation memory',
    options: [
        {
            name: 'view',
            description: 'View active conversations',
            type: 1, // SUB_COMMAND
        },
        {
            name: 'clear_all',
            description: 'Clear ALL conversation history from memory',
            type: 1, // SUB_COMMAND
        },
    ],
};

export async function memoryCommand(req, res) {
    const { data } = req.body;
    const subCommand = data.options[0].name;

    if (subCommand === 'view') {
        const channels = getActiveChannels();
        const count = channels.length;

        let totalMessages = 0;
        const channelInfo = channels.map(id => {
            const msgCount = getMessageCount(id);
            totalMessages += msgCount;
            return `<#${id}> (${msgCount} msgs)`;
        });

        let message = `**Memory Status**\nActive Channels: **${count}**\nTotal Messages: **${totalMessages}**\n`;
        if (count > 0) {
            message += `\n${channelInfo.join('\n')}`;
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: message,
                flags: 64, // Ephemeral
            },
        });
    }

    if (subCommand === 'clear_all') {
        const channels = getActiveChannels();
        const count = channels.length;

        for (const channelId of channels) {
            clearMessages(channelId);
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `✅ Memory cleared. Removed **${count}** active conversations.`,
            },
        });
    }
}
