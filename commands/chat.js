import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId } from '../utils/agentManager.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

export const data = {
    name: 'chat',
    description: 'Chat with Mistral AI (shared context)',
    options: [
        {
            type: 3, // STRING
            name: 'message',
            description: 'The message to send',
            required: true,
        }
    ],
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

export async function execute(req, res) {
    const { data, token, application_id, channel_id, member, user } = req.body;
    // Use channel_id for context. If DM, channel_id works fine too.
    const contextId = channel_id;

    // User message
    const userMessage = data.options.find(opt => opt.name === 'message').value;
    const authorUsername = member ? member.user.username : user.username;

    // We defer first
    await res.send({
        type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    });

    try {
        let conversationId = getConversationId(contextId);
        console.log(`[DEBUG] Channel: ${contextId}, Found ConvID: ${conversationId}`);
        let responseMessage = "";

        if (!conversationId) {
            // Start new conversation
            const agentId = await getOmniAgentId();

            // According to conversations.md: client.beta.conversations.start({ inputs: <value> })
            // We'll try to pass the user message as inputs. 
            // If the API expects an array of messages, we'll try that first as it's cleaner.

            // Mistral Beta Conversations often treat 'inputs' as the message content or list of messages.
            // Converting to array of objects as seen in restartStream example might be safer OR just string "content".

            // Let's rely on common Mistral patterns: inputs = [{ role: 'user', content: ... }]
            const startParams = {
                agentId: agentId,
                inputs: [{ role: 'user', content: `${authorUsername}: ${userMessage}` }]
            };

            const convoResponse = await client.beta.conversations.start(startParams);

            // API returns conversationId (not id)
            conversationId = convoResponse.conversationId || convoResponse.id;
            setConversationId(contextId, conversationId);
            console.log(`[DEBUG] New Conversation Started: ${conversationId}`);

            if (convoResponse.outputs && convoResponse.outputs.length > 0) {
                // Check if it's a message output
                const lastOutput = convoResponse.outputs[convoResponse.outputs.length - 1];
                if (lastOutput.type === 'message.output' || lastOutput.role === 'assistant') {
                    // Check if content is string or array (for multimodal/tools)
                    if (Array.isArray(lastOutput.content)) {
                        responseMessage = lastOutput.content
                            .map(part => {
                                if (part.type === 'text') return part.text;
                                if (part.type === 'image_url') return part.image_url.url; // Standard
                                if (part.type === 'tool_file') {
                                    // We have a fileId. We likely need another API call to get the URL
                                    // For now, let's just indicate an image was generated.
                                    // If the SDK supports retrieving this, we should add that logic later.
                                    // Assuming for now we can't easily display it without a signed URL call.
                                    return `[🖼️ Image Generated: ${part.fileName}]`;
                                }
                                return '';
                            })
                            .join('');
                    } else {
                        responseMessage = lastOutput.content;
                    }
                }
            }

        } else {
            // Append to existing conversation
            // client.beta.conversations.append({ conversationId, conversationAppendRequest: { ... } })
            const convoResponse = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: `${authorUsername}: ${userMessage}` }]
                }
            });

            if (convoResponse.outputs && convoResponse.outputs.length > 0) {
                const lastOutput = convoResponse.outputs[convoResponse.outputs.length - 1];
                if (lastOutput.type === 'message.output' || lastOutput.role === 'assistant') {
                    if (Array.isArray(lastOutput.content)) {
                        responseMessage = lastOutput.content
                            .map(part => {
                                if (part.type === 'text') return part.text;
                                if (part.type === 'image_url') return part.image_url.url;
                                if (part.type === 'tool_file') {
                                    return `[🖼️ Image Generated: ${part.fileName} (ID: ${part.fileId})]`;
                                    // TODO: Implement file retrieval if API allows
                                }
                                return '';
                            })
                            .join('');
                    } else {
                        responseMessage = lastOutput.content;
                    }
                }
            }
        }

        // 3. Edit original message
        const endpoint = `webhooks/${application_id}/${token}/messages/@original`;

        let finalContent = responseMessage;

        // Basic check for image in response if text is empty? 
        // Or sometimes the text contains the markdown image like ![image](url).
        // If the tool executed, the message might be "Here is your image: ![generated image](http...)"

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: finalContent || "Thinking... (No text returned, maybe just an image?)",
            },
        });

    } catch (error) {
        console.error('Error in chat:', error);
        // Clean up conversation ID if invalid (e.g. 404 from API)
        if (error.message && error.message.includes("404")) {
            deleteConversationId(contextId);
        }

        const endpoint = `webhooks/${application_id}/${token}/messages/@original`;
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: `Sorry, I met an error. (Conversation might be reset). Error: ${error.message}`,
            },
        });
    }
}
