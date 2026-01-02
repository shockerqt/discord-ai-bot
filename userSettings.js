
// Simple in-memory storage for user settings
// In a real application, you would use a database.

const userSettings = {};

export function getUserModel(userId) {
    return userSettings[userId]?.model || 'mistral-large-2512';
}

export function setUserModel(userId, model) {
    if (!userSettings[userId]) {
        userSettings[userId] = {};
    }
    userSettings[userId].model = model;
}
