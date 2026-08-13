/**
 * Suite de pruebas del pipeline de menciones.
 *
 * Corre sin credenciales: el proveedor de IA se reemplaza por un doble de prueba.
 * Uso: npm run test:e2e
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { isInvocation } from '../discordClient.js';
import { buildConversationContext, extractMedia, stripBotMention } from '../utils/contextBuilder.js';
import { parseAIResponse } from '../handlers/message/responseParser.js';
import { splitMessage } from '../handlers/message/messageSender.js';
import { ChatProviderFactory } from '../services/ai/ChatProviderFactory.js';
import { GeminiChatAdapter } from '../services/ai/GeminiChatAdapter.js';
import { handleMention } from '../handlers/mentionHandler.js';

const BOT_ID = 'lumi-bot-id';
const botUser = { id: BOT_ID, tag: 'Lumi#1337', username: 'Lumi' };

// ============================================================================
// DOBLES DE PRUEBA
// ============================================================================

function createMockChannel({ history = [] } = {}) {
    const sent = [];
    const typing = { count: 0 };

    const channel = {
        id: 'test-channel',
        name: 'test-channel',
        guild: null,
        sent,
        typing,
        client: { user: botUser, application: null },
        sendTyping: async () => { typing.count++; },
        send: async (options) => {
            const payload = typeof options === 'string' ? { content: options } : options;
            sent.push(payload);
            return {
                id: `sent-${sent.length}`,
                content: payload.content ?? '',
                author: botUser,
                delete: async () => { },
                edit: async () => { },
            };
        },
        messages: {
            // Devuelve del más nuevo al más viejo, como la API real de Discord
            fetch: async ({ limit = 50, before } = {}) => {
                let items = history;
                if (before) {
                    const index = history.findIndex(m => m.id === before);
                    if (index >= 0) items = history.slice(0, index);
                }
                const newestFirst = items.slice().reverse().slice(0, limit);
                return new Map(newestFirst.map(m => [m.id, m]));
            }
        }
    };

    for (const message of history) message.channel = channel;
    return channel;
}

let messageCounter = 0;
function createMockMessage({
    content = '',
    authorId = 'user-1',
    username = 'Tester',
    isBot = false,
    mentionsBot = false,
    attachments = [],
    reference = null,
    referenced = null,
    channel = null,
} = {}) {
    messageCounter++;
    const message = {
        id: `msg-${messageCounter}`,
        content,
        author: { id: isBot ? BOT_ID : authorId, username: isBot ? 'Lumi' : username, bot: isBot },
        member: { displayName: isBot ? 'Lumi' : username },
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, messageCounter % 60)),
        attachments: new Map(attachments.map((a, i) => [`att-${i}`, a])),
        reference,
        client: { user: botUser, application: null },
        mentions: {
            users: new Map(mentionsBot ? [[BOT_ID, botUser]] : []),
            has(user) { return this.users.has(user.id ?? user); },
        },
        fetchReference: async () => referenced,
    };
    if (channel) message.channel = channel;
    return message;
}

/**
 * Proveedor falso: devuelve las respuestas programadas en orden.
 */
function createFakeProvider(responses) {
    const calls = [];
    return {
        calls,
        complete: async (messages, options) => {
            calls.push({ messages: JSON.parse(JSON.stringify(messages)), options });
            const next = responses.shift() ?? { content: '' };
            return {
                content: next.content ?? '',
                toolCalls: next.toolCalls ?? null,
                usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
                provider: 'fake',
                model: options.model,
            };
        }
    };
}

// ============================================================================
// RUNNER
// ============================================================================

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        console.log(`🟢 \x1b[32mPASS\x1b[0m ${name}`);
        passed++;
    } catch (error) {
        console.error(`🔴 \x1b[31mFAIL\x1b[0m ${name}`);
        console.error(`   ${error.message}`);
        failed++;
    }
}

// ============================================================================
// 1. DETECCIÓN DE INVOCACIÓN
// ============================================================================

await test('Responde a una mención directa del bot', () => {
    assert.equal(isInvocation(createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true })), true);
});

await test('Ignora un mensaje normal sin mención', () => {
    assert.equal(isInvocation(createMockMessage({ content: 'hablando entre nosotros' })), false);
});

