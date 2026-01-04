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

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Use passive message handler for everything
    await handlePassiveMessage(message);
});

export { client };
