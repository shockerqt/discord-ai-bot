/**
 * CLI Chat Simulator for Lumi
 * Allows interactive local testing of the entire bot pipeline
 */
import 'dotenv/config';
import readline from 'readline';
import { handlePassiveMessage } from '../handlers/messageHandler.js';
import { clearMessages, getRawMessages } from '../utils/messageStore.js';
import { getPersonality } from '../utils/configStore.js';

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '   🌙 SIMULADOR DE CHAT INTERACTIVO DE LUMI 🌙    ');
console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('Este simulador ejecuta todo el pipeline del bot localmente.');
console.log('Usa tus credenciales de .env (Gemini/Mistral/Groq).');
console.log('\x1b[33m%s\x1b[0m', 'Escribe tu mensaje.');
console.log('Instrucciones especiales:');
console.log(' - Escribe "exit" o "salir" para terminar.');
console.log(' - Escribe "/reset" para reiniciar el historial del canal.');
console.log(' - Escribe "/config" para ver la personalidad y modelo actual.');
console.log(' - Para fingir ser otro usuario, escribe: "nombre: mensaje".');
console.log(' - Para mencionar a Lumi directamento, incluye "@lumi" o "lumi" en el texto.');
console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------------\n');

// Helper to construct a robust mock Collection for emojis
function createMockEmojis() {
    const map = new Map();
    map.map = function(fn) {
        return Array.from(this.values()).map(fn);
    };
    map.find = function(fn) {
        return Array.from(this.values()).find(fn);
    };
    return {
        cache: map,
        fetch: async function() {
            return map;
        }
    };
}

// Mock client user
const BOT_USER_ID = 'lumi-bot-id';
const botUserMock = { id: BOT_USER_ID, tag: 'Lumi#1337' };

// Create Mock Channel
const channelId = 'simulated-channel-123';
const mockGuildEmojis = createMockEmojis();
const mockAppEmojis = createMockEmojis();

const mockChannel = {
    id: channelId,
    name: 'simulador-lumi',
    guild: {
        id: 'simulated-guild-123',
        name: 'Servidor Local',
        emojis: mockGuildEmojis
    },
    client: {
        user: botUserMock,
        application: {
            emojis: mockAppEmojis
        }
    },
    send: async (options) => {
        let content = '';
        let label = '';
        let color = '\x1b[32m'; // Default green for normal system/bot output

        if (typeof options === 'string') {
            content = options;
            label = 'Discord';
        } else {
            content = options.content || '';
            // Detect if it is a debug attachment
            if (options.files && options.files.length > 0) {
                const file = options.files[0];
                const fileContent = file.attachment ? file.attachment.toString('utf-8') : '(vacio)';
                
                if (file.name.includes('prompt')) {
                    label = '⚙️ SYSTEM PROMPT';
                    color = '\x1b[90m'; // Grey
                    content = fileContent;
                } else if (file.name.includes('history')) {
                    label = '🤖 INPUT HISTORY';
                    color = '\x1b[33m'; // Yellow
                    content = fileContent;
                } else if (file.name.includes('trace')) {
                    label = '🛠️ TRACE DE PROCESAMIENTO';
                    color = '\x1b[36m'; // Cyan
                    content = fileContent;
                } else if (file.name.includes('decision')) {
                    label = '🧠 AGENTE DE DECISIONES';
                    color = '\x1b[34m'; // Blue
                    content = fileContent;
                } else {
                    label = `📎 ATTACHMENT (${file.name})`;
                    content = fileContent;
                }
            } else {
                label = 'Lumi';
                color = '\x1b[35m'; // Magenta for Lumi
            }
        }

        // Print output beautifully
        console.log(`\n${color}[${label}]\x1b[0m ${content.trim()}`);

        // Return a mock message object
        const msgId = `mock-msg-${Date.now()}`;
        return {
            id: msgId,
            content: content,
            author: botUserMock,
            channel: mockChannel,
            react: async (emoji) => {
                console.log(`\x1b[36m[Reacción de Lumi]\x1b[0m ${emoji}`);
            },
            edit: async (newContent) => {
                console.log(`\x1b[90m[Mensaje Editado]\x1b[0m ${newContent}`);
                return { id: msgId, content: newContent };
            }
        };
    }
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function askQuestion() {
    rl.question('\x1b[1mTú:\x1b[0m ', async (input) => {
        const text = input.trim();

        if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'salir') {
            rl.close();
            return;
        }

        if (text === '/reset') {
            clearMessages(channelId);
            console.log('\x1b[31m[Sistema] Historial del canal reiniciado.\x1b[0m\n');
            askQuestion();
            return;
        }

        if (text === '/config') {
            const currentPersonality = getPersonality();
            console.log('\n\x1b[33m--- CONFIGURACIÓN ACTUAL ---\x1b[0m');
            console.log(`\x1b[36mReglas dinámicas de personalidad:\x1b[0m\n${currentPersonality || '(Ninguna regla dinámica)'}`);
            console.log('\x1b[33m----------------------------\x1b[0m\n');
            askQuestion();
            return;
        }

        if (!text) {
            askQuestion();
            return;
        }

        // Parse custom user
        let userName = 'UsuarioPrueba';
        let messageText = text;
        const colonIndex = text.indexOf(':');
        if (colonIndex > 0 && colonIndex < 15) { // e.g., "juan: hola"
            userName = text.substring(0, colonIndex).trim();
            messageText = text.substring(colonIndex + 1).trim();
        }

        // Detect if Lumi is mentioned
        const mentionsLumi = messageText.toLowerCase().includes('lumi') || messageText.includes('@lumi');
        const mentionsSet = new Set();
        if (mentionsLumi) {
            mentionsSet.add(botUserMock);
        }

        // Mock Discord message
        const mockMessage = {
            id: `mock-user-msg-${Date.now()}`,
            content: messageText,
            author: { id: `mock-user-${userName}`, username: userName },
            member: { displayName: userName },
            channel: mockChannel,
            client: { user: botUserMock },
            mentions: {
                has: (user) => mentionsSet.has(user)
            },
            attachments: new Map(),
            reference: null
        };

        console.log(`\n\x1b[90m[Procesando mensaje en pipeline pasivo...]\x1b[0m`);

        try {
            // Run the passive message pipeline
            await handlePassiveMessage([mockMessage]);
        } catch (e) {
            console.error('\x1b[31m[Pipeline Error]\x1b[0m', e);
        }

        // Wait a brief moment to ensure all background tasks finish printing
        setTimeout(() => {
            console.log('');
            askQuestion();
        }, 1500);
    });
}

askQuestion();
rl.on('close', () => {
    console.log('\n\x1b[31mSimulador cerrado.\x1b[0m');
    process.exit(0);
});
