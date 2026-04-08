import { InteractionResponseType } from 'discord-interactions';
import { voiceHandler } from '../handlers/voiceHandler.js';

export const data = {
    name: 'leave',
    description: 'Leave the voice channel',
    type: 1, // CHAT_INPUT
};

export async function execute(req, res) {
    const { guild_id } = req.body;

    if (voiceHandler.leave(guild_id)) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '👋 Left the voice channel.' },
        });
    } else {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ I am not in a voice channel in this server.' },
        });
    }
}
