import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import * as testCommand from './commands/test.js';
import * as challengeCommand from './commands/challenge.js';
import * as buttonCommand from './commands/button.js';
import * as modalCommand from './commands/modal.js';
import * as selectCommand from './commands/select.js';
import * as chatCommand from './commands/chat.js';

import * as modelCommand from './commands/model.js';
import * as resetCommand from './commands/reset.js';
import * as memoryCommand from './commands/memory.js';

// Aggregate all commands
const ALL_COMMANDS = [
  testCommand.data,
  challengeCommand.data,
  buttonCommand.data,
  modalCommand.data,
  selectCommand.data,
  chatCommand.data,
  modelCommand.data,
  resetCommand.data,
  memoryCommand.MEMORY_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
