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
                { name: 'Full - Show input + output', value: 'full' },
            ],
        },
    ],
};

// In-memory map of channels where debug is enabled: channelId -> mode ('thoughts' | 'full')
export const debugChannels = new Map();

export async function execute(req, res) {
    const { data: commandData, channel_id } = req.body;
    const modeOption = commandData.options.find(opt => opt.name === 'mode');
    const mode = modeOption ? modeOption.value : 'off';

    if (mode === 'off') {
        debugChannels.delete(channel_id);
    } else {
        debugChannels.set(channel_id, mode);
    }

    const modeMessages = {
        off: '🔇 Debug mode **DISABLED** for this channel.',
        thoughts: '💭 Debug mode **THOUGHTS** enabled - Showing AI reasoning only.',
        full: '📋 Debug mode **FULL** enabled - Showing input + output.',
    };

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: modeMessages[mode],
        },
    });
}
