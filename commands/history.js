import { Mistral } from '@mistralai/mistralai';
import { getConversationId } from '../utils/conversationStore.js';
import { InteractionResponseType } from 'discord-interactions';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

export const data = {
    name: 'history',
    description: 'Download the full conversation history for this channel.',
    type: 1, // CHAT_INPUT
};

export async function execute(req, res) {
    const { channel_id } = req.body;

    // 1. Get Conversation ID
    const conversationId = getConversationId(channel_id);

    if (!conversationId) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: "No active conversation found for this channel.",
            },
        });
    }

    // Defer response because fetching might take a moment
    await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    try {
        // 2. Fetch Messages from Mistral Beta API
        const messages = await client.beta.conversations.getMessages({
            conversationId: conversationId,
        });

        // 3. Format as JSON string
        const jsonHistory = JSON.stringify(messages, null, 2);
        const buffer = Buffer.from(jsonHistory, 'utf-8');

        // 4. Send as File via Discord Client (since we can't easily upload files via the interaction response token without multipart complexity, using the client is easier)
        // We need to import the client. Wait, chat.js doesn't import 'discordClient' but 'app.js' does.
        // Let's rely on the global 'discordClient.js' export if possible, or pass it?
        // Actually, we can import { client as discordClient } from '../discordClient.js';

        // Dynamic import to avoid circular dep issues if any, or just standard import.
        // Using standard import.
        const { client: discordClient } = await import('../discordClient.js');

        const channel = await discordClient.channels.fetch(channel_id);
        if (!channel) {
            throw new Error("Channel not found locally.");
        }

        await channel.send({
            content: `**Conversation History**\n**ID**: \`${conversationId}\``,
            files: [{
                attachment: buffer,
                name: `history-${conversationId}.json`
            }]
        });

        // We already deferred, so we don't need to "reply" to the interaction webhhook if the channel send works. 
        // But to be clean, we should update the original interaction or just let it succeed silently?
        // Discord will show "Thinking..." until we edit the original response.
        // Let's edit the original interaction to say "Sent!"

        // We can use the discordClient to edit the interaction reply too if we have the token, but simpler is:
        // We can't use `res.send` again.
        // We can use `DiscordRequest` to patch the original interaction.

        const { application_id, token } = req.body;
        const { DiscordRequest } = await import('../utils.js');
        await DiscordRequest(`webhooks/${application_id}/${token}/messages/@original`, {
            method: 'PATCH',
            body: { content: "History dumped! (See attachment below)" }
        });

    } catch (error) {
        console.error("Error fetching history:", error);
        const { application_id, token } = req.body;
        const { DiscordRequest } = await import('../utils.js');
        await DiscordRequest(`webhooks/${application_id}/${token}/messages/@original`, {
            method: 'PATCH',
            body: { content: `Failed to fetch history: ${error.message}` }
        });
    }
}
