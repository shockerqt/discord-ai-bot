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
/**
 * Get Lumi's full system message (base instructions + personality + dynamic context)
 * @param {Object} context - Optional context { client, channel, guild }
 */
export function getLumiSystemMessage(context = {}) {
    let instructions = BASE_INSTRUCTIONS;
    const personality = getPersonality();

    if (personality) {
        instructions += `\n\n---\n\n${personality}`;
    }

    // Dynamic Emoji Injection
    // Dynamic Emoji Injection
    // Collect from Guild AND Application
    const allEmojis = [];

    // 1. App Emojis
    if (context.client && context.client.application) {
        const appEmojis = context.client.application.emojis.cache.map(e => `:${e.name}: (<${e.animated ? 'a' : ''}:${e.name}:${e.id}>)`);
        allEmojis.push(...appEmojis);
        console.log(`[SystemPrompt] App emojis found: ${appEmojis.length}`);
    }

    // 2. Guild Emojis
    if (context.guild || (context.channel && context.channel.guild)) {
        const guild = context.guild || context.channel.guild;
        console.log(`[SystemPrompt] Injecting emojis for guild: ${guild.name} (${guild.id})`);

        const guildEmojis = guild.emojis.cache.map(e => `:${e.name}: (<${e.animated ? 'a' : ''}:${e.name}:${e.id}>)`);
        allEmojis.push(...guildEmojis);
        console.log(`[SystemPrompt] Guild emojis found: ${guildEmojis.length}`);
    } else {
        console.log('[SystemPrompt] No guild context available for emojis.');
    }

    // Combine and slice
    const uniqueEmojiList = [...new Set(allEmojis)].slice(0, 100);

    if (uniqueEmojiList.length > 0) {
        instructions += `\n\n## EMOJIS DISPONIBLES
Puedes usar cualquier emoji estándar de Unicode (ej: 🔥, 😂).
TAMBIÉN puedes usar los siguientes emojis personalizados del servidor/app.
IMPORTANTE: Para usarlos, DEBES escribirlos exactamente como aparecen entre paréntesis, incluyendo los corchetes angulares.
Formato: <:nombre:id> o <a:nombre:id> (animado).

Lista:
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
