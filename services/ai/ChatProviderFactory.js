import { MistralChatAdapter } from './MistralChatAdapter.js';

export class ChatProviderFactory {
    /**
     * @param {string} providerType 
     * @returns {import('./ChatCompletionProvider.js').ChatCompletionProvider}
     */
    static createProvider(providerType = process.env.CHAT_PROVIDER || 'mistral') {
        switch (providerType.toLowerCase()) {
            case 'mistral':
                return new MistralChatAdapter({ apiKey: process.env.MISTRAL_API_KEY });
            // Future providers here
            default:
                console.warn(`Unknown provider '${providerType}', falling back to Mistral.`);
                return new MistralChatAdapter({ apiKey: process.env.MISTRAL_API_KEY });
        }
    }
}
