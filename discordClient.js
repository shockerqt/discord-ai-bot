import { Client, GatewayIntentBits } from 'discord.js';
import { getChatResponse, handlePassiveMessage } from './commands/chat.js';

// Initialize Discord Client for Voice Gateway
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

// Buffer storage: ChannelID -> { messages: [], timer: NodeJS.Timeout }
const channelBuffers = new Map();

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    const channelId = message.channel.id;

    // Get or create buffer
    let buffer = channelBuffers.get(channelId);
    if (!buffer) {
        buffer = { messages: [], timer: null };
        channelBuffers.set(channelId, buffer);
    }

    // Add message to buffer
    buffer.messages.push(message);

    // Reset timer
    if (buffer.timer) clearTimeout(buffer.timer);

    buffer.timer = setTimeout(async () => {
        // Capture messages and clear buffer
        const messagesToProcess = [...buffer.messages];
        channelBuffers.delete(channelId); // Remove buffer immediately to start fresh

        try {
            await handlePassiveMessage(messagesToProcess);
        } catch (error) {
            console.error("Error processing buffered messages:", error);
        }
    }, 3000); // 3 seconds window
});

export { client };
