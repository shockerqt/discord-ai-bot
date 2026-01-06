import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'debug',
    description: 'Toggle debug mode for this channel',
    options: [
        {
            type: 3, // STRING
            name: 'mode',
            description: 'Debug mode to enable',
            required: true,
            choices: [
                { name: 'Off - Disable debug', value: 'off' },
                { name: 'Thoughts - Show AI reasoning only', value: 'thoughts' },
                { name: 'Decisions - Show Decision Agent output', value: 'decisions' },
                { name: 'Full - Show input + output', value: 'full' },
            ],
        },
    ],
};

// Default debug mode from env var (useful for local development)
// Values: 'off' | 'thoughts' | 'full'
const DEFAULT_DEBUG_MODE = process.env.DEFAULT_DEBUG_MODE || null;

// In-memory map of channels where debug is enabled: channelId -> mode ('thoughts' | 'full')
const debugChannelsMap = new Map();

/**
 * Get debug mode for a channel
 * Falls back to DEFAULT_DEBUG_MODE if channel has no explicit setting
 */
export function getDebugMode(channelId) {
    if (debugChannelsMap.has(channelId)) {
        return debugChannelsMap.get(channelId);
    }
    return DEFAULT_DEBUG_MODE;
}

// Export for backwards compatibility with existing code
export const debugChannels = {
    get: getDebugMode,
    set: (channelId, mode) => debugChannelsMap.set(channelId, mode),
    delete: (channelId) => debugChannelsMap.delete(channelId),
    has: (channelId) => debugChannelsMap.has(channelId) || DEFAULT_DEBUG_MODE !== null
};

export async function execute(req, res) {
    const { data: commandData, channel_id } = req.body;
    const modeOption = commandData.options.find(opt => opt.name === 'mode');
    const mode = modeOption ? modeOption.value : 'off';

    if (mode === 'off') {
        debugChannelsMap.delete(channel_id);
    } else {
        debugChannelsMap.set(channel_id, mode);
    }

    const modeMessages = {
        off: '🔇 Debug mode **DISABLED** for this channel.',
        thoughts: '💭 Debug mode **THOUGHTS** enabled - Showing AI reasoning only.',
        decisions: '🧠 Debug mode **DECISIONS** enabled - Showing Decision Agent output.',
        full: '📋 Debug mode **FULL** enabled - Showing input + output.',
    };

    let content = modeMessages[mode];
    if (DEFAULT_DEBUG_MODE && mode === 'off') {
        content += `\n*(Note: DEFAULT_DEBUG_MODE="${DEFAULT_DEBUG_MODE}" will still apply)*`;
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content },
    });
}
