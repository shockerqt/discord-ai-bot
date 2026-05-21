import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVOLUTION_LOG_FILE = path.join(DATA_DIR, 'evolution_log.jsonl');

/**
 * Initializes the evolution store
 */
export function initEvolutionStore() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Appends an evolution event log entry to the jsonl file.
 * @param {Object} event - The evolution event data
 */
export function logEvolution(event) {
    try {
        initEvolutionStore();
        const entry = {
            timestamp: new Date().toISOString(),
            ...event
        };
        fs.appendFileSync(EVOLUTION_LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
        console.log(`[EvolutionStore] Logged evolution event. Evolved: ${event.evolved}, Reason: ${event.reason}`);
    } catch (err) {
        console.error('[EvolutionStore] Error writing to evolution log file:', err);
    }
}

/**
 * Gets the path to the evolution log file.
 * @returns {string} The absolute path to the log file.
 */
export function getEvolutionLogFilePath() {
    return EVOLUTION_LOG_FILE;
}

/**
 * Gets the most recent evolution entries.
 * @param {number} limit - The maximum number of entries to return.
 * @returns {Array<Object>} Array of recent evolution entries.
 */
export function getRecentEvolutions(limit = 50) {
    try {
        if (!fs.existsSync(EVOLUTION_LOG_FILE)) return [];
        
        const content = fs.readFileSync(EVOLUTION_LOG_FILE, 'utf8');
        const lines = content.trim().split('\n');
        
        const history = [];
        // Parse from end to get most recent first
        for (let i = lines.length - 1; i >= 0 && history.length < limit; i--) {
            if (lines[i].trim()) {
                try {
                    history.push(JSON.parse(lines[i]));
                } catch (e) {
                    // Ignore malformed lines
                }
            }
        }
        return history; // Return in reverse chronological order (most recent first)
    } catch (err) {
        console.error('[EvolutionStore] Error reading evolution history:', err);
        return [];
    }
}

// Initialize on load
initEvolutionStore();
