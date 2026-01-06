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
export function getLumiSystemMessage() {
    const personality = getPersonality();
    if (personality) {
        return `${BASE_INSTRUCTIONS}\n\n---\n\n${personality}`;
    }
    return BASE_INSTRUCTIONS;
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
