import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
} from 'discord-interactions';
import { VerifyDiscordRequest, DiscordRequest } from './utils.js';
import * as chatCommand from './commands/chat.js';
import * as modelCommand from './commands/model.js';
import * as resetCommand from './commands/reset.js';
import * as memoryCommand from './commands/memory.js';
import * as configureCommand from './commands/configure.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Parse request body and verifies incoming requests using discord-interactions package
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

// Command Registry
const commands = {
  [chatCommand.data.name]: chatCommand,
  [modelCommand.data.name]: modelCommand,
  [resetCommand.data.name]: resetCommand,
  [configureCommand.data.name]: configureCommand,
  [memoryCommand.MEMORY_COMMAND.name]: { execute: memoryCommand.memoryCommand },
};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', async function (req, res) {
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

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
