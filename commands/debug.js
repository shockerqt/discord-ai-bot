import { InteractionResponseType } from 'discord-interactions';

export const data = {
    name: 'debug',
    description: 'Toggle debug mode for this channel (shows JSON output)',
    options: [
        {
            type: 5, // BOOLEAN
            name: 'enabled',
            description: 'Enable or disable debug output',
            required: true,
        },
    ],
};

// In-memory set of channels where debug is enabled
export const debugChannels = new Set();

export async function execute(req, res) {
    const { data: commandData, channel_id } = req.body;
    const enabledOption = commandData.options.find(opt => opt.name === 'enabled');
    const isEnabled = enabledOption ? enabledOption.value : false;

    if (isEnabled) {
        debugChannels.add(channel_id);
    } else {
        debugChannels.delete(channel_id);
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `Debug mode ${isEnabled ? 'ENABLED' : 'DISABLED'} for this channel.`,
        },
    });
}
