import { Client, GatewayIntentBits } from 'discord.js';
import { handlePassiveMessage } from './handlers/messageHandler.js';

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
        await handlePassiveMessage(message);
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

export { client };
