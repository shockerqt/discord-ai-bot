
import { getVoiceConnection } from '@discordjs/voice';
import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'leave',
    description: 'Leave the voice channel',
    type: 1, // CHAT_INPUT
};

export async function execute(req, res) {
    const { guild_id } = req.body;

    const connection = getVoiceConnection(guild_id);

    if (connection) {
        connection.destroy();
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
