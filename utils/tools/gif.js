/**
 * GIF Tool (Tenor API)
 * Allows the AI to search for GIFs.
 */
// Native fetch in Node 18+

export const definition = {
    type: 'function',
    function: {
        name: 'gif_tool',
        description: 'Search for a GIF URL based on a search term. Use this when the user asks for a gif, meme, or visual reaction.',
        parameters: {
            type: 'object',
            properties: {
                search_term: {
                    type: 'string',
                    description: 'The phrase to search for (e.g. "funny cat", "anime wow", "facepalm").'
                }
            },
            required: ['search_term']
        }
    }
};

/**
 * Execute the GIF tool
 */
export async function execute(args) {
    const term = args.search_term;
    const apiKey = process.env.TENOR_API_KEY;

    if (!apiKey) {
        return JSON.stringify({ error: 'Config Error: TENOR_API_KEY is not set in environment variables.' });
    }

    try {
        const limit = 5;
        const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(term)}&key=${apiKey}&client_key=discord_ai_bot&limit=${limit}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Tenor API Error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            return JSON.stringify({ result: null, details: 'No GIFs found for that term.' });
        }

        // Pick a random one from the top 5 to vary responses
        const index = Math.floor(Math.random() * data.results.length);
        const gifUrl = data.results[index].media_formats.gif.url;
        const itemUrl = data.results[index].itemurl;

        return JSON.stringify({
            result: gifUrl,
            details: `Found GIF for "${term}": ${itemUrl}`
        });

    } catch (error) {
        console.error('[GIF Tool] Error:', error);
        return JSON.stringify({ error: `Search failed: ${error.message}` });
    }
}
