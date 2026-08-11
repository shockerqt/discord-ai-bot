/**
 * Simulador de chat local para probar el pipeline de menciones sin Discord.
 *
 * Usa las credenciales de .env (Gemini/Mistral/Groq) y el mismo handler que
 * corre en producción, sobre un canal simulado en memoria.
 *
 * Uso: npm run simulate
 */
import 'dotenv/config';
import readline from 'readline';
import { handleMention } from '../handlers/mentionHandler.js';
import { getConfig } from '../utils/configStore.js';

const BOT_ID = 'lumi-bot-id';
const botUser = { id: BOT_ID, tag: 'Lumi#1337', username: 'Lumi' };

const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const gray = (text) => `\x1b[90m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;

console.log(cyan('=================================================='));
console.log(cyan('   🌙 SIMULADOR DE CHAT DE LUMI (solo menciones)   '));
console.log(cyan('=================================================='));
console.log('Lumi responde solo cuando la mencionas. Todo lo demás es contexto.\n');
console.log('Comandos:');
console.log('  texto normal          → mencionas a Lumi y responde');
console.log('  nombre: texto         → otro usuario escribe (contexto, Lumi NO responde)');
console.log('  /historial            → ver el canal simulado');
console.log('  /reset                → vaciar el canal simulado');
console.log('  /config               → ver la configuración actual');
console.log('  exit                  → salir\n');

// Canal simulado: historial en memoria
const history = [];
let counter = 0;

const channel = {
    id: 'simulated-channel',
    name: 'simulacion',
    guild: null,
    client: { user: botUser, application: null },
    sendTyping: async () => { },
    send: async (options) => {
        const payload = typeof options === 'string' ? { content: options } : options;
        const content = payload.content ?? '';

        if (payload.files?.length > 0) {
            console.log(green(`\n[Lumi] ${content}`));
            for (const file of payload.files) {
                console.log(gray(`       📎 ${file.name || file}`));
                if (file.attachment instanceof Buffer) {
                    console.log(gray(file.attachment.toString('utf-8').slice(0, 1500)));
                }
            }
        } else {
            console.log(green(`\n[Lumi] ${content}`));
        }

        const message = createMessage({ content, isBot: true });
        history.push(message);
        return message;
    },
    messages: {
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

/**
 * Crea un mensaje simulado con la forma que espera el pipeline.
 */
function createMessage({ content, username = 'Tú', isBot = false, mentionsBot = false }) {
    counter++;
    return {
        id: `sim-${counter}`,
        content,
        channel,
        client: { user: botUser, application: null },
        author: { id: isBot ? BOT_ID : `user-${username}`, username: isBot ? 'Lumi' : username, bot: isBot },
        member: { displayName: isBot ? 'Lumi' : username },
        createdAt: new Date(),
        attachments: new Map(),
        reference: null,
        mentions: {
            users: new Map(mentionsBot ? [[BOT_ID, botUser]] : []),
            has(user) { return this.users.has(user.id ?? user); },
        },
        react: async (emoji) => console.log(gray(`       (reaccionó con ${emoji})`)),
        fetchReference: async () => null,
        delete: async () => { },
        edit: async (newContent) => console.log(gray(`       (editó: ${newContent})`)),
    };
}

function showConfig() {
    const cfg = getConfig();
    console.log(yellow('\n--- Configuración ---'));
    console.log(`Persona:            ${cfg.persona}`);
    console.log(`Provider / Model:   ${cfg.provider} / ${cfg.model}`);
    console.log(`Mensajes contexto:  ${cfg.context_limit}`);
    console.log(`Temperature:        ${cfg.temperature}`);
    console.log(`Personalidad extra: ${cfg.personality ? cfg.personality.slice(0, 200) + '...' : '(ninguna)'}`);
    console.log('');
}

function showHistory() {
    console.log(yellow('\n--- Canal simulado ---'));
    if (history.length === 0) console.log('(vacío)');
    for (const message of history) {
        const who = message.author.bot ? 'Lumi' : message.member.displayName;
        console.log(`${who}: ${message.content}`);
    }
    console.log('');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
    rl.question(cyan('> '), async (input) => {
        const text = input.trim();

        if (!text) return prompt();
        if (['exit', 'salir', 'quit'].includes(text.toLowerCase())) {
            console.log('¡Chao!');
            rl.close();
            return;
        }
        if (text === '/config') { showConfig(); return prompt(); }
        if (text === '/historial') { showHistory(); return prompt(); }
        if (text === '/reset') {
            history.length = 0;
            console.log(yellow('Canal simulado vaciado.\n'));
            return prompt();
        }

        // "nombre: mensaje" => otro usuario habla, sin invocar a Lumi
        const asOther = text.match(/^([\w\s]{1,20}):\s*(.+)$/);
        if (asOther) {
            history.push(createMessage({ content: asOther[2], username: asOther[1].trim() }));
            console.log(gray(`(contexto agregado como ${asOther[1].trim()}, Lumi no responde)\n`));
            return prompt();
        }

        // Mención directa: Lumi responde
        const message = createMessage({ content: `<@${BOT_ID}> ${text}`, mentionsBot: true });
        history.push(message);

        try {
            await handleMention(message);
        } catch (error) {
            console.error('\x1b[31m', 'Error en el pipeline:', error.message, '\x1b[0m');
        }
        console.log('');
        prompt();
    });
}

showConfig();
prompt();
