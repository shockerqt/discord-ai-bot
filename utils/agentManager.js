/**
 * Agent Manager - Gestiona instrucciones y configuración de los agentes
 * Usando Chat Completions API (no beta agents)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPersonality, getTemperature, getPresencePenalty, getFrequencyPenalty } from './configStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base instructions (output format) - always loaded
const BASE_INSTRUCTIONS = readFileSync(join(__dirname, '../prompts/output_format.md'), 'utf-8');

// Decision agent instructions
const DECISION_INSTRUCTIONS = readFileSync(join(__dirname, '../prompts/decision_agent.md'), 'utf-8');

/**
 * Get Lumi's full system message (base instructions + personality)
 */
// State tracking to prevent infinite fetching for servers with 0 emojis
let hasFetchedAppEmojis = false;
const fetchedGuilds = new Set();

/**
 * Get Lumi's full system message (base instructions + personality + dynamic context)
 * @param {Object} context - Optional context { client, channel, guild }
 */
export async function getLumiSystemMessage(context = {}) {
    let instructions = BASE_INSTRUCTIONS;
    if (context.bypassPersonality) {
        instructions += `\n\n---\n\nEres Lumi, un asistente virtual de IA útil, directo y conversacional. Fuiste invocada directamente. Responde a las consultas del usuario de manera clara y objetiva, sin usar tu personalidad habitual.`;
    } else {
        const personality = getPersonality();
        if (personality) {
            instructions += `\n\n---\n\n${personality}`;
        }
    }

    instructions += `\n\n## USO DE HERRAMIENTAS (GIFs)\nTienes acceso a una herramienta de búsqueda de GIFs (gif_tool). De vez en cuando, si la conversación es divertida, casual, o amerita una reacción visual, ¡no dudes en usarla para enviar un meme o un GIF animado! No lo hagas todo el tiempo, solo cuando aporte al momento.`;

    // Dynamic Emoji Injection (Simplified Mapping)
    // Collect from Guild AND Application
    const allEmojis = [];

    // Resolve Client
    const client = context.client || context.channel?.client;

    // Helper to format emoji for list
    const formatEmojiForList = (e) => {
        let label = e.name;
        if (label.toLowerCase().includes('sappy')) {
            label += ' (foca)';
        }
        return label;
    };

    // 1. App Emojis
    if (client && client.application) {
        // App emojis are usually global, but let's check cache first
        if (client.application.emojis.cache.size === 0 && !hasFetchedAppEmojis) {
            try {
                console.log('[SystemPrompt] Fetching App Emojis...');
                await client.application.emojis.fetch();
            } catch (e) {
                console.error('[SystemPrompt] Failed to fetch app emojis:', e);
            } finally {
                hasFetchedAppEmojis = true;
            }
        }
        const appEmojis = client.application.emojis.cache.map(formatEmojiForList);
        allEmojis.push(...appEmojis);
        console.log(`[SystemPrompt] App emojis found: ${appEmojis.length}`);
    } else {
        console.log('[SystemPrompt] Client or Application not found in context.');
    }

    // 2. Guild Emojis
    if (context.guild || (context.channel && context.channel.guild)) {
        const guild = context.guild || context.channel.guild;
        console.log(`[SystemPrompt] Injecting emojis for guild: ${guild.name} (${guild.id})`);

        // FORCE FETCH IF CACHE EMPTY AND NOT FETCHED BEFORE
        if (guild.emojis.cache.size === 0 && !fetchedGuilds.has(guild.id)) {
            try {
                console.log('[SystemPrompt] Guild emoji cache empty. Fetching...');
                await guild.emojis.fetch();
                console.log(`[SystemPrompt] Fetched ${guild.emojis.cache.size} emojis.`);
            } catch (e) {
                console.error('[SystemPrompt] Failed to fetch guild emojis:', e);
            } finally {
                fetchedGuilds.add(guild.id);
            }
        }

        const guildEmojis = guild.emojis.cache.map(formatEmojiForList);
        allEmojis.push(...guildEmojis);
        console.log(`[SystemPrompt] Guild emojis found: ${guildEmojis.length}`);
    } else {
        console.log('[SystemPrompt] No guild context available for emojis.');
    }

    // Combine and slice
    const uniqueEmojiList = [...new Set(allEmojis)].slice(0, 100);

    if (uniqueEmojiList.length > 0) {
        instructions += `\n\n## EMOJIS DISPONIBLES
Puedes usar tanto emojis estándar (Unicode) como los siguientes emojis personalizados.
PREFERENCIA: Intenta usar los emojis personalizados cuando encajen.
NOTA: Los emojis a veces tienen una descripcion entre paréntesis que indica su origen. Por ejemplo, "sappy_love (foca)" significa que es un emoji de foca.
Puedes poner los emojis en medio del mensaje o puedes mandarlos en un mensaje nuevo si quieres que destaquen.

REGLA DE FORMATO: Solo escribe el nombre del emoji entre dos puntos. 
Ejemplo: si en la lista dice "523423pepe", tú escribe :523423pepe:. Si dice "23912sappy_love (foca)", escribe :23912sappy_love:.

LISTA:
${uniqueEmojiList.join(', ')}`;
    } else {
        console.log('[SystemPrompt] No emojis (guild or app) available to inject.');
    }

    return instructions;
}

/**
 * Get decision agent's system message
 */
import { getToolDefinitions } from './tools/registry.js';

// ... (existing imports)

/**
 * Get decision agent's system message
 */
export function getDecisionSystemMessage() {
    const tools = getToolDefinitions();
    let instructions = DECISION_INSTRUCTIONS;

    if (tools.length > 0) {
        const toolsDesc = tools.map(t => `- **${t.function.name}**: ${t.function.description}`).join('\n');
        instructions += `\n\n## HERRAMIENTAS ACTIVAS DE LUMI\nLumi tiene acceso a las siguientes herramientas. Si el usuario pide algo relacionado con esto, DEBES marcarlo como RESPONDER:\n${toolsDesc}\n\n`;
    }

    return instructions;
}

/**
 * Get Lumi's model parameters
 */
export function getLumiParams() {
    return {
        temperature: getTemperature(),
        presence_penalty: getPresencePenalty(),
        frequency_penalty: getFrequencyPenalty()
    };
}

/**
 * Get base instructions (for display in /configure show)
 */
export function getBaseInstructions() {
    return BASE_INSTRUCTIONS;
}
