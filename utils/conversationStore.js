
// In-memory store for channel -> conversation ID mapping.
// Key: Discord Channel ID
// Value: Mistral Conversation ID

const activeConversations = {};

export function getConversationId(channelId) {
    return activeConversations[channelId];
}

export function setConversationId(channelId, conversationId) {
    activeConversations[channelId] = conversationId;
}


export function deleteConversationId(channelId) {
    delete activeConversations[channelId];
}

export function getActiveConversations() {
    return activeConversations;
}

export function clearAllConversations() {
    for (const key in activeConversations) {
        delete activeConversations[key];
    }
}
