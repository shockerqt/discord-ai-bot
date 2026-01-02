import { InteractionResponseType, MessageComponentTypes } from 'discord-interactions'; // eslint-disable-line no-unused-vars
import { getRandomEmoji } from '../utils.js';

export const data = {
    name: 'test',
    description: 'Basic command',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) { // eslint-disable-line no-unused-vars
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: `hello world ${getRandomEmoji()}`,
        },
    });
}
