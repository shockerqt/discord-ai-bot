import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  verifyKeyMiddleware,
} from 'discord-interactions';

import * as testCommand from './commands/test.js';
import * as challengeCommand from './commands/challenge.js';
import * as buttonCommand from './commands/button.js';
import * as modalCommand from './commands/modal.js';
import * as selectCommand from './commands/select.js';
import * as chatCommand from './commands/chat.js';

import * as modelCommand from './commands/model.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Command Registry
const commands = {
  [testCommand.data.name]: testCommand,
  [challengeCommand.data.name]: challengeCommand,
  [buttonCommand.data.name]: buttonCommand,
  [modalCommand.data.name]: modalCommand,
  [selectCommand.data.name]: selectCommand,
  [chatCommand.data.name]: chatCommand,
  [modelCommand.data.name]: modelCommand,
};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    if (commands[name]) {
      try {
        await commands[name].execute(req, res);
      } catch (err) {
        console.error(`Error executing command ${name}:`, err);
        res.status(500).send('Internal Server Error');
      }
    } else {
      console.error(`unknown command: ${name}`);
      res.status(400).json({ error: 'unknown command' });
    }
    return;
  }

  /**
   * Handle requests from interactive components
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const componentId = data.custom_id;

    // Dispatch to appropriate command based on ID prefix or known IDs
    // For this simple example, we can check known prefixes/IDs

    if (componentId.startsWith('accept_button_') || componentId.startsWith('select_choice_')) {
      return await challengeCommand.componentHandler(req, res);
    }

    if (componentId === 'my_button') {
      return await buttonCommand.componentHandler(req, res);
    }

    if (componentId === 'my_select') {
      return await selectCommand.componentHandler(req, res);
    }

    console.error('unknown component interaction', componentId);
    return res.status(400).json({ error: 'unknown component interaction' });
  }

  /**
   * Handle modal submissions
   */
  if (type === InteractionType.MODAL_SUBMIT) {
    const modalId = data.custom_id;

    if (modalId === 'my_modal') {
      return await modalCommand.modalHandler(req, res);
    }

    console.error('unknown modal interaction', modalId);
    return res.status(400).json({ error: 'unknown modal interaction' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
