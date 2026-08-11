import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';
import { handleMention } from './handlers/mentionHandler.js';

// Cliente de Gateway: escucha menciones y gestiona el canal de voz
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.User],
});

/**
 * Determina si el mensaje invoca al bot.
 *
 * `mentions.users` contiene únicamente las menciones explícitas de usuario, así que
 * cubre tanto un @Lumi escrito a mano como una respuesta a Lumi con ping activado,
 * y excluye por construcción @everyone, @here y las menciones de rol.
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
export function isInvocation(message) {
    const botId = message.client.user?.id;
    if (!botId) return false;
    return message.mentions.users.has(botId);
}

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!isInvocation(message)) return;

    try {
        await handleMention(message);
    } catch (error) {
        console.error('Error handling mention:', error);
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
