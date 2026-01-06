/**
 * Emoji Tool
 * Allows the AI to search and use custom emojis from the Bot Application and the current Guild.
 */
import { client } from '../../discordClient.js';

export const definition = {
    type: 'function',
    function: {
        name: 'emoji_tool',
        description: 'Search for a custom emoji by name or concept. Use this to add flavor to messages using available custom emojis.',
        parameters: {
            type: 'object',
            properties: {
                search_term: {
                    type: 'string',
                    description: 'The name or concept to search for (e.g. "pepe", "laugh", "pog").'
                },
                guild_id: {
                    type: 'string',
                    description: 'The ID of the current guild/server to search in (optional, but recommended).'
                }
            },
            required: ['search_term']
        }
    }
};

/**
 * Execute the Emoji tool
 */
export async function execute(args) {
    const term = args.search_term.toLowerCase();
    const guildId = args.guild_id;

    let allEmojis = [];

    try {
        // 1. Fetch Application Emojis (Global)
        if (client.application) {
            const appEmojis = await client.application.emojis.fetch();
            allEmojis.push(...appEmojis.values());
        }

        // 2. Fetch Guild Emojis (if guild_id provided)
        if (guildId) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                const guildEmojis = await guild.emojis.fetch();
                allEmojis.push(...guildEmojis.values());
            }
        } else {
            // Fallback: Check cache of all guilds (less reliable if not fetched)
            client.guilds.cache.forEach(g => {
                allEmojis.push(...g.emojis.cache.values());
            });
        }

        if (allEmojis.length === 0) {
            return JSON.stringify({ result: null, details: 'No emojis found available to the bot.' });
        }

        // 3. Search Logic (Simple Includes Match)
        // Prefer exact matches first, then includes
        const exactMatch = allEmojis.find(e => e.name.toLowerCase() === term);
        if (exactMatch) {
            return JSON.stringify({
                result: `<${exactMatch.animated ? 'a' : ''}:${exactMatch.name}:${exactMatch.id}>`,
                details: `Found exact emoji match: ${exactMatch.name}`
            });
        }

        const match = allEmojis.find(e => e.name.toLowerCase().includes(term));

        if (match) {
            return JSON.stringify({
                result: `<${match.animated ? 'a' : ''}:${match.name}:${match.id}>`,
                details: `Found emoji match for "${term}": ${match.name}`
            });
        }

        return JSON.stringify({ result: null, details: `No emoji found matching "${term}".` });

    } catch (error) {
        console.error('[Emoji Tool] Error:', error);
        return JSON.stringify({ error: `Emoji search failed: ${error.message}` });
    }
}
