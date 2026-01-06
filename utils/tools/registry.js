/**
 * Tool Registry
 * Manages available tools for the AI Agent.
 */
import * as rngTool from './rng.js';

// Add new tools here
const tools = {
    'rng_tool': rngTool
};

/**
 * Get all tool definitions formatted for the Mistral API
 */
export function getToolDefinitions() {
    return Object.values(tools).map(t => t.definition);
}

/**
 * Execute a tool by name
 * @param {string} name - Tool name
 * @param {Object} args - Arguments object
 */
export async function executeTool(name, args) {
    const tool = tools[name];
    if (!tool) {
        throw new Error(`Tool '${name}' not found.`);
    }
    return await tool.execute(args);
}
