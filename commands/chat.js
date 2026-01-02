import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { Mistral } from '@mistralai/mistralai';
import { getUserModel } from '../userSettings.js';


const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

export const data = {
    name: 'chat',
    description: 'Chat with Mistral AI',
    options: [
        {
            type: 3, // STRING
            name: 'message',
            description: 'The message to send to the AI',
            required: true,
        },
        {
            type: 3, // STRING
            name: 'model',
            description: 'Select the model to use',
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
    const { data, token, application_id, member, user } = req.body;
    const userId = member ? member.user.id : user.id;

    const userMessage = data.options.find(opt => opt.name === 'message').value;
    const modelOption = data.options.find(opt => opt.name === 'model');

    // Use provided option, or fallback to user setting, or fallback to default
    const model = modelOption ? modelOption.value : getUserModel(userId);

    // 1. Defer the response immediately
    // We use DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (Type 5)
    // This tells Discord we are thinking...
    await res.send({
        type: 5, // InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE is 5
    });

    // 2. Generate content
    try {
        const chatResponse = await mistral.chat.complete({
            model: model,
            messages: [{ role: 'user', content: userMessage }],
        });

        const aiContent = chatResponse.choices[0].message.content;

        // 3. Edit the original deferred message
        const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

        // Discord has a 2000 char limit. Simple truncation for now.
        // Ideally we should split or use an embed if too long.
        const finalContent = aiContent.length > 2000 ? aiContent.substring(0, 1997) + '...' : aiContent;

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: finalContent,
            },
        });

    } catch (error) {
        console.error('Error fetching Mistral response:', error);
        // Attempt to update message with error
        const endpoint = `webhooks/${application_id}/${token}/messages/@original`;
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: 'Sorry, I encountered an error while talking to the AI.',
            },
        });
    }
}
