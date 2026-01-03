import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'ping',
    description: 'Replies with Pong! (checks bot responsiveness)',
    type: 1, // CHAT_INPUT
};

export async function execute(req, res) {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: 'Pong! 🏓',
        },
    });
}
