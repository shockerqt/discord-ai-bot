import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { handlePassiveMessage } from './handlers/messageHandler.js';
import { enqueueMessage } from './utils/messageQueue.js';
import { logFeedback } from './utils/feedbackStore.js';

// Initialize Discord Client for Voice Gateway
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    try {
        // Encolar mensaje para procesamiento secuencial (storage is handled inside)
        await enqueueMessage(message, handlePassiveMessage);
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // Solo procesar reacciones del dueño del bot (admin)
    if (user.bot) return;
    
    try {
        // Fetch full reaction if partial
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();

        const ownerId = client.application?.owner?.id;
        if (!ownerId) {
            await client.application?.fetch();
        }

        // Verify if user is owner
        if (client.application?.owner?.id !== user.id) return;

        const message = reaction.message;
        const emojiName = reaction.emoji.name;

        // Falso Positivo: Lumi respondió pero no debió (👎 a un mensaje de Lumi)
        if (message.author.id === client.user.id && emojiName === '👎') {
            console.log(`[Feedback] Falso Positivo detectado (👎) en mensaje ID: ${message.id}`);
            
            // Get some context (previous 5 messages)
            const msgs = await message.channel.messages.fetch({ limit: 30, before: message.id });
            const contextText = msgs.map(m => `[${m.author.username}]: ${m.content}`).reverse().join('\n');

            logFeedback({
                type: 'FALSE_POSITIVE',
                botMessageId: message.id,
                botResponse: message.content,
                context: contextText,
                humanCorrection: 'IGNORAR',
                userId: user.id,
                userName: user.username
            });

            // Borrar el mensaje de Lumi por ser una mala respuesta
            try {
                await message.delete();
                console.log(`[Feedback] Mensaje de Lumi borrado exitosamente.`);
            } catch (err) {
                console.error(`[Feedback] Error al borrar mensaje de Lumi:`, err);
            }
        }
        
        // Falso Negativo: Lumi ignoró pero debió responder (🤖 a un mensaje de usuario)
        if (message.author.id !== client.user.id && emojiName === '🤖') {
            console.log(`[Feedback] Falso Negativo detectado (🤖) en mensaje ID: ${message.id}`);
            
            const msgs = await message.channel.messages.fetch({ limit: 30, before: message.id });
            const contextText = msgs.map(m => `[${m.author.username}]: ${m.content}`).reverse().join('\n');

            logFeedback({
                type: 'FALSE_NEGATIVE',
                userMessageId: message.id,
                userMessageContent: message.content,
                context: contextText,
                humanCorrection: 'RESPONDER',
                userId: user.id,
                userName: user.username
            });
            
            // Proveer feedback visual al admin
            await message.react('✅');
        }

    } catch (error) {
        console.error("Error handling reaction:", error);
    }
});

client.on(Events.ClientReady, async () => {
    console.log(`[Discord] Logged in as ${client.user.tag}!`);
    try {
        if (client.application) {
            console.log('[Discord] Fetching application emojis...');
            await client.application.emojis.fetch();
            console.log(`[Discord] Fetched ${client.application.emojis.cache.size} application emojis.`);
        }
    } catch (e) {
        console.error('[Discord] Failed to fetch app emojis:', e);
    }
});

export { client };