await test('Ignora @everyone y menciones de rol', () => {
    const message = createMockMessage({ content: '@everyone reunión ahora' });
    message.mentions.everyone = true;
    message.mentions.roles = new Map([['role-1', { id: 'role-1' }]]);
    assert.equal(isInvocation(message), false);
});

// ============================================================================
// 2. CONTEXTO LEÍDO DESDE DISCORD
// ============================================================================

await test('Limpia la mención del texto', () => {
    assert.equal(stripBotMention('<@lumi-bot-id> qué hora es', BOT_ID), 'qué hora es');
    assert.equal(stripBotMention('<@!lumi-bot-id>  hola', BOT_ID), 'hola');
});

await test('Detecta audio adjunto y no confunde otros archivos', () => {
    const audio = createMockMessage({
        attachments: [{ url: 'http://x/a.ogg', contentType: 'audio/ogg; codecs=opus', name: 'nota.ogg', size: 1000 }]
    });
    const media = extractMedia(audio);
    assert.equal(media.length, 1);
    assert.equal(media[0].type, 'audio');
    assert.equal(media[0].mimeType, 'audio/ogg');

    const doc = createMockMessage({
        attachments: [{ url: 'http://x/a.pdf', contentType: 'application/pdf', name: 'doc.pdf', size: 10 }]
    });
    assert.equal(extractMedia(doc), null);
});

await test('Construye el contexto en orden cronológico y agrupa por rol', async () => {
    const history = [
        createMockMessage({ content: 'primero', username: 'Ana' }),
        createMockMessage({ content: 'segundo', username: 'Beto' }),
        createMockMessage({ content: 'respuesta del bot', isBot: true }),
    ];
    const channel = createMockChannel({ history });
    const trigger = createMockMessage({
        content: '<@lumi-bot-id> resume la conversación',
        username: 'Ana',
        mentionsBot: true,
        channel,
    });
    history.push(trigger);

    const context = await buildConversationContext(trigger, { limit: 10 });

    assert.equal(context.length, 3, 'debe agrupar los dos mensajes de usuario en un bloque');
    assert.equal(context[0].role, 'user');
    assert.ok(context[0].content.includes('Ana: primero'));
    assert.ok(context[0].content.includes('Beto: segundo'));
    assert.equal(context[1].role, 'assistant');
    assert.equal(context[1].content, 'respuesta del bot');

    const last = context[2];
    assert.equal(last.role, 'user');
    assert.ok(last.content.includes('resume la conversación'));
    assert.ok(!last.content.includes('<@'), 'la mención no debe llegar al modelo');
});

await test('Respeta el límite de mensajes de contexto', async () => {
    const history = Array.from({ length: 30 }, (_, i) =>
        createMockMessage({ content: `mensaje ${i}`, username: 'Ana' }));
    const channel = createMockChannel({ history });
    const trigger = createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true, channel });
    history.push(trigger);

    const context = await buildConversationContext(trigger, { limit: 5 });
    // Los 5 previos se agrupan en un bloque 'user' + el mensaje de la mención
    assert.equal(context.length, 2);
    assert.ok(context[0].content.includes('mensaje 29'));
    assert.ok(!context[0].content.includes('mensaje 24'), 'no debe traer más de 5 mensajes');
});

await test('Incluye el mensaje citado cuando se responde a alguien', async () => {
    const channel = createMockChannel({ history: [] });
    const quoted = createMockMessage({ content: 'el deploy falló', username: 'Beto' });
    const trigger = createMockMessage({
        content: '<@lumi-bot-id> por qué?',
        mentionsBot: true,
        reference: { messageId: quoted.id },
        referenced: quoted,
        channel,
    });

    const context = await buildConversationContext(trigger, { limit: 5 });
    assert.ok(context.at(-1).content.includes('el deploy falló'));
});

await test('Sobrevive a un canal sin permiso de leer historial', async () => {
    const channel = createMockChannel({ history: [] });
    channel.messages.fetch = async () => { throw new Error('Missing Access'); };
    const trigger = createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true, channel });

    const context = await buildConversationContext(trigger, { limit: 10 });
    assert.equal(context.length, 1, 'debe quedar solo el mensaje de la mención');
});

// ============================================================================
// 3. PARSEO DE RESPUESTAS
// ============================================================================

