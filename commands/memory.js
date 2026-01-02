import { getActiveConversations, clearAllConversations } from '../utils/conversationStore.js';
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
        const activeConvos = getActiveConversations();
        const channels = Object.keys(activeConvos);
        const count = channels.length;

        let message = `**Memory Status**\nActive Conversations: **${count}**\n`;
        if (count > 0) {
            message += `Channels: ${channels.map(id => `<#${id}>`).join(', ')}`;
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: message,
                flags: 64, // Ephemeral (only visible to user) to properly handle privacy/spam
            },
        });
    }

    if (subCommand === 'clear_all') {
        const count = Object.keys(getActiveConversations()).length;
        clearAllConversations();

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `✅ Memory cleared. Removed **${count}** active conversations.`,
            },
        });
    }
}
