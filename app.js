import 'dotenv/config';
import express from 'express';

import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { client } from './discordClient.js';
import * as configureCommand from './commands/configure.js';
import * as pingCommand from './commands/ping.js';
import * as joinCommand from './commands/join.js';
import * as leaveCommand from './commands/leave.js';
import * as debugCommand from './commands/debug.js';
import * as historyCommand from './commands/history.js';
import {
  getConfig, getPersonality, setPersonality,
  setModel, setProvider, setPersona, setContextLimit,
  setTemperature, setPresencePenalty, setFrequencyPenalty
} from './utils/configStore.js';

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

// ============================================================================
// DASHBOARD API (Protected)
// ============================================================================

app.get('/api/config', basicAuth, (req, res) => {
  res.json(getConfig());
});

// Setters admitidos por PATCH /api/config
const CONFIG_SETTERS = {
  provider: setProvider,
  model: setModel,
  persona: setPersona,
  context_limit: setContextLimit,
  temperature: setTemperature,
  presence_penalty: setPresencePenalty,
  frequency_penalty: setFrequencyPenalty,
};

app.patch('/api/config', basicAuth, express.json(), (req, res) => {
  try {
    const applied = [];
    for (const [key, setter] of Object.entries(CONFIG_SETTERS)) {
      if (req.body[key] !== undefined) {
        setter(req.body[key]);
        applied.push(key);
      }
    }
    if (applied.length === 0) {
      return res.status(400).json({ error: 'No recognized config fields provided' });
    }
    res.json(getConfig());
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config: ' + err.message });
  }
});

// Instrucciones extra de personalidad (se añaden al system prompt)
app.get('/api/personality', basicAuth, (req, res) => {
  res.json({ personality: getPersonality() || '' });
});

app.put('/api/personality', basicAuth, express.json(), (req, res) => {
  try {
    const { personality } = req.body;
    if (typeof personality !== 'string') {
      return res.status(400).json({ error: 'Invalid personality content' });
    }
    setPersonality(personality);
    res.json({ success: true, personality: getPersonality() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update personality: ' + err.message });
  }
});

// Command Registry
const commands = {
  [configureCommand.data.name]: configureCommand,
  [pingCommand.data.name]: pingCommand,
  [joinCommand.data.name]: joinCommand,
  [leaveCommand.data.name]: leaveCommand,
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
