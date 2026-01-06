/**
 * RNG Tool
 * Allows the AI to generate random numbers and select random options.
 */

export const definition = {
    type: 'function',
    function: {
        name: 'rng_tool',
        description: 'Use this tool to roll dice (d6, d20, etc.) or pick a random option from a list. Use this whenever a user asks to roll dice, flip a coin, or decide between options.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['ROLL', 'PICK'],
                    description: 'The action to perform: ROLL for numbers/dice, PICK for selecting from a list.'
                },
                min: {
                    type: 'integer',
                    description: 'Minimum value (inclusive) for ROLL. Default 1.',
                },
                max: {
                    type: 'integer',
                    description: 'Maximum value (inclusive) for ROLL. Default 6 (for d6) or 20 (for d20).',
                },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of options to pick from if action is PICK. (e.g. ["Heads", "Tails"])'
                }
            },
            required: ['action']
        }
    }
};

/**
 * Execute the RNG tool
 */
export async function execute(args) {
    if (args.action === 'ROLL') {
        const min = args.min ?? 1;
        const max = args.max ?? 6;
        const result = Math.floor(Math.random() * (max - min + 1)) + min;
        return JSON.stringify({
            result: result,
            details: `Rolled a number between ${min} and ${max}`
        });
    }

    if (args.action === 'PICK') {
        if (!args.options || args.options.length === 0) {
            return JSON.stringify({ error: 'No options provided for PICK action.' });
        }
        const index = Math.floor(Math.random() * args.options.length);
        const choice = args.options[index];
        return JSON.stringify({
            result: choice,
            details: `Picked randomly from: ${args.options.join(', ')}`
        });
    }

    return JSON.stringify({ error: 'Invalid action' });
}
