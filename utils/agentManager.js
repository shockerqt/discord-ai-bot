/**
 * Agent Manager - Ensambla el system prompt y los parámetros del modelo
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
    getPersonality, getTemperature, getPresencePenalty, getFrequencyPenalty,
    getPersona, PERSONAS
} from './configStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Formato de salida (XML) - siempre presente
const OUTPUT_FORMAT = readFileSync(join(__dirname, '../prompts/output_format.md'), 'utf-8');

// Persona "assistant": bot informativo, sin personaje
const ASSISTANT_INSTRUCTIONS = readFileSync(join(__dirname, '../prompts/assistant.md'), 'utf-8');

// Persona "lumi": personaje completo
const LUMI_INSTRUCTIONS = readFileSync(join(__dirname, '../LUMI_INSTRUCTIONS.md'), 'utf-8');

// Evita reintentar el fetch de emojis en servidores que no tienen ninguno
let hasFetchedAppEmojis = false;
const fetchedGuilds = new Set();

/**
 * Construye el system prompt completo.
 * @param {Object} context - { client, channel, guild, persona }
 * @returns {Promise<string>}
 */
export async function getSystemMessage(context = {}) {
    const persona = context.persona || getPersona();
    const isCharacter = persona === PERSONAS.LUMI;

    let instructions = OUTPUT_FORMAT;

    if (isCharacter) {
        instructions += `\n\n---\n\n${LUMI_INSTRUCTIONS}`;

        const personality = getPersonality();
        if (personality && personality.trim() !== '') {
            instructions += `\n\n---\n\n### REGLAS DE PERSONALIDAD ADICIONALES:\n${personality}`;
        }

        instructions += `\n\n## USO DE HERRAMIENTAS (GIFs)\nTienes acceso a una herramienta de búsqueda de GIFs (gif_tool). Si la conversación es divertida o casual, no dudes en usarla para enviar un meme o GIF. No lo hagas todo el tiempo, solo cuando aporte al momento. IMPORTANTE: No inventes URLs de GIFs; DEBES usar gif_tool para obtener el enlace real.`;

        instructions += await buildEmojiSection(context);
    } else {
        instructions += `\n\n---\n\n${ASSISTANT_INSTRUCTIONS}`;

        const personality = getPersonality();
        if (personality && personality.trim() !== '') {
            instructions += `\n\n---\n\n### INSTRUCCIONES ADICIONALES DEL ADMINISTRADOR:\n${personality}`;
        }

        instructions += `\n\n## USO DE HERRAMIENTAS\nTienes herramientas disponibles (dados, búsqueda de GIFs, estado del bot). Úsalas solo cuando el usuario lo pida explícitamente o cuando sean necesarias para responder. No inventes URLs: si envías un GIF, DEBES obtener el enlace con gif_tool.`;
    }

    return instructions;
}

/**
 * Lista los emojis personalizados disponibles (servidor + aplicación).
 * Solo se usa en la persona con personaje, donde los emojis aportan al tono.
 * @param {Object} context - { client, channel, guild }
 * @returns {Promise<string>}
 */
async function buildEmojiSection(context) {
    const emojis = [];
    const client = context.client || context.channel?.client;

    const formatEmoji = (emoji) => {
        let label = emoji.name;
        if (label.toLowerCase().includes('sappy')) label += ' (foca)';
        return label;
    };

    // 1. Emojis de la aplicación
    if (client?.application) {
        if (client.application.emojis.cache.size === 0 && !hasFetchedAppEmojis) {
            try {
                await client.application.emojis.fetch();
            } catch (e) {
                console.error('[SystemPrompt] Failed to fetch app emojis:', e);
            } finally {
                hasFetchedAppEmojis = true;
            }
        }
        emojis.push(...client.application.emojis.cache.map(formatEmoji));
    }

    // 2. Emojis del servidor
    const guild = context.guild || context.channel?.guild;
    if (guild) {
        if (guild.emojis.cache.size === 0 && !fetchedGuilds.has(guild.id)) {
            try {
                await guild.emojis.fetch();
            } catch (e) {
                console.error('[SystemPrompt] Failed to fetch guild emojis:', e);
            } finally {
                fetchedGuilds.add(guild.id);
            }
        }
        emojis.push(...guild.emojis.cache.map(formatEmoji));
    }

    const uniqueEmojis = [...new Set(emojis)].slice(0, 100);
    if (uniqueEmojis.length === 0) return '';

    return `\n\n## EMOJIS DISPONIBLES
Puedes usar emojis estándar (Unicode) y también los personalizados de esta lista.
NOTA: La descripción entre paréntesis indica el origen del emoji. "sappy_love (foca)" significa que es un emoji de foca.

REGLA DE FORMATO: Escribe el nombre del emoji entre dos puntos.
Ejemplo: si la lista dice "523423pepe", escribe :523423pepe:. Si dice "23912sappy_love (foca)", escribe :23912sappy_love:.

LISTA:
${uniqueEmojis.join(', ')}`;
}

/**
 * Parámetros del modelo configurados por el usuario.
 */
export function getAgentParams() {
    return {
        temperature: getTemperature(),
        presence_penalty: getPresencePenalty(),
        frequency_penalty: getFrequencyPenalty()
    };
}

/**
 * Instrucciones base de formato (para mostrarlas en /configure show)
 */
export function getBaseInstructions() {
    return OUTPUT_FORMAT;
}
