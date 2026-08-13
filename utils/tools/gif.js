/**
 * GIF Tool (KLIPY API)
 * Searches KLIPY's Tenor-compatible GIF endpoint without retaining results.
 */

const KLIPY_SEARCH_URL = 'https://api.klipy.com/v2/search';
const DEFAULT_TIMEOUT_MS = 8000;
const SEARCH_LIMIT = 5;

export const definition = {
    type: 'function',
    function: {
        name: 'gif_tool',
        description: 'Search KLIPY for a real HTTPS GIF URL. Use this when the user asks for a GIF, meme, or visual reaction.',
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

function findGifUrl(result) {
    const formats = result?.media_formats || {};
    const candidates = [
        formats.gif?.url,
        formats.mediumgif?.url,
        formats.tinygif?.url,
        formats.nanogif?.url,
        result?.url,
    ];

    return candidates.find(candidate => {
        try {
            return new URL(candidate).protocol === 'https:';
        } catch {
            return false;
        }
    }) || null;
}

/**
 * Execute the GIF tool.
 * Dependencies are injectable so tests never call the live provider.
 */
export async function execute(args, {
    apiKey = process.env.KLIPY_API_KEY,
    fetchImpl = globalThis.fetch,
    random = Math.random,
    timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
    const term = String(args?.search_term || '').trim();
    if (!apiKey) {
        return JSON.stringify({ error: 'missing_key', details: 'KLIPY_API_KEY is not configured.' });
    }
    if (!term) {
        return JSON.stringify({ error: 'invalid_search', details: 'A non-empty search term is required.' });
    }

    const url = new URL(KLIPY_SEARCH_URL);
    url.search = new URLSearchParams({
        q: term,
        key: apiKey,
        client_key: 'lumi_bot',
        limit: String(SEARCH_LIMIT),
        media_filter: 'gif,mediumgif,tinygif',
        contentfilter: 'medium',
    }).toString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetchImpl(url, {
            headers: { accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            return JSON.stringify({
                error: 'upstream_error',
                status: response.status,
                details: 'KLIPY search request failed.'
            });
        }

        const data = await response.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        const usable = results
            .map(result => ({ result, gifUrl: findGifUrl(result) }))
            .filter(item => item.gifUrl);

        if (usable.length === 0) {
            return JSON.stringify({ result: null, details: 'No usable GIFs found for that term.' });
        }

        const index = Math.min(Math.floor(random() * usable.length), usable.length - 1);
        const selected = usable[index];
        return JSON.stringify({
            result: selected.gifUrl,
            provider: 'klipy',
            details: `Found a GIF for "${term}".`
        });
    } catch (error) {
        if (error?.name === 'AbortError') {
            return JSON.stringify({ error: 'timeout', details: 'KLIPY search timed out.' });
        }
        return JSON.stringify({ error: 'network_error', details: 'KLIPY search could not be completed.' });
    } finally {
        clearTimeout(timeout);
    }
}
