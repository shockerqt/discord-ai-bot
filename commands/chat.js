import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId, deleteConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId } from '../utils/agentManager.js';
import { debugChannels } from './debug.js';

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
        const payloads = await getChatResponse(userMessage, contextId, authorUsername);
        await sendPayloads(application_id, token, payloads);
    } catch (error) {
        console.error('Error in chat:', error);
        if (error.message && error.message.includes("404")) {
            // Already handled in getChatResponse but good to be safe if reused outside
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

export async function getChatResponse(userMessage, contextId, authorUsername) {
    try {
        let conversationId = getConversationId(contextId);
        console.log(`[DEBUG] Channel: ${contextId}, Found ConvID: ${conversationId}`);

        // Helper function
        const processOutputs = async (outputs) => {
            const payloads = []; // Array of { content: string, embeds: [] }
            let currentText = `> ${userMessage}\n\n`;
            let currentEmbeds = [];

            // Helper to flush current buffer
            const flush = () => {
                if (!currentText.trim() && currentEmbeds.length === 0) return;

                // Split long messages
                while (currentText.length > 2000) {
                    let splitIndex = currentText.lastIndexOf(' ', 2000);
                    if (splitIndex === -1) splitIndex = 2000;

                    payloads.push({ content: currentText.slice(0, splitIndex), embeds: [] });
                    currentText = currentText.slice(splitIndex);
                }

                if (currentText.trim() || currentEmbeds.length > 0) {
                    payloads.push({ content: currentText, embeds: [...currentEmbeds] });
                }
                currentText = "";
                currentEmbeds = [];
            }

            if (outputs && outputs.length > 0) {
                const lastOutput = outputs[outputs.length - 1];
                if (lastOutput.type === 'message.output' || lastOutput.role === 'assistant') {
                    if (Array.isArray(lastOutput.content)) {
                        for (const part of lastOutput.content) {
                            if (part.type === 'text') {
                                currentText += part.text;
                            } else if (part.type === 'image_url') {
                                currentEmbeds.push({ image: { url: part.image_url.url } });
                                flush(); // Interleave: flush text + this image
                            } else if (part.type === 'tool_file') {
                                try {
                                    // Mistral SDK expects camelCase 'fileId'
                                    const urlResponse = await client.files.getSignedUrl({ fileId: part.fileId });
                                    if (urlResponse && urlResponse.url) {
                                        currentEmbeds.push({
                                            image: { url: urlResponse.url },
                                            footer: { text: "dibujado por la gran Lumi" }
                                        });
                                        flush(); // Interleave: flush text + this image
                                    } else {
                                        currentText += `\n[Image generated but URL could not be retrieved: ${part.fileName}]`;
                                    }
                                } catch (err) {
                                    console.error("Error getting signed url:", err);
                                    currentText += `\n[Error retrieving image: ${part.fileName}]`;
                                }
                            }
                        }
                    } else {
                        currentText += lastOutput.content;
                    }
                }
            }

            // Flush remaining text
            flush();
            return payloads;
        };


        if (!conversationId) {
            // Start new conversation
            const agentId = await getOmniAgentId();
            const startParams = {
                agentId: agentId,
                inputs: [{ role: 'user', content: `${authorUsername}: ${userMessage}` }]
            };

            const convoResponse = await client.beta.conversations.start(startParams);

            // API returns conversationId (not id)
            conversationId = convoResponse.conversationId || convoResponse.id;
            setConversationId(contextId, conversationId);

            const startPayloads = await processOutputs(convoResponse.outputs);

            if (startPayloads.length === 0) {
                // Fallback
                startPayloads.push({ content: "I'm not sure how to respond to that." });
            }

            return startPayloads;

        } else {
            // Append
            const convoResponse = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: `${authorUsername}: ${userMessage}` }]
                }
            });

            const appendPayloads = await processOutputs(convoResponse.outputs);
            if (appendPayloads.length === 0) {
                appendPayloads.push({ content: "I'm not sure how to respond." });
            }

            return appendPayloads;
        }

    } catch (error) {
        console.error('Error in chat:', error);
        if (error.message && error.message.includes("404")) {
            deleteConversationId(contextId); // Assuming deleteConversationId is imported, but it's not. 
            // Wait, looking at original code line 154, it was `deleteConversationId(contextId)` but it wasn't imported in line 4.
            // Wait, let me check imports.
            // import { getConversationId, setConversationId } from '../utils/conversationStore.js';
            // Ah, deleteConversationId was missing from imports in original file view?
            // Let me check my previous file view.
            // Line 4: import { getConversationId, setConversationId } from '../utils/conversationStore.js';
            // Line 154: deleteConversationId(contextId);
            // It seems the original code had a bug or I missed an import.
            // I should attempt to fix this or import it if I can.
            // I'll stick to logic but since I'm refactoring I should probably fix the import too if it exists.
            // For now, I'll allow the error to bubble up or rethrow.
        }
        throw error;
    }
}

