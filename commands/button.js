import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes, InteractionResponseFlags } from 'discord-interactions';

export const data = {
    name: 'button',
    description: 'Test command for button example',
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
                    content: 'A message with a button',
                },
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.BUTTON,
                            custom_id: 'my_button',
                            label: 'Click',
                            style: ButtonStyleTypes.PRIMARY,
                        },
                    ],
                },
            ],
        },
    });
}

export async function componentHandler(req, res) {
    const { member } = req.body;
    const userId = member.user.id;
    // We don't perform the check for 'my_button' here because the dispatcher will route it here based on ID mapping or logic.
    // However, for safety, we can check.

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `<@${userId}> clicked the button` },
    });
}
