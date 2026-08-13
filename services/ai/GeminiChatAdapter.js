import { GoogleGenAI } from '@google/genai';
import { ChatCompletionProvider } from './ChatCompletionProvider.js';

export class GeminiChatAdapter extends ChatCompletionProvider {
    constructor(config) {
        super(config);
        this.client = new GoogleGenAI({ apiKey: config.apiKey });
    }

    /**
     * Transforms internal messages [{role, content}] to Gemini's format.
     * Gemini uses 'user' and 'model' roles (not 'assistant').
     * System messages are extracted and passed via systemInstruction config.
     * Tool messages need special handling.
     * Now async to support downloading audio attachments.
     */
    async _transformMessages(messages) {
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
                        const partData = {
                            functionCall: {
                                name: tc.function.name,
                                args: args
                            }
                        };
                        if (tc.thoughtSignature) {
                            partData.thoughtSignature = tc.thoughtSignature;
                        }
                        parts.push(partData);
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
                const funcRes = {
                    name: msg.name,
                    response: responseData
                };
                const toolCallId = msg.toolCallId || msg.tool_call_id;
                if (toolCallId) {
                    funcRes.id = toolCallId;
                }
                contents.push({
                    role: 'user',
                    parts: [{
                        functionResponse: funcRes
                    }]
                });
                continue;
            }

            // Regular user message — may include multimedia
            const parts = [];

            // Text content first
            if (msg.content) {
                parts.push({ text: msg.content });
            }

            // Inject media parts if present
            if (msg.mediaAttachments?.length > 0) {
                for (const media of msg.mediaAttachments) {
                    if (media.type === 'youtube') {
                        // YouTube: Now handled via background processing + text summary injection.
                        // We skip multimodal injection here to avoid redundancy and heavy processing in the main loop.
                        console.log(`[GeminiAdapter] Skipping multimodal YouTube injection for: ${media.url} (using text summary)`);
                    } else if (media.type === 'audio') {
                        try {
                            const audioPart = await this._resolveAudioPart(media);
                            if (audioPart) {
                                parts.push(audioPart);
                                console.log(`[GeminiAdapter] Injecting audio part: ${media.filename} (${media.mimeType})`);
                            }
                        } catch (err) {
                            console.error(`[GeminiAdapter] Failed to resolve audio ${media.filename}:`, err.message);
                            // Graceful degradation: add a text note so Lumi knows
                            parts.push({ text: `[Audio adjunto: ${media.filename} — no se pudo procesar]` });
                        }
                    }
                }
            }

            contents.push({
                role: 'user',
                parts: parts.length > 0 ? parts : [{ text: '' }]
            });
        }

        return { systemInstruction: systemMessages.join('\n\n'), contents };
    }

    /**
     * Resolves an audio media attachment to a Gemini API part.
     * Uses inlineData for files <=10MB, File API upload for larger ones.
     * @param {{ url: string, mimeType: string, filename: string, size: number }} media
     * @returns {Promise<Object>} Gemini part object
     */
    async _resolveAudioPart(media) {
        const INLINE_THRESHOLD = 10 * 1024 * 1024; // 10 MB

        // Fetch audio data from Discord CDN
        const response = await fetch(media.url);
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching audio`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (media.size <= INLINE_THRESHOLD) {
            // Inline: base64 encode
            return {
                inlineData: {
                    mimeType: media.mimeType,
                    data: buffer.toString('base64'),
                }
            };
        } else {
            // File API upload for larger files
            const { createReadStream } = await import('node:stream');
            const { Readable } = await import('node:stream');
            console.log(`[GeminiAdapter] Uploading audio ${media.filename} via File API...`);
            const blob = new Blob([buffer], { type: media.mimeType });
            const uploadedFile = await this.client.files.upload({
                file: blob,
                config: { mimeType: media.mimeType, displayName: media.filename },
            });
            return {
                fileData: {
                    fileUri: uploadedFile.uri,
                    mimeType: uploadedFile.mimeType,
                }
            };
        }
    }

    /**
     * Transforms internal tool definitions (OpenAI/Mistral format) to Gemini format.
     * Input format: [{ type: 'function', function: { name, description, parameters } }]
     * Output format: [{ functionDeclarations: [{ name, description, parameters }] }]
     */
    _transformTools(tools) {
        if (!tools || tools.length === 0) return undefined;

        const uppercaseType = (schema) => {
            if (!schema) return schema;
            const newSchema = { ...schema };
            if (typeof newSchema.type === 'string') {
                newSchema.type = newSchema.type.toUpperCase();
            }
            if (newSchema.properties) {
                newSchema.properties = { ...newSchema.properties };
                for (const key in newSchema.properties) {
                    newSchema.properties[key] = uppercaseType(newSchema.properties[key]);
                }
            }
            if (newSchema.items) {
                newSchema.items = uppercaseType(newSchema.items);
            }
            return newSchema;
        };

        const declarations = tools.map(tool => {
            const func = tool.function || tool;
            return {
                name: func.name,
                description: func.description,
                parameters: uppercaseType(func.parameters)
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
            model = 'gemini-3.7-flash',
            temperature,
            maxTokens,
            tools,
            toolChoice,
            presencePenalty,
            frequencyPenalty
        } = options;

        const { systemInstruction, contents } = await this._transformMessages(messages);
        const geminiTools = this._transformTools(tools);

        const config = {};
        // Gemini 3.7 uses model-managed sampling. Omit legacy controls for the
        // current production family while preserving them for older fallbacks.
        const usesModelManagedSampling = /^gemini-3\.7(?:-|$)/.test(model);
        if (temperature !== undefined && !usesModelManagedSampling) {
            config.temperature = temperature;
        }
        if (maxTokens !== undefined) config.maxOutputTokens = maxTokens;
        // presencePenalty and frequencyPenalty are NOT supported by Gemini/Gemma models
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (geminiTools) {
            config.tools = geminiTools;
            if (toolChoice === 'auto') {
                config.toolConfig = { functionCallingConfig: { mode: 'auto' } };
            } else if (toolChoice === 'any' || toolChoice === 'required') {
                config.toolConfig = { functionCallingConfig: { mode: 'any' } };
            }
        }


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
                                },
                                thoughtSignature: part.thoughtSignature || part.thought_signature
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
                // Retry on 500 (internal server error) or 503 (service unavailable/high demand) with exponential backoff
                if ((status === 500 || status === 503 || error?.message?.includes('"code":500') || error?.message?.includes('"code":503')) && attempt < MAX_RETRIES) {
                    const delay = attempt * 2000; // Increased delay for 503s
                    console.warn(`[GeminiAdapter] ${status || 500} error on attempt ${attempt}, retrying in ${delay}ms...`);
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