await test('Parsea el formato XML esperado', () => {
    const parsed = parseAIResponse('<THOUGHT>pienso</THOUGHT><MESSAGE><TEXT_CONTENT>Hola</TEXT_CONTENT><REACTION>🔥</REACTION></MESSAGE>');
    assert.equal(parsed.thought, 'pienso');
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].text_content, 'Hola');
    assert.equal(parsed.messages[0].reaction, '🔥');
});

await test('Preserva bloques de código dentro de la respuesta', () => {
    const raw = '```xml\n<MESSAGE><TEXT_CONTENT>Usa:\n```js\nconst a = 1;\n```\n</TEXT_CONTENT></MESSAGE>\n```';
    const parsed = parseAIResponse(raw);
    assert.ok(parsed.messages[0].text_content.includes('```js'), 'el bloque de código interno debe sobrevivir');
});

await test('Responde igual si el modelo ignora el formato XML', () => {
    const parsed = parseAIResponse('El puerto por defecto es 3000.');
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].text_content, 'El puerto por defecto es 3000.');
});

await test('Trata NULL como ausencia de valor', () => {
    const parsed = parseAIResponse('<MESSAGE><TEXT_CONTENT>hola</TEXT_CONTENT><REACTION>NULL</REACTION><ATTACHMENT>NULL</ATTACHMENT></MESSAGE>');
    assert.equal(parsed.messages[0].reaction, null);
    assert.equal(parsed.messages[0].attachment, null);
});

await test('Gemini 3.7 omite muestreo deprecado y conserva function calling', async () => {
    const adapter = new GeminiChatAdapter({ apiKey: 'test-key' });
    let request;
    adapter.client = {
        models: {
            generateContent: async (payload) => {
                request = payload;
                return {
                    text: '',
                    usageMetadata: {},
                    candidates: [{ content: { parts: [{ functionCall: { name: 'rng_tool', args: { mode: 'ROLL' } } }] } }]
                };
            }
        }
    };

    const response = await adapter.complete(
        [{ role: 'user', content: 'hola' }],
        {
            model: 'gemini-3.7-flash',
            temperature: 0.7,
            tools: [{ function: { name: 'rng_tool', description: 'Roll dice', parameters: { type: 'object', properties: {} } } }],
            toolChoice: 'auto'
        }
    );

    assert.equal(response.model, 'gemini-3.7-flash');
    assert.equal(request.model, 'gemini-3.7-flash');
    assert.equal('temperature' in request.config, false);
    assert.equal(request.config.thinkingConfig.thinkingLevel, 'low');
    assert.equal(request.config.toolConfig.functionCallingConfig.mode, 'auto');
    assert.equal(request.config.tools[0].functionDeclarations[0].name, 'rng_tool');
    assert.equal(response.toolCalls[0].function.name, 'rng_tool');
});

await test('Gemini anterior conserva temperatura configurable', async () => {
    const adapter = new GeminiChatAdapter({ apiKey: 'test-key' });
    let request;
    adapter.client = {
        models: {
            generateContent: async (payload) => {
                request = payload;
                return { text: 'ok', usageMetadata: {} };
            }
        }
    };

    await adapter.complete(
        [{ role: 'user', content: 'hola' }],
        { model: 'gemini-3.1-flash-lite', temperature: 0.4 }
    );

    assert.equal(request.config.temperature, 0.4);
});

// ============================================================================
// 4. DIVISIÓN DE MENSAJES LARGOS
// ============================================================================