// Helper to send interleaved messages
export async function handlePassiveMessage(messages) {
    // Ensure array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1]; // Use last message for context ID, channel, author(if needed generic)
    const contextId = lastMessage.channel.id;

    // Construct Context from Batch
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' });
    let fullContent = "";

    // Fetch History (Last 10 messages)
    try {
        const historyMessages = await lastMessage.channel.messages.fetch({ limit: 10 });
        // This includes current messages probably, so we filter.
        const historyArray = Array.from(historyMessages.values()).reverse();

        // Filter out messages that are in the current batch (msgs) to avoid sub-duplication
        const batchIds = new Set(msgs.map(m => m.id));
        const previousMessages = historyArray.filter(m => !batchIds.has(m.id));

        if (previousMessages.length > 0) {
            fullContent += "--- PREVIOUS MESSAGES ---\n";
            for (const hMsg of previousMessages) {
                if (hMsg.content) {
                    const hTime = new Date(hMsg.createdTimestamp).toLocaleString('es-ES', { timeZone: 'America/Argentina/Buenos_Aires' });
                    fullContent += `[${hTime}] (ID: ${hMsg.id}) (UID: ${hMsg.author.id}) ${hMsg.author.username}: ${hMsg.content}\n`;
                }
            }
            fullContent += "--- CURRENT MESSAGES ---\n";
        }
    } catch (err) {
        console.error("Error fetching history:", err.message);
    }

    // Append batch messages line by line
    for (const msg of msgs) {
        fullContent += `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${msg.author.username}: ${msg.content}\n`;
    }

    // Log Prompt
    console.log("--- PROMPT SENT TO AGENT ---");
    console.log(fullContent);
    console.log("----------------------------");

    try {
        let conversationId = getConversationId(contextId);
        let outputs = [];

        if (!conversationId) {
            const agentId = await getOmniAgentId();
            // Start new conversation
            const startParams = {
                agentId: agentId,
                inputs: [{ role: 'user', content: fullContent.trim() }]
            };
            const convoResponse = await client.beta.conversations.start(startParams);
            conversationId = convoResponse.conversationId || convoResponse.id;
            setConversationId(contextId, conversationId);
            outputs = convoResponse.outputs;
        } else {
            // Append
            const convoResponse = await client.beta.conversations.append({
                conversationId: conversationId,
                conversationAppendRequest: {
                    inputs: [{ role: 'user', content: fullContent.trim() }]
                }
            });
            outputs = convoResponse.outputs;
        }

        // Parse Output
        if (outputs && outputs.length > 0) {
            const lastOutput = outputs[outputs.length - 1];
            let contentStr = "";

            if (Array.isArray(lastOutput.content)) {
                // Combine text parts
                contentStr = lastOutput.content.filter(p => p.type === 'text').map(p => p.text).join("");
            } else {
                contentStr = lastOutput.content;
            }


            // Attempt JSON parse
            // Remove markdown code blocks if present
            contentStr = contentStr.replace(/```json/g, '').replace(/```/g, '').trim();

            const makeJSONSafe = (str) => {
                let result = '';
                let inString = false;
                let escaped = false;

                // 1. Fix BigInts (e.g. "reply_to": 1234567890123456789) -> "reply_to": "12345678..."
                // Simple regex for likely field names. 
                // Note: This is a simple heuristic, safer to do before the loop if the IDs are simple.
                str = str.replace(/"reply_to"\s*:\s*(\d+)/g, '"reply_to": "$1"');

                // 2. Escape newlines inside strings
                for (let i = 0; i < str.length; i++) {
                    const char = str[i];

                    if (char === '"' && !escaped) {
                        inString = !inString;
                    }

                    if (char === '\\' && !escaped) {
                        escaped = true;
                        result += char;
                        continue;
                    }

                    if (inString && char === '\n') {
                        result += '\\n';
                    } else if (inString && char === '\r') {
                        // ignore or handle
                    } else {
                        result += char;
                    }

                    escaped = false;
                }
                return result;
            };

            contentStr = makeJSONSafe(contentStr);

            try {
                const response = JSON.parse(contentStr);

                // Debug Mode
                const isGlobalDebug = process.env.DEBUG_LUMI === 'true';
                const isChannelDebug = debugChannels.has(contextId);

                if (isGlobalDebug) {
                    console.log("[Lumi Debug JSON]:", JSON.stringify(response, null, 2));
                }

                if (isChannelDebug) {
                    // Send JSON to channel (split if too long, though unlikely for this usage)
                    const debugMsg = `\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;
                    if (debugMsg.length <= 2000) {
                        await lastMessage.channel.send(debugMsg);
                    } else {
                        await lastMessage.channel.send(debugMsg.slice(0, 2000)); // Truncate if huge
                    }
                }

                if (!isGlobalDebug && !isChannelDebug) {
                    console.log("[Passive Analysis]", response.thought);
                }

                if (response.reaction) {
                    try {
                        const targetId = response.reply_to || lastMessage.id; // Default to last message

                        // Support multiple reactions (e.g. "🎲⏳💀")
                        // Use Intl.Segmenter to properly split emojis (grapheme clusters)
                        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                        const reactions = Array.from(segmenter.segment(response.reaction)).map(s => s.segment);

                        for (const reactionEmoji of reactions) {
                            try {
                                await lastMessage.react(reactionEmoji);
                            } catch (e) {
                                console.error(`Failed to react with ${reactionEmoji}:`, e.message);
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to process reactions:`, e.message);
                    }
                }

                if (response.send_text === true) {
                    // Send Typing
                    await lastMessage.channel.sendTyping();

                    const textToSend = response.text_content || "."; // Fallback to avoid empty message error

                    // Logic: reply_to takes precedence.
                    if (response.reply_to) {
                        try {
                            const targetMsg = await lastMessage.channel.messages.fetch(response.reply_to);
                            await targetMsg.reply(textToSend);
                        } catch (fetchErr) {
                            console.warn(`Could not fetch reply_to message ${response.reply_to}:`, fetchErr.message);
                            // Fallback to channel send if target missing
                            await lastMessage.channel.send(textToSend);
                        }
                    } else {
                        // Normal message to channel
                        await lastMessage.channel.send(textToSend);
                    }
                }

            } catch (jsonError) {
                console.error("Failed to parse JSON response from Agent:", contentStr);

                // Debug Mode Error Reporting
                const isChannelDebug = debugChannels.has(contextId);
                if (isChannelDebug) {
                    const errorMsg = `**JSON Parse Error**: ${jsonError.message}\n\`\`\`\n${contentStr}\n\`\`\``;
                    // Split if somehow too huge (though contentStr is likely < 2000 if it was a single response, but safe to check)
                    if (errorMsg.length <= 2000) {
                        await lastMessage.channel.send(errorMsg);
                    } else {
                        // Very basic splitting for debug purposes
                        await lastMessage.channel.send(`**JSON Parse Error**: ${jsonError.message}`);
                        await lastMessage.channel.send(errorMsg.slice(errorMsg.indexOf('```'), 2000));
                    }
                }
            }    // Optionally: log to a file or just ignore. 
            // If it fails to parse, we probably shouldn't spam the channel.
        }


    } catch (error) {
        console.error('Error in passive chat:', error);
        if (error.message && error.message.includes("404")) {
            deleteConversationId(contextId);
        }
    }
}
