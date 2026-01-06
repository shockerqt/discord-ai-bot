import { Client, GatewayIntentBits } from 'discord.js';
import { handlePassiveMessage, extractUserMessages } from './handlers/messageHandler.js';
import { addUserMessages } from './utils/messageStore.js';
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
        // Save to history IMMEDIATELY
        const userMsgs = extractUserMessages([message]);
        addUserMessages(message.channel.id, userMsgs);

        // Encolar mensaje para procesamiento secuencial
        await enqueueMessage(message, handlePassiveMessage);
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

export { client };
