import { Mistral } from '@mistralai/mistralai';
import { ChatCompletionProvider } from './ChatCompletionProvider.js';

export class MistralChatAdapter extends ChatCompletionProvider {
    constructor(config) {
        super(config);
        this.client = new Mistral({ apiKey: config.apiKey });
    }

    /**
     * @param {Array<Object>} messages 
     * @param {Object} options 
     */
    async complete(messages, options = {}) {
        const {
            model = 'mistral-medium',
            temperature,
            maxTokens,
            tools,
            toolChoice,
            responseFormat,
            presencePenalty,
            frequencyPenalty
        } = options;

        const request = {
            model: model,
            messages: messages,
            temperature: temperature,
            maxTokens: maxTokens,
            tools: tools,
            toolChoice: toolChoice,
            responseFormat: responseFormat,
            presence_penalty: presencePenalty,
            frequency_penalty: frequencyPenalty
        };

        // Filter undefined
        Object.keys(request).forEach(key => request[key] === undefined && delete request[key]);

        try {
            console.log(`[MistralAdapter] Sending request to model: ${request.model}`);
            const response = await this.client.chat.complete(request);
            console.log(`[MistralAdapter] Response received. ID: ${response.id}`);

            const choice = response.choices?.[0];
            const message = choice?.message;

            return {
                content: message?.content || '',
                toolCalls: message?.toolCalls || [],
                usage: response.usage,
                provider: 'Mistral',
                model: model,
                rawResponse: choice // Keep raw for debugging if needed
            };
        } catch (error) {
            console.error("Mistral Adapter Error:", error);
            throw error;
        }
    }
}
