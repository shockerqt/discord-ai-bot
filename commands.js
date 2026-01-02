import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import * as chatCommand from './commands/chat.js';
import * as modelCommand from './commands/model.js';
import * as resetCommand from './commands/reset.js';
import * as memoryCommand from './commands/memory.js';

// Aggregate all commands
const ALL_COMMANDS = [
  chatCommand.data,
  modelCommand.data,
  resetCommand.data,
  memoryCommand.MEMORY_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
