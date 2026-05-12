import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(DATA_DIR, 'decisions_log.jsonl');

/**
 * Initializes the feedback store
 */
export function initFeedbackStore() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Appends a feedback log entry to the jsonl file.
 * @param {Object} feedback - The feedback data
 */
export function logFeedback(feedback) {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            ...feedback
        };
        fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
        console.log(`[FeedbackStore] Logged feedback for message ID: ${feedback.messageId}`);
    } catch (err) {
        console.error('[FeedbackStore] Error writing to log file:', err);
    }
}

/**
 * Gets the path to the decisions log file for export.
 * @returns {string} The absolute path to the log file.
 */
export function getLogFilePath() {
    return LOG_FILE;
}

/**
 * Gets the most recent feedback entries.
 * @param {number} limit - The maximum number of entries to return.
 * @returns {Array<Object>} Array of recent feedback entries.
 */
export function getRecentFeedback(limit = 3) {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = content.trim().split('\n');
        
        const feedback = [];
        // Parse from end to get most recent first
        for (let i = lines.length - 1; i >= 0 && feedback.length < limit; i--) {
            if (lines[i].trim()) {
                try {
                    feedback.push(JSON.parse(lines[i]));
                } catch (e) {
                    // Ignore malformed lines
                }
            }
        }
        return feedback.reverse(); // Return in chronological order
    } catch (err) {
        console.error('[FeedbackStore] Error reading recent feedback:', err);
        return [];
    }
}

// Initialize on load
initFeedbackStore();
