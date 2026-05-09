import { GoogleGenAI } from '@google/genai';
import { ChatCompletionProvider } from './ChatCompletionProvider.js';

export class GeminiChatAdapter extends ChatCompletionProvider {
    constructor(config) {
        super(config);
        this.client = new GoogleGenAI({ apiKey: config.apiKey });
        this.decisionModel = 'gemini-3.1-flash-lite';
    }

    /**
     * Transforms internal messages [{role, content}] to Gemini's format.
     * Gemini uses 'user' and 'model' roles (not 'assistant').
     * System messages are extracted and passed via systemInstruction config.
     * Tool messages need special handling.
     */
    _transformMessages(messages) {
        const systemMessages = [];
        const contents = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemMessages.push(msg.content);
                continue;
            }

            if (msg.role === 'assistant') {
                const parts = [];
                if (msg.content) {
                    parts.push({ text: msg.content });
                }
                // Handle tool calls from assistant
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    for (const tc of msg.toolCalls) {
                        let args = {};
                        try {
                            args = typeof tc.function.arguments === 'string'
                                ? JSON.parse(tc.function.arguments)
                                : tc.function.arguments;
                        } catch (e) {
                            args = {};
                        }
                        parts.push({
                            functionCall: {
                                name: tc.function.name,
                                args: args
                            }
                        });
                    }
                }
                contents.push({ role: 'model', parts });
                continue;
            }

            if (msg.role === 'tool') {
                // Tool result — Gemini expects functionResponse parts
                let responseData;
                try {
                    responseData = typeof msg.content === 'string'
                        ? JSON.parse(msg.content)
                        : msg.content;
                } catch (e) {
                    responseData = { result: msg.content };
                }
                contents.push({
                    role: 'user',
                    parts: [{
                        functionResponse: {
                            name: msg.name,
                            response: responseData
                        }
                    }]
                });
                continue;
            }

            // Regular user message
            contents.push({
                role: 'user',
                parts: [{ text: msg.content }]
            });
        }

        return { systemInstruction: systemMessages.join('\n\n'), contents };
    }

    /**
     * Transforms internal tool definitions (OpenAI/Mistral format) to Gemini format.
     * Input format: [{ type: 'function', function: { name, description, parameters } }]
     * Output format: [{ functionDeclarations: [{ name, description, parameters }] }]
     */
    _transformTools(tools) {
        if (!tools || tools.length === 0) return undefined;

        const declarations = tools.map(tool => {
            const func = tool.function || tool;
            return {
                name: func.name,
                description: func.description,
                parameters: func.parameters
            };
        });

        return [{ functionDeclarations: declarations }];
    }

    /**
     * @param {Array<Object>} messages
     * @param {Object} options
     */
    async complete(messages, options = {}) {
        const {
            model = 'gemini-3.1-flash-lite',
            temperature,
            maxTokens,
            tools,
            toolChoice,
            presencePenalty,
            frequencyPenalty
        } = options;

        const { systemInstruction, contents } = this._transformMessages(messages);
        const geminiTools = this._transformTools(tools);

        const config = {};
        if (temperature !== undefined) config.temperature = temperature;
        if (maxTokens !== undefined) config.maxOutputTokens = maxTokens;
        // presencePenalty and frequencyPenalty are NOT supported by Gemini/Gemma models
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (geminiTools) config.tools = geminiTools;


        const MAX_RETRIES = 3;
        let lastError;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[GeminiAdapter] Sending request to model: ${model}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
                const response = await this.client.models.generateContent({
                    model,
                    contents,
                    config
                });
                console.log(`[GeminiAdapter] Response received.`);

                // Extract content from response
                const text = response.text || '';

                // Extract function calls if any
                const toolCalls = [];
                if (response.candidates?.[0]?.content?.parts) {
                    for (const part of response.candidates[0].content.parts) {
                        if (part.functionCall) {
                            toolCalls.push({
                                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                function: {
                                    name: part.functionCall.name,
                                    arguments: JSON.stringify(part.functionCall.args || {})
                                }
                            });
                        }
                    }
                }

                // Extract usage info
                const usageMetadata = response.usageMetadata || {};
                const usage = {
                    promptTokens: usageMetadata.promptTokenCount || 0,
                    completionTokens: usageMetadata.candidatesTokenCount || 0,
                    totalTokens: usageMetadata.totalTokenCount || 0
                };

                return {
                    content: text,
                    toolCalls,
                    usage,
                    provider: 'Gemini',
                    model,
                    rawResponse: response
                };
            } catch (error) {
                lastError = error;
                const status = error?.status || error?.httpStatus;
                // Retry on 500 (internal server error) with exponential backoff
                if ((status === 500 || error?.message?.includes('"code":500')) && attempt < MAX_RETRIES) {
                    const delay = attempt * 1500;
                    console.warn(`[GeminiAdapter] 500 error on attempt ${attempt}, retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                console.error('[GeminiAdapter] Error:', error);
                throw error;
            }
        }

        throw lastError;
    }
}
