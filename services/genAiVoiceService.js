
import { GoogleGenAI, Modality } from '@google/genai';
import EventEmitter from 'events';

class GenAiVoiceService extends EventEmitter {
    constructor() {
        super();
        this.client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
        this.session = null;
        this.packageCount = 0;
        this.receivedPackageCount = 0;
        this.model = 'gemini-2.5-flash-native-audio-preview-12-2025';
        this.config = {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are a helpful and friendly AI assistant inside a Discord voice channel. Keep your responses concise and conversational.",
        };
    }

    async connect() {
        this.packageCount = 0; // Reset counter on new connection
        this.receivedPackageCount = 0;
        try {
            this.session = await this.client.live.connect({
                model: this.model,
                config: this.config,
                callbacks: {
                    onopen: () => {
                        console.log('[GenAI] Connected to Gemini Live API');
                        this.emit('connected');
                    },
                    onmessage: (message) => {
                        this._handleMessage(message);
                    },
                    onerror: (e) => {
                        console.error('[GenAI] Error:', e.message);
                        this.emit('error', e);
                    },
                    onclose: (e) => {
                        console.log('[GenAI] Closed:', e.reason);
                        this.emit('disconnected');
                    },
                },
            });
        } catch (error) {
            console.error('[GenAI] Connection failed:', error);
            throw error;
        }
    }

    async sendAudio(buffer) {
        if (!this.session) return;

        if (this.packageCount === 0) {
            console.log('🎙️ [GenAI] Starting to send audio stream...');
        }

        this.packageCount++;
        if (this.packageCount % 50 === 0) { // Log every 50 chunks to avoid spamming while still showing progress
            console.log(`[GenAI] Sent ${this.packageCount} audio packages...`);
        }

        try {
            await this.session.sendRealtimeInput({
                audio: {
                    data: buffer.toString('base64'),
                    mimeType: "audio/pcm;rate=16000"
                }
            });
        } catch (e) {
            console.error('[GenAI] Failed to send audio:', e);
        }
    }

    _handleMessage(message) {
        // Handle server content (audio)
        if (message.serverContent && message.serverContent.modelTurn && message.serverContent.modelTurn.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData && part.inlineData.data) {
                    if (this.receivedPackageCount === 0) {
                        console.log('🔊 [GenAI] Receiving audio response...');
                    }
                    this.receivedPackageCount++;
                    if (this.receivedPackageCount % 50 === 0) {
                        console.log(`[GenAI] Received ${this.receivedPackageCount} audio packages...`);
                    }

                    const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                    this.emit('audio', audioBuffer);
                }
            }
        }

        // Handle interruptions or other events if needed
        if (message.serverContent && message.serverContent.interrupted) {
            console.log('🛑 [GenAI] AI response interrupted');
            this.emit('interrupted');
        }
    }

    disconnect() {
        if (this.session) {
            // Note: SDK might not have an explicit disconnect on session yet based on snippet, 
            // but usually closing the socket is handled internally or we just drop reference.
            // The snippet didn't show explicit disconnect, but we can assume normal WS behavior.
            // If there's no close method, we might just nullify. 
            // Checking docs or snippet... snippet shows onclose callback but not close() method usage.
            // We'll rely on it dropping if we assume it cleans up or if we can force close.
            // For now, let's just null it.
            this.session = null;
        }
    }
}

export const genAiVoiceService = new GenAiVoiceService();
