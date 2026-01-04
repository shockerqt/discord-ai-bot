
import { Client, GatewayIntentBits } from 'discord.js';
import { getChatResponse } from './commands/chat.js';

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

    // Check for "Lumi " prefix
    const content = message.content.trim();
    if (content.toLowerCase().startsWith('lumi')) {
        const userMessage = content.slice(4).trim(); // Remove "Lumi"
        if (!userMessage) return; // Ignore "Lumi" only

        // Keep typing indicator active
        let typingInterval;
        const startTyping = async () => {
            await message.channel.sendTyping().catch(() => { });
        };

        try {
            await startTyping(); // Initial trigger
            typingInterval = setInterval(startTyping, 5000); // Refresh every 5s

            // Re-use logic from chat command
            const payloads = await getChatResponse(userMessage, message.channel.id, message.author.username);

            // Send payloads
            for (const payload of payloads) {
                const msgOptions = {
                    content: payload.content || '',
                    embeds: payload.embeds || []
                };
                if (msgOptions.content || msgOptions.embeds.length > 0) {
                    await message.reply(msgOptions);
                }
            }

        } catch (error) {
            console.error("Error handling Lumi message:", error);
            await message.reply("Sorry, I had an error processing that.");
        } finally {
            if (typingInterval) clearInterval(typingInterval);
        }
    }
});

export { client };
