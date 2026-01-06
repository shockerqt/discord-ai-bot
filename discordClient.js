import { Client, GatewayIntentBits } from 'discord.js';
import { handlePassiveMessage } from './handlers/messageHandler.js';
import { enqueueMessage } from './utils/messageQueue.js';

// Initialize Discord Client for Voice Gateway
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    try {
        // Encolar mensaje para procesamiento secuencial (storage is handled inside)
        await enqueueMessage(message, handlePassiveMessage);
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

export { client };
