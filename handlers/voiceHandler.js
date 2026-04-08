
import { joinVoiceChannel, getVoiceConnection, EndBehaviorType, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus } from '@discordjs/voice';
import prism from 'prism-media';
import { genAiVoiceService } from '../services/genAiVoiceService.js';
import { PassThrough } from 'stream';

class VoiceHandler {
    constructor() {
        this.subscriptions = new Map();
        this.player = createAudioPlayer();
        this.rawInputStream = null;

        this.player.on('error', error => {
            console.error('[VoiceHandler] Audio player error:', error);
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            // If we go idle, it might be because the stream ended or we stopped it.
            // We'll clean up the stream if it exists.
            if (this.rawInputStream) {
                this.rawInputStream.destroy();
                this.rawInputStream = null;
            }
        });

        // Output Pipeline: GenAI -> Discord
        genAiVoiceService.on('audio', (audioBuffer) => {
            this._playAudio(audioBuffer);
        });

        // Handle interruptions
        genAiVoiceService.on('interrupted', () => {
            console.log('[VoiceHandler] Interrupted by GenAI');
            this.player.stop();
            if (this.rawInputStream) {
                this.rawInputStream.destroy();
                this.rawInputStream = null;
            }
        });

        genAiVoiceService.on('connected', () => {
            console.log('[VoiceHandler] GenAI Connected');
        });

        genAiVoiceService.on('error', (e) => {
            console.log('[VoiceHandler] GenAI Error', e);
        });
    }

    async join(voiceChannel) {
        if (!voiceChannel) throw new Error('Voice channel is required');

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        connection.subscribe(this.player);

        console.log(`[VoiceHandler] Joined voice channel: ${voiceChannel.name}`);

        // Connect to GenAI
        try {
            await genAiVoiceService.connect();
        } catch (e) {
            console.error('[VoiceHandler] Failed to connect to GenAI:', e);
        }

        this._setupReceiver(connection);
        return connection;
    }

    leave(guildId) {
        const connection = getVoiceConnection(guildId);
        if (connection) {
            connection.destroy();
            genAiVoiceService.disconnect();
            this.player.stop();
            if (this.rawInputStream) {
                this.rawInputStream.destroy();
                this.rawInputStream = null;
            }
            console.log(`[VoiceHandler] Left voice channel in guild ${guildId}`);
            return true;
        }
        return false;
    }

    _setupReceiver(connection) {
        const receiver = connection.receiver;

        receiver.speaking.on('start', (userId) => {
            // Input Pipeline: Discord User -> Opus -> PCM -> FFmpeg(16k) -> GenAI

            const opusStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 100,
                },
            });

            const opusDecoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

            // Transcoder: 48k stereo -> 16k mono
            const transcoder = new prism.FFmpeg({
                args: [
                    '-analyzeduration', '0',
                    '-loglevel', '0',
                    '-f', 's16le',
                    '-ar', '48000',
                    '-ac', '2',
                    '-i', '-',
                    '-f', 's16le',
                    '-ar', '16000',
                    '-ac', '1',
                ],
            });

            const pipeline = opusStream.pipe(opusDecoder).pipe(transcoder);

            pipeline.on('data', (buffer) => {
                genAiVoiceService.sendAudio(buffer);
            });

            pipeline.on('error', (err) => {
                console.error(`[VoiceHandler] Pipeline error for user ${userId}:`, err);
            });
        });
    }

    _playAudio(audioBuffer) {
        // Output Pipeline: GenAI (24k mono) -> Buffer -> FFmpeg(48k stereo) -> Discord

        if (!this.rawInputStream) {
            // Create new pipeline
            this.rawInputStream = new PassThrough();

            const transcoder = new prism.FFmpeg({
                args: [
                    '-analyzeduration', '0',
                    '-loglevel', '0',
                    '-f', 's16le',
                    '-ar', '24000', // GenAI output rate
                    '-ac', '1',
                    '-i', '-',
                    '-f', 's16le', // Output as raw PCM for AudioResource
                    '-ar', '48000',
                    '-ac', '2',
                ],
            });

            // Handle transcoder errors to prevent crashes
            transcoder.on('error', (err) => {
                // Suppress "premature close" errors which are common when stopping streams
                if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
                    console.error('[VoiceHandler] Transcoder error:', err);
                }
            });

            const outputStream = this.rawInputStream.pipe(transcoder);

            const resource = createAudioResource(outputStream, {
                inputType: StreamType.Raw
            });

            this.player.play(resource);
        }

        // Write the chunk to the stream
        this.rawInputStream.write(audioBuffer);
    }
}

export const voiceHandler = new VoiceHandler();
