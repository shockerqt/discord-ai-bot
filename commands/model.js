import { InteractionResponseType } from 'discord-interactions';
import { setUserModel, getUserModel } from '../userSettings.js';

export const data = {
    name: 'model',
    description: 'Get or set your preferred Mistral AI model',
    options: [
        {
            type: 3, // STRING
            name: 'model',
            description: 'Select the model to set as default (leave empty to view current)',
            required: false,
            choices: [
                {
                    name: 'Mistral Large (2512)',
                    value: 'mistral-large-2512',
                },
                {
                    name: 'Mistral Small Creative (Labs)',
                    value: 'labs-mistral-small-creative',
                }
            ]
        }
    ],
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { member, data, user } = req.body;
    // User ID is in user field for DMs, and member for servers
    const userId = member ? member.user.id : user.id;

    const modelOption = data.options ? data.options.find(opt => opt.name === 'model') : null;

    if (modelOption) {
        const selectedModel = modelOption.value;
        setUserModel(userId, selectedModel);

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `✅ Your preferred model has been set to: **${selectedModel}**`,
            },
        });
    } else {
        const currentModel = getUserModel(userId);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `ℹ️ Your current preferred model is: **${currentModel}**`,
            },
        });
    }
}
