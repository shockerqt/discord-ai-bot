/**
 * Config Store - Persistencia de configuración en archivo XML
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, '../config.xml');

// Personas disponibles: asistente informativo o el personaje Lumi
export const PERSONAS = {
    ASSISTANT: 'assistant',
    LUMI: 'lumi'
};

// Cuántos mensajes previos se leen del canal como contexto
const MIN_CONTEXT_LIMIT = 0;
const MAX_CONTEXT_LIMIT = 100;

// Default values
const DEFAULT_CONFIG = {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    temperature: 0.7,
    presence_penalty: 0,
    frequency_penalty: 0,
    persona: PERSONAS.ASSISTANT,
    context_limit: 20,
    personality: ''
};

// In-memory config
let config = { ...DEFAULT_CONFIG };

/**
 * Parse XML config file
 */
function parseXmlConfig(xmlContent) {
    const parsed = {};

    const text = (tag) => {
        const match = xmlContent.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
        return match ? match[1].trim() : null;
    };

    const provider = text('provider');
    if (provider) parsed.provider = provider;

    const model = text('model');
    if (model) parsed.model = model;

    const temperature = text('temperature');
    if (temperature) parsed.temperature = parseFloat(temperature);

    const presencePenalty = text('presence_penalty');
    if (presencePenalty) parsed.presence_penalty = parseFloat(presencePenalty);

    const frequencyPenalty = text('frequency_penalty');
    if (frequencyPenalty) parsed.frequency_penalty = parseFloat(frequencyPenalty);

    const persona = text('persona');
    if (persona) parsed.persona = normalizePersona(persona);

    const contextLimit = text('context_limit');
    if (contextLimit) parsed.context_limit = clampContextLimit(contextLimit);

    // La personalidad puede contener cualquier cosa (incluido markdown multilínea)
    const personality = text('personality');
    if (personality !== null) parsed.personality = personality;

    return parsed;
}

/**
 * Normaliza el valor de persona a uno de los soportados.
 */
function normalizePersona(value) {
    const normalized = String(value).trim().toLowerCase();
    return normalized === PERSONAS.LUMI ? PERSONAS.LUMI : PERSONAS.ASSISTANT;
}

/**
 * Acota el límite de contexto a un rango válido para la API de Discord.
 */
function clampContextLimit(value) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return DEFAULT_CONFIG.context_limit;
    return Math.min(Math.max(parsed, MIN_CONTEXT_LIMIT), MAX_CONTEXT_LIMIT);
}

/**
 * Generate XML from config object
 */
function generateXml(cfg) {
    return `<config>
<provider>${cfg.provider}</provider>
<model>${cfg.model}</model>
<temperature>${cfg.temperature}</temperature>
<presence_penalty>${cfg.presence_penalty}</presence_penalty>
<frequency_penalty>${cfg.frequency_penalty}</frequency_penalty>
<persona>${cfg.persona}</persona>
<context_limit>${cfg.context_limit}</context_limit>
<personality>
${cfg.personality}
</personality>
</config>`;
}

/**
 * Load config from file (called on startup)
 */
export function loadConfig() {
    try {
        if (existsSync(CONFIG_PATH)) {
            const content = readFileSync(CONFIG_PATH, 'utf-8');
            const parsed = parseXmlConfig(content);
            config = { ...DEFAULT_CONFIG, ...parsed };
            console.log('[ConfigStore] Loaded config from file');
        } else {
            console.log('[ConfigStore] No config file found, using defaults');
            saveConfig(); // Create default file
        }
    } catch (error) {
        console.error('[ConfigStore] Error loading config:', error);
    }
    return config;
}

/**
 * Save current config to file
 */
export function saveConfig() {
    try {
        writeFileSync(CONFIG_PATH, generateXml(config), 'utf-8');
        console.log('[ConfigStore] Config saved');
    } catch (error) {
        console.error('[ConfigStore] Error saving config:', error);
    }
}

// Getters
export function getTemperature() { return config.temperature; }
export function getPresencePenalty() { return config.presence_penalty; }
export function getFrequencyPenalty() { return config.frequency_penalty; }
export function getPersonality() { return config.personality; }
export function getProvider() { return config.provider; }
export function getPersona() { return config.persona; }
export function getContextLimit() { return config.context_limit; }

// Setters (auto-save)
export function setProvider(value) {
    config.provider = value;
    saveConfig();
}

export function setModel(value) {
    config.model = value;
    saveConfig();
}

export function setTemperature(value) {
    config.temperature = parseFloat(value);
    saveConfig();
}

export function setPresencePenalty(value) {
    config.presence_penalty = parseFloat(value);
    saveConfig();
}

export function setFrequencyPenalty(value) {
    config.frequency_penalty = parseFloat(value);
    saveConfig();
}

export function setPersona(value) {
    config.persona = normalizePersona(value);
    saveConfig();
    return config.persona;
}

export function setContextLimit(value) {
    config.context_limit = clampContextLimit(value);
    saveConfig();
    return config.context_limit;
}

export function setPersonality(value) {
    config.personality = value;
    saveConfig();
}

// Get all config (for display)
export function getConfig() {
    return { ...config };
}

// Initialize on import
loadConfig();
