import { InteractionResponseType, MessageComponentTypes, ButtonStyleTypes, InteractionResponseFlags } from 'discord-interactions';
import { getShuffledOptions, getResult, getRPSChoices } from '../game.js'; // Ensure path is correct relative to commands/
import { getRandomEmoji, capitalize, DiscordRequest } from '../utils.js';

// Get the game choices from game.js
function createCommandChoices() {
    const choices = getRPSChoices();
    const commandChoices = [];

    for (let choice of choices) {
        commandChoices.push({
            name: capitalize(choice),
            value: choice.toLowerCase(),
        });
    }

    return commandChoices;
}

export const data = {
    name: 'challenge',
    description: 'Challenge to a match of rock paper scissors',
    options: [
        {
            type: 3,
            name: 'object',
            description: 'Pick your object',
            required: true,
            choices: createCommandChoices(),
        },
    ],
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 2],
};

// Store for in-progress games. In production, you'd want to use a DB
export const activeGames = {};

export async function execute(req, res) {
    const { id, member, user, data } = req.body;
    const context = req.body.context;
    const userId = context === 0 ? member.user.id : user.id;
    const objectName = data.options[0].value;

    activeGames[id] = {
        id: userId,
        objectName,
    };

    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
                {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: `Rock papers scissors challenge from <@${userId}>`,
                },
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.BUTTON,
                            custom_id: `accept_button_${id}`,
                            label: 'Accept',
                            style: ButtonStyleTypes.PRIMARY,
                        },
                    ],
                },
            ],
        },
    });
}

export async function componentHandler(req, res) {
    const { data, message, token } = req.body;
    const componentId = data.custom_id;

    if (componentId.startsWith('accept_button_')) {
        const gameId = componentId.replace('accept_button_', '');
        const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/${message.id}`;
        try {
            await res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
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
                                    custom_id: `select_choice_${gameId}`,
                                    options: getShuffledOptions(),
                                },
                            ],
                        },
                    ],
                },
            });
            await DiscordRequest(endpoint, { method: 'DELETE' });
        } catch (err) {
            console.error('Error sending message:', err);
        }
    } else if (componentId.startsWith('select_choice_')) {
        const gameId = componentId.replace('select_choice_', '');

        if (activeGames[gameId]) {
            const context = req.body.context;
            const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
            const objectName = data.values[0];
            const resultStr = getResult(activeGames[gameId], {
                id: userId,
                objectName,
            });

            delete activeGames[gameId];
            const endpoint = `webhooks/${process.env.APP_ID}/${token}/messages/${message.id}`;

            try {
                await res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                        components: [
                            {
                                type: MessageComponentTypes.TEXT_DISPLAY,
                                content: resultStr
                            }
                        ]
                    },
                });
                await DiscordRequest(endpoint, {
                    method: 'PATCH',
                    body: {
                        components: [
                            {
                                type: MessageComponentTypes.TEXT_DISPLAY,
                                content: 'Nice choice ' + getRandomEmoji()
                            }
                        ]
                    },
                });
            } catch (err) {
                console.error('Error sending message:', err);
            }
        }
    }
}
