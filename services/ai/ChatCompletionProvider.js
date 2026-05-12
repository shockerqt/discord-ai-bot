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
     * Strips mediaAttachments from messages, replacing them with text annotations.
     * Used by providers that don't support multimodal input (Mistral, Groq).
     * @param {Array<Object>} messages
     * @returns {Array<Object>}
     */
    stripMediaAttachments(messages) {
        return messages.map(msg => {
            if (msg.role !== 'user' || !msg.mediaAttachments?.length) return msg;
            const notes = msg.mediaAttachments.map(m => {
                if (m.type === 'youtube') return `[El usuario compartió un video de YouTube: ${m.url} — no tengo ojos para verlo con este proveedor de IA]`;
                if (m.type === 'audio') return `[El usuario adjuntó un audio: ${m.filename} — no tengo orejas para escucharlo con este proveedor de IA]`;
                return null;
            }).filter(Boolean);
            const extra = notes.length > 0 ? '\n' + notes.join('\n') : '';
            const { mediaAttachments, ...rest } = msg;
            return { ...rest, content: (msg.content || '') + extra };
        });
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
