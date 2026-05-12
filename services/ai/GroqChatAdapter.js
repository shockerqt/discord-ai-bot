import Groq from 'groq-sdk';
import { ChatCompletionProvider } from './ChatCompletionProvider.js';

export class GroqChatAdapter extends ChatCompletionProvider {
    constructor(config) {
        super(config);
        this.client = new Groq({ apiKey: config.apiKey });
        this.decisionModel = 'llama-3.1-8b-instant';
    }

    /**
     * Transforms messages from internal format to Groq/OpenAI format.
     * - assistant messages: toolCalls -> tool_calls
     * - tool messages: toolCallId -> tool_call_id
     */
    _transformMessages(messages) {
        return this.stripMediaAttachments(messages).map(msg => {
            if (msg.role === 'assistant' && msg.toolCalls?.length > 0) {
                const { toolCalls, ...rest } = msg;
                return { ...rest, tool_calls: toolCalls };
            }
            if (msg.role === 'tool') {
                const { toolCallId, name, ...rest } = msg;
                return { ...rest, tool_call_id: toolCallId };
            }
            return msg;
        });
    }

    /**
     * @param {Array<Object>} messages
     * @param {Object} options
     */
    async complete(messages, options = {}) {
        const {
            model = 'llama-3.3-70b-versatile',
            temperature,
            maxTokens,
            tools,
            toolChoice,
            presencePenalty,
            frequencyPenalty
        } = options;

        const request = {
            model,
            messages: this._transformMessages(messages),
            temperature,
            max_tokens: maxTokens,
            tools,
            tool_choice: toolChoice,
            presence_penalty: presencePenalty,
            frequency_penalty: frequencyPenalty
        };

        // Filter undefined
        Object.keys(request).forEach(key => request[key] === undefined && delete request[key]);

        try {
            console.log(`[GroqAdapter] Sending request to model: ${request.model}`);
            const response = await this.client.chat.completions.create(request);
            console.log(`[GroqAdapter] Response received. ID: ${response.id}`);

            const choice = response.choices?.[0];
            const message = choice?.message;

            // Normalize tool_calls to internal toolCalls format
            const toolCalls = (message?.tool_calls || []).map(tc => ({
                id: tc.id,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments
                }
            }));

            return {
                content: message?.content || '',
                toolCalls,
                usage: response.usage,
                provider: 'Groq',
                model,
                rawResponse: choice
            };
        } catch (error) {
            console.error('[GroqAdapter] Error:', error);
            throw error;
        }
    }
}
