import { MistralChatAdapter } from './MistralChatAdapter.js';
import { GroqChatAdapter } from './GroqChatAdapter.js';
import { getConfig } from '../../utils/configStore.js';

export class ChatProviderFactory {
    /**
     * @param {string} providerType
     * @returns {import('./ChatCompletionProvider.js').ChatCompletionProvider}
     */
    static createProvider(providerType = null) {
        const type = providerType || getConfig().provider || process.env.CHAT_PROVIDER || 'mistral';
        switch (type.toLowerCase()) {
            case 'mistral':
                return new MistralChatAdapter({ apiKey: process.env.MISTRAL_API_KEY });
            case 'groq':
                return new GroqChatAdapter({ apiKey: process.env.GROQ_API_KEY });
            default:
                console.warn(`Unknown provider '${providerType}', falling back to Mistral.`);
                return new MistralChatAdapter({ apiKey: process.env.MISTRAL_API_KEY });
        }
    }
}
