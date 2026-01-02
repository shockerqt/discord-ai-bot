import { InteractionResponseType, MessageComponentTypes } from 'discord-interactions';

export const data = {
    name: 'modal',
    description: 'Test command for modal example',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    return res.send({
        type: InteractionResponseType.MODAL,
        data: {
            custom_id: 'my_modal',
            title: 'Modal title',
            components: [
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.INPUT_TEXT,
                            custom_id: 'my_text',
                            style: 1,
                            label: 'Type some text',
                        },
                    ],
                },
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.INPUT_TEXT,
                            custom_id: 'my_longer_text',
                            style: 2,
                            label: 'Type some (longer) text',
                        },
                    ],
                },
            ],
        },
    });
}

export async function modalHandler(req, res) {
    const { data, member } = req.body;
    const userId = member.user.id;

    let modalValues = '';
    for (let action of data.components) {
        let inputComponent = action.components[0];
        modalValues += `${inputComponent.custom_id}: ${inputComponent.value}\n`;
    }

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `<@${userId}> typed the following (in a modal):\n\n${modalValues}`,
        },
    });
}
