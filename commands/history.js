import { getMessages, getMessageCount, getDecisionHistory } from '../utils/messageStore.js';
import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'history',
    description: 'Download the conversation history for this channel.',
    type: 1, // CHAT_INPUT
    options: [
        {
            type: 3, // STRING
            name: 'type',
            description: 'Type of history to export',
            required: false,
            choices: [
                { name: 'Standard (Lumi)', value: 'standard' },
                { name: 'Decision Agent', value: 'decision' }
            ]
        }
    ]
};

export async function execute(req, res) {
    const { channel_id, application_id, token, data: commandData } = req.body;

    const typeOption = commandData.options?.find(o => o.name === 'type');
    const type = typeOption ? typeOption.value : 'standard';

    // Get messages from memory
    const messages = type === 'decision'
        ? getDecisionHistory(channel_id)
        : getMessages(channel_id);
    const count = getMessageCount(channel_id);

    console.log(`--- HISTORY COMMAND (${count} messages) ---`);
    console.log(JSON.stringify(messages, null, 2));
    console.log("-------------------------------------------");

    if (count === 0) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: "No conversation history found for this channel.",
            },
        });
    }

    // Defer response
    res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    try {
        // Format as readable text
        const historyText = messages.map((m, i) => {
            const role = m.role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
            return `--- Message ${i + 1} [${role}] ---\n${m.content}`;
        }).join('\n\n');

        const buffer = Buffer.from('\uFEFF' + historyText, 'utf-8');

        // Send via Discord Client
        const { client: discordClient } = await import('../discordClient.js');

        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel) {
            throw new Error("Channel not found.");
        }

        await channel.send({
            content: `**Conversation History (${type.toUpperCase()})** (${count} messages)`,
            files: [{
                attachment: buffer,
                name: `history-${type}-${channel_id}-${Date.now()}.txt`
            }]
        });

        // Update deferred response
        const { DiscordRequest } = await import('../utils.js');
        await DiscordRequest(`webhooks/${application_id}/${token}/messages/@original`, {
            method: 'PATCH',
            body: { content: "History exported! (See attachment below)" }
        });

    } catch (error) {
        console.error("Error exporting history:", error);
        const { DiscordRequest } = await import('../utils.js');
        await DiscordRequest(`webhooks/${application_id}/${token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `Failed to export history: ${error.message}` }
        });
    }
}
