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
export function getDecisionSystemMessage() {
    return DECISION_INSTRUCTIONS;
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
