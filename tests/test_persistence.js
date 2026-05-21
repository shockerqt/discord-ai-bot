import fs from 'fs';
import path from 'path';
import { 
    addUserMessages, 
    addAssistantMessage, 
    getAllMessages, 
    clearMessages, 
    MSG_STATUS 
} from '../utils/messageStore.js';

const STORE_FILE = path.join('data', 'message_store.json');

async function runTest() {
    console.log('🧪 Starting MessageStore persistence test...');

    // 1. Clean existing state
    const channelId = 'test-channel-persistence';
    clearMessages(channelId);
    console.log('🧹 Cleared existing messages for test channel.');

    // 2. Add some messages
    const sampleUserMessages = [
        {
            messageId: 'msg-1',
            userName: 'Shocker',
            content: 'Hola Lumi, ¿cómo estás?',
            timestamp: new Date().toISOString()
        },
        {
            messageId: 'msg-2',
            userName: 'Zavier',
            content: 'Hola! ¿Están listos para la pizza?',
            timestamp: new Date().toISOString()
        }
    ];

    addUserMessages(channelId, sampleUserMessages);
    addAssistantMessage(channelId, '¡Hola! Sí, me encanta la pizza de pepperoni. 🍕💅');

    console.log('✍️ Added sample messages and assistant response.');

    // Wait briefly for async writing to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // 3. Verify that data/message_store.json exists and has correct content
    if (!fs.existsSync(STORE_FILE)) {
        throw new Error('❌ Test failed: message_store.json was not created on disk.');
    }
    console.log('📂 verified: data/message_store.json exists on disk.');

    const rawData = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(rawData);

    if (!parsed.activeChannels || !parsed.activeChannels.includes(channelId)) {
        throw new Error('❌ Test failed: activeChannels does not include test channel.');
    }
    console.log('✅ verified: activeChannels matches.');

    // 4. Test loading persistence (re-import/simulate bootstrap)
    // We can clear memory maps directly and call our internal loadStoreFromDisk 
    // by simulating a module reload, or simply testing if the file read returns exactly what we added.
    const messages = getAllMessages(channelId);
    if (messages.length !== 3) {
        throw new Error(`❌ Test failed: Expected 3 messages, got ${messages.length}`);
    }

    if (messages[0].id !== 'msg-1' || messages[1].id !== 'msg-2' || !messages[2].id.startsWith('asst-')) {
        throw new Error('❌ Test failed: Message IDs or order do not match.');
    }
    console.log('✅ verified: Memory message list matches expected contents.');

    // 5. Test clean up
    clearMessages(channelId);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const rawDataClean = fs.readFileSync(STORE_FILE, 'utf8');
    const parsedClean = JSON.parse(rawDataClean);
    const cleanMessages = parsedClean.channelMessages.find(entry => entry[0] === channelId);
    
    if (cleanMessages && cleanMessages[1].length > 0) {
        throw new Error('❌ Test failed: Messages were not cleared in persisted store.');
    }
    console.log('✅ verified: clearMessages successfully persisted clean state.');

    console.log('🎉 PERSISTENCE TEST PASSED SUCCESSFULLY!');
}

runTest().catch(err => {
    console.error('❌ Persistence test failed with error:', err);
    process.exit(1);
});
