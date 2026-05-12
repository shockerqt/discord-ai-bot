import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
// import { Client, GatewayIntentBits } from 'discord.js'; // Removed
import { DiscordRequest } from './utils.js';
import { client } from './discordClient.js'; // Imported
import * as resetCommand from './commands/reset.js';
import * as memoryCommand from './commands/memory.js';
import * as configureCommand from './commands/configure.js';
import * as pingCommand from './commands/ping.js';
import * as joinCommand from './commands/join.js';
import * as debugCommand from './commands/debug.js';
import * as historyCommand from './commands/history.js';
import { getActiveChannels, getAllMessages } from './utils/messageStore.js';
import { getConfig, setDecisionModel } from './utils/configStore.js';
import { reloadDecisionInstructions } from './utils/agentManager.js';
import { getLogFilePath } from './utils/feedbackStore.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

/**
 * Simple Basic Auth Middleware
 */
function basicAuth(req, res, next) {
  const password = process.env.DASHBOARD_PASSWORD;
  
  // If no password is set in .env, allow access (for backwards compatibility/easy setup)
  if (!password) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Lumi Dashboard"');
    return res.status(401).send('Authentication required');
  }

  try {
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === 'admin' && pass === password) {
      return next();
    }
  } catch (e) {
    // Invalid auth format
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Lumi Dashboard"');
  return res.status(401).send('Invalid credentials');
}

// Dashboard API Routes (Protected)
app.get('/api/channels', basicAuth, async (req, res) => {
  const channels = getActiveChannels();
  const data = [];
  for (const id of channels) {
    try {
      const channel = await client.channels.fetch(id);
      data.push({ id, name: channel.name, guild: channel.guild?.name || 'Direct Message' });
    } catch (e) {
      data.push({ id, name: 'Unknown Channel', guild: 'Unknown Guild' });
    }
  }
  res.json(data);
});

app.get('/api/channels/:id/messages', basicAuth, (req, res) => {
  res.json(getAllMessages(req.params.id) || []);
});

// Config API (Protected)
app.get('/api/config', basicAuth, (req, res) => {
  res.json(getConfig());
});

app.patch('/api/config', basicAuth, express.json(), (req, res) => {
  const { decision_model } = req.body;
  if (decision_model !== undefined) setDecisionModel(decision_model);
  res.json(getConfig());
});

// Prompt API (Protected)
app.get('/api/prompts/decision', basicAuth, (req, res) => {
  try {
    const promptPath = path.join(__dirname, 'prompts', 'decision_agent.md');
    const content = fs.readFileSync(promptPath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read prompt file' });
  }
});

app.put('/api/prompts/decision', basicAuth, express.json(), (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') return res.status(400).json({ error: 'Invalid content' });
    
    const promptPath = path.join(__dirname, 'prompts', 'decision_agent.md');
    fs.writeFileSync(promptPath, content, 'utf8');
    reloadDecisionInstructions();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save prompt file' });
  }
});

// Feedback / Decisions Export (Protected)
app.get('/api/decisions/export', basicAuth, (req, res) => {
  try {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({ error: 'No feedback data available yet.' });
    }
    res.download(logPath, 'decisions_log.jsonl');
  } catch (err) {
    res.status(500).json({ error: 'Failed to export decisions' });
  }
});

// Command Registry
const commands = {
  [resetCommand.data.name]: resetCommand,
  [configureCommand.data.name]: configureCommand,
  [memoryCommand.MEMORY_COMMAND.name]: { execute: memoryCommand.memoryCommand },
  [pingCommand.data.name]: pingCommand,
  [joinCommand.data.name]: joinCommand,
  [debugCommand.data.name]: debugCommand,
  [historyCommand.data.name]: historyCommand,
};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * IMPORTANT: Must be defined BEFORE the basicAuth middleware to avoid 401 on Discord verification
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    const command = commands[name];

    if (command) {
      // Handle command execution
      if (command.execute) {
        try {
          return await command.execute(req, res);
        } catch (err) {
          console.error(`Error executing command ${name}:`, err);
          return res.status(500).send('Internal Server Error');
        }
      }
    }

    console.warn(`Command not found: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.warn(`Unknown interaction type: ${type}`);
  return res.status(400).json({ error: 'unknown interaction type' });
});

export { client };

// Serve static files for dashboard (Protected) - after /interactions so basicAuth doesn't block it
app.use('/', basicAuth, express.static('public'));

app.listen(PORT, async () => {
  console.log('Listening on port', PORT);

  try {
    console.log('Logging in to Discord Gateway...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log('Discord Client logged in as', client.user.tag);
  } catch (err) {
    console.error('Failed to login to Discord:', err);
  }
});
