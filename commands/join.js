import { client } from '../discordClient.js';
import { InteractionResponseType } from 'discord-interactions';
import { voiceHandler } from '../handlers/voiceHandler.js';

export const data = {
    name: 'join',
    description: 'Join your voice channel and listen',
    type: 1, // CHAT_INPUT
};

export async function execute(req, res) {
    const { member, guild_id, channel_id } = req.body;

    const guild = client.guilds.cache.get(guild_id);
    if (!guild) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ Bot is not in this guild (Gateway cache miss).' }
        });
    }

    const userMember = await guild.members.fetch(member.user.id);
    const voiceChannel = userMember.voice.channel;

    if (!voiceChannel) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ You are not in a voice channel.' }
        });
    }

    try {
        voiceHandler.join(voiceChannel);

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `🔊 Joined **${voiceChannel.name}** and listening!` }
        });

    } catch (error) {
        console.error(error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ Failed to join voice channel.' }
        });
    }
}
