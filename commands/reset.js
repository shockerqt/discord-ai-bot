import { InteractionResponseType } from 'discord-interactions';
import { deleteConversationId } from '../utils/conversationStore.js';

export const data = {
    name: 'reset',
    description: 'Reset the current conversation history for this channel',
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { channel_id } = req.body;

    deleteConversationId(channel_id);

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '🧹 Conversation history has been reset for this channel.',
        },
    });
}
