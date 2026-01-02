import { InteractionResponseType, MessageComponentTypes, InteractionResponseFlags } from 'discord-interactions';

export const data = {
    name: 'select',
    description: 'Test command for select menu example',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
                {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: 'What is your object of choice?',
                },
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.STRING_SELECT,
                            custom_id: 'my_select',
                            options: [
                                {
                                    label: 'Option #1',
                                    value: 'option_1',
                                    description: 'The very first option',
                                },
                                {
                                    label: 'Second option',
                                    value: 'option_2',
                                    description: 'The second AND last option',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    });
}

export async function componentHandler(req, res) {
    const { data, member } = req.body;
    const selectedOption = data.values[0];
    const userId = member.user.id;

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `<@${userId}> selected ${selectedOption}` },
    });
}
