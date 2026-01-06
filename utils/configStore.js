/**
 * Config Store - Persistencia de configuración en archivo XML
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG_PATH = join(__dirname, '../config.xml');

console.log('[ConfigStore] CWD:', process.cwd());
console.log('[ConfigStore] Resolving config path to:', CONFIG_PATH);

// Default values
const DEFAULT_CONFIG = {
    temperature: 0.7,
    presence_penalty: 0,
    frequency_penalty: 0,
    personality: ''
};

// In-memory config
let config = { ...DEFAULT_CONFIG };

/**
 * Parse XML config file
 */
function parseXmlConfig(xmlContent) {
    const parsed = {};

    // Extract temperature
    const tempMatch = xmlContent.match(/<temperature>([\s\S]*?)<\/temperature>/i);
    if (tempMatch) parsed.temperature = parseFloat(tempMatch[1].trim());

    // Extract presence_penalty
    const presMatch = xmlContent.match(/<presence_penalty>([\s\S]*?)<\/presence_penalty>/i);
    if (presMatch) parsed.presence_penalty = parseFloat(presMatch[1].trim());

    // Extract frequency_penalty
    const freqMatch = xmlContent.match(/<frequency_penalty>([\s\S]*?)<\/frequency_penalty>/i);
    if (freqMatch) parsed.frequency_penalty = parseFloat(freqMatch[1].trim());

    // Extract personality (can contain any content)
    const persMatch = xmlContent.match(/<personality>([\s\S]*?)<\/personality>/i);
    if (persMatch) parsed.personality = persMatch[1].trim();

    return parsed;
}

/**
 * Generate XML from config object
 */
function generateXml(cfg) {
    return `<config>
<temperature>${cfg.temperature}</temperature>
<presence_penalty>${cfg.presence_penalty}</presence_penalty>
<frequency_penalty>${cfg.frequency_penalty}</frequency_penalty>
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
        const xml = generateXml(config);
        writeFileSync(CONFIG_PATH, xml, 'utf-8');
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

// Setters (auto-save)
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
