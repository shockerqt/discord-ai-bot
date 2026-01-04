
import { Client, GatewayIntentBits } from 'discord.js';

// Initialize Discord Client for Voice Gateway
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

export { client };