await test('Divide respuestas largas sin perder contenido ni romper el código', () => {
    const long = 'intro\n```js\n'
        + Array.from({ length: 200 }, (_, i) => `const linea${i} = ${i};`).join('\n')
        + '\n```\nfin';
    const chunks = splitMessage(long);

    assert.ok(chunks.length > 1, 'debe partirse en varios mensajes');
    for (const chunk of chunks) {
        assert.ok(chunk.length <= 2000, `chunk de ${chunk.length} caracteres excede el límite`);
        assert.equal((chunk.match(/```/g) || []).length % 2, 0, 'bloques de código balanceados');
    }
    const normalize = s => s.replace(/```\w*/g, '').replace(/\s+/g, '');
    assert.equal(normalize(chunks.join('\n')), normalize(long), 'no se debe perder contenido');
});

// ============================================================================
// 5. PIPELINE COMPLETO (con proveedor falso)
// ============================================================================

const realCreateProvider = ChatProviderFactory.createProvider;

await test('Pipeline completo: responde citando el mensaje que lo mencionó', async () => {
    const fake = createFakeProvider([
        { content: '<MESSAGE><TEXT_CONTENT>El puerto es 3000.</TEXT_CONTENT></MESSAGE>' }
    ]);
    ChatProviderFactory.createProvider = () => fake;

    try {
        const history = [createMockMessage({ content: 'alguien sabe el puerto?', username: 'Ana' })];
        const channel = createMockChannel({ history });
        const trigger = createMockMessage({
            content: '<@lumi-bot-id> en qué puerto corre?',
            mentionsBot: true,
            channel,
        });
        history.push(trigger);

        await handleMention(trigger);

        assert.equal(channel.sent.length, 1, 'debe enviar exactamente un mensaje');
        assert.equal(channel.sent[0].content, 'El puerto es 3000.');
        assert.deepEqual(channel.sent[0].reply, { messageReference: trigger.id });
        assert.equal(channel.typing.count, 1, 'debe mostrar el indicador de escritura');

        // El system prompt y el contexto llegaron al modelo
        const sentToModel = fake.calls[0].messages;
        assert.equal(sentToModel[0].role, 'system');
        assert.ok(sentToModel.at(-1).content.includes('en qué puerto corre?'));
        assert.ok(sentToModel.some(m => m.content?.includes('alguien sabe el puerto?')), 'debe incluir el contexto del canal');
    } finally {
        ChatProviderFactory.createProvider = realCreateProvider;
    }
});

await test('Pipeline completo: ejecuta una tool y luego responde', async () => {
    const fake = createFakeProvider([
        {
            content: '',
            toolCalls: [{
                id: 'call-1',
                function: { name: 'rng_tool', arguments: JSON.stringify({ mode: 'ROLL', dice: '1d6' }) }
            }]
        },
        { content: '<MESSAGE><TEXT_CONTENT>Salió un 4.</TEXT_CONTENT></MESSAGE>' }
    ]);
    ChatProviderFactory.createProvider = () => fake;

    try {
        const channel = createMockChannel({ history: [] });
        const trigger = createMockMessage({
            content: '<@lumi-bot-id> tira un dado',
            mentionsBot: true,
            channel,
        });

        await handleMention(trigger);

        assert.equal(fake.calls.length, 2, 'debe llamar al modelo otra vez con el resultado de la tool');
        const secondCall = fake.calls[1].messages;
        assert.ok(secondCall.some(m => m.role === 'tool'), 'el resultado de la tool debe ir en el historial');
        assert.equal(channel.sent.at(-1).content, 'Salió un 4.');
    } finally {
        ChatProviderFactory.createProvider = realCreateProvider;
    }
});

await test('Pipeline completo: cambia de modelo si el principal agota la cuota', async () => {
    let attempts = 0;
    const fake = {
        complete: async (messages, options) => {
            attempts++;
            if (attempts === 1) {
                const error = new Error('429 RESOURCE_EXHAUSTED');
                error.status = 429;
                throw error;
            }
            return {
                content: '<MESSAGE><TEXT_CONTENT>Respondo con el modelo de respaldo.</TEXT_CONTENT></MESSAGE>',
                toolCalls: null,
                usage: null,
                provider: 'fake',
                model: options.model,
            };
        }
    };
    ChatProviderFactory.createProvider = () => fake;

    try {
        const channel = createMockChannel({ history: [] });
        const trigger = createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true, channel });

        await handleMention(trigger);

        assert.equal(attempts, 2, 'debe reintentar con el modelo de respaldo');
        assert.equal(channel.sent.at(-1).content, 'Respondo con el modelo de respaldo.');
    } finally {
        ChatProviderFactory.createProvider = realCreateProvider;
    }
});

await test('Pipeline completo: no envía nada si el modelo falla del todo', async () => {
    const fake = {
        complete: async () => { throw new Error('Bad Request'); }
    };
    ChatProviderFactory.createProvider = () => fake;

    try {
        const channel = createMockChannel({ history: [] });
        const trigger = createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true, channel });

        await handleMention(trigger);
        assert.equal(channel.sent.length, 0, 'no debe enviar mensajes vacíos ni errores al canal');
    } finally {
        ChatProviderFactory.createProvider = realCreateProvider;
    }
});

// ============================================================================
// RESUMEN
// ============================================================================

console.log(`\n${passed} pruebas OK, ${failed} fallidas`);
process.exit(failed > 0 ? 1 : 0);
