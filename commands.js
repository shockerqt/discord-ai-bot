import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';
import * as modelCommand from './commands/model.js';
import * as resetCommand from './commands/reset.js';
import * as memoryCommand from './commands/memory.js';
import * as configureCommand from './commands/configure.js';
import * as pingCommand from './commands/ping.js';
import * as joinCommand from './commands/join.js';
import * as leaveCommand from './commands/leave.js';
import * as debugCommand from './commands/debug.js';
import * as historyCommand from './commands/history.js';
import * as clearPersonalityCommand from './commands/clearPersonality.js';

// Aggregate all commands
const ALL_COMMANDS = [
  modelCommand.data,
  resetCommand.data,
  configureCommand.data,
  memoryCommand.MEMORY_COMMAND,
  pingCommand.data,
  joinCommand.data,
  leaveCommand.data,
  debugCommand.data,
  historyCommand.data,
  clearPersonalityCommand.data,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
