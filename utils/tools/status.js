import { ActivityType } from 'discord.js';
import { client } from '../../discordClient.js';

export const definition = {
    type: 'function',
    function: {
        name: 'status_tool',
        description: 'Changes the bot\'s status (activity) and online status in Discord.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The status text to display (e.g. "Minecraft", "Music").'
                },
                type: {
                    type: 'string',
                    enum: ['PLAYING', 'WATCHING', 'LISTENING', 'COMPETING', 'STREAMING'],
                    description: 'The type of activity.'
                },
                status: {
                    type: 'string',
                    enum: ['online', 'idle', 'dnd', 'invisible'],
                    description: 'The online status (online, idle, do not disturb, invisible).'
                }
            },
            required: ['text']
        }
    }
};

export async function execute({ text, type = 'PLAYING', status = 'online' }) {
    try {
        const activityTypeMap = {
            'PLAYING': ActivityType.Playing,
            'WATCHING': ActivityType.Watching,
            'LISTENING': ActivityType.Listening,
            'COMPETING': ActivityType.Competing,
            'STREAMING': ActivityType.Streaming,
        };

        const activityType = activityTypeMap[type.toUpperCase()];

        if (activityType === undefined) {
            return `Error: Invalid activity type '${type}'. Valid types are: PLAYING, WATCHING, LISTENING, COMPETING, STREAMING.`;
        }

        client.user.setPresence({
            activities: [{ name: text, type: activityType }],
            status: status.toLowerCase()
        });

        console.log(`[StatusTool] Updated status: ${type} ${text} (${status})`);
        return `Successfully updated status to: ${type} "${text}" (${status})`;
    } catch (error) {
        console.error('[StatusTool] Error updating status:', error);
        return `Failed to update status: ${error.message}`;
    }
}
