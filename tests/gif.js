import assert from 'node:assert/strict';
import { execute } from '../utils/tools/gif.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
        passed++;
    } catch (error) {
        console.error(`FAIL ${name}: ${error.message}`);
        failed++;
    }
}

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    json: async () => body,
});

await test('returns a deterministic HTTPS KLIPY GIF', async () => {
    let request;
    const output = JSON.parse(await execute(
        { search_term: 'happy dance' },
        {
            apiKey: 'secret-test-key',
            random: () => 0,
            fetchImpl: async (url, options) => {
                request = { url, options };
                return jsonResponse({
                    results: [{ media_formats: { gif: { url: 'https://media.klipy.com/happy.gif' } } }]
                });
            }
        }
    ));

    assert.equal(output.result, 'https://media.klipy.com/happy.gif');
    assert.equal(output.provider, 'klipy');
    assert.equal(request.url.origin, 'https://api.klipy.com');
    assert.equal(request.url.pathname, '/v2/search');
    assert.equal(request.url.searchParams.get('q'), 'happy dance');
    assert.equal(request.url.searchParams.get('key'), 'secret-test-key');
    assert.equal(request.options.headers.accept, 'application/json');
});

await test('reports a missing KLIPY key without making a request', async () => {
    let called = false;
    const output = JSON.parse(await execute(
        { search_term: 'cat' },
        { apiKey: '', fetchImpl: async () => { called = true; } }
    ));
    assert.equal(output.error, 'missing_key');
    assert.equal(called, false);
});

await test('reports empty or unusable search results', async () => {
    const output = JSON.parse(await execute(
        { search_term: 'nothing' },
        { apiKey: 'key', fetchImpl: async () => jsonResponse({ results: [{ url: 'http://unsafe.test/a.gif' }] }) }
    ));
    assert.equal(output.result, null);
});

await test('reports upstream failures without exposing the key', async () => {
    const output = await execute(
        { search_term: 'cat' },
        { apiKey: 'never-print-this', fetchImpl: async () => jsonResponse({}, { ok: false, status: 429 }) }
    );
    const parsed = JSON.parse(output);
    assert.equal(parsed.error, 'upstream_error');
    assert.equal(parsed.status, 429);
    assert.equal(output.includes('never-print-this'), false);
});

await test('aborts a stalled KLIPY request', async () => {
    const output = JSON.parse(await execute(
        { search_term: 'slow' },
        {
            apiKey: 'key',
            timeoutMs: 5,
            fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
            })
        }
    ));
    assert.equal(output.error, 'timeout');
});

console.log(`\n${passed} GIF unit tests passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
