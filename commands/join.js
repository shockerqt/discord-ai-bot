
import { joinVoiceChannel, getVoiceConnection, EndBehaviorType, generateDependencyReport } from '@discordjs/voice';
import { client } from '../discordClient.js';
import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'join',
    description: 'Join your voice channel and listen',
    type: 1, // CHAT_INPUT
};

console.log(generateDependencyReport());


export async function execute(req, res) {
    const { member, guild_id, channel_id } = req.body;

    // Note: 'member' in interaction payload might not have voice state depending on intents/caching
    // But we have the Gateway client!

    // Check if we are already doing something?
    // We can just proceed.

    // We need to reply to the interaction FIRST to acknowledge it,
    // because joining voice might take a moment or fail.
    // Using DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE might be better, but let's just use instant reply for now.

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
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        console.log(`Joined voice channel: ${voiceChannel.name}`);

        // Setup receiver
        const receiver = connection.receiver;

        receiver.speaking.on('start', (userId) => {
            console.log(`User ${userId} started speaking`);

            // Create a write stream (e.g., PCM file)
            // For now, let's just verify we get a stream
            const opusStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 100,
                },
            });

            // Decrypt/decode logic would go here if we were processing it.
            // Since we paused STT, we just acknowledge receipt.

            /* Example pipeline to file:
            const output = fs.createWriteStream(`./recordings/${userId}-${Date.now()}.pcm`);
            const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
            pipeline(opusStream, decoder, output, (err) => {
                if (err) console.error('Pipeline failed', err);
            });
            */
        });

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
