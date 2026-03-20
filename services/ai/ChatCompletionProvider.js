/**
 * Abstract Class / Interface for Chat Completion Providers
 */
export class ChatCompletionProvider {
    /**
     * @param {Object} config - Configuration object (apiKey, etc.)
     */
    constructor(config) {
        this.config = config;
        /** Default model for the decision agent. Override in subclasses. */
        this.decisionModel = 'ministral-14b-latest';
    }

    /**
     * Sends a chat completion request.
     * @param {Array<Object>} messages - Array of message objects {role, content}
     * @param {Object} options - Options for the request
     * @param {String} [options.model] - Model to use
     * @param {number} [options.temperature]
     * @param {number} [options.maxTokens]
     * @param {Array<Object>} [options.tools] - Tool definitions
     * @param {String|Object} [options.toolChoice] - 'auto', 'none', or specific tool
     * @param {Object} [options.responseFormat] - { type: 'json_object' } etc.
     * @returns {Promise<Object>} - Standardized response { content, toolCalls, usage, provider, model }
     */
    async complete(messages, options = {}) {
        throw new Error("Method 'complete' must be implemented.");
    }
}
