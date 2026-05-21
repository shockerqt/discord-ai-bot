# CLAUDE.md — Discord AI Bot (Lumi)

## Project Overview

This is a Discord AI bot named **Lumi** — a character-driven bot powered by Mistral AI models. It uses a two-stage AI pipeline: a decision agent gates whether to respond, followed by a response agent (Lumi) that generates replies. The bot supports slash commands, passive message monitoring, tool calling, voice channels, and persistent configuration.

---

## Directory Structure

```
discord-ai-bot/
├── app.js                        # Express HTTP server + slash command routing
├── discordClient.js              # Discord.js Gateway client + message listener
├── commands.js                   # Bulk slash command registration script
├── utils.js                      # Discord API helpers, verification middleware
├── LUMI_INSTRUCTIONS.md          # Lumi character personality definition
│
├── commands/                     # Slash command implementations
│   ├── ping.js                   # /ping — health check
│   ├── reset.js                  # /reset — clear channel history
│   ├── memory.js                 # /memory — view/clear all message history
│   ├── configure.js              # /configure — model, temperature, personality
│   ├── debug.js                  # /debug — toggle debug output level
│   ├── history.js                # /history — export conversation as file
│   ├── join.js                   # /join — join voice channel
│   └── leave.js                  # /leave — leave voice channel
│
├── handlers/
│   └── message/
│       ├── messageHandler.js     # Core AI pipeline (decision → response → send)
│       ├── messageSender.js      # Discord message sending + emoji resolution
│       ├── responseParser.js     # XML response parser
│       └── modeHandler.js        # Response mode logic (active/passive RNG)
│
├── prompts/
│   ├── output_format.md          # Lumi response format instructions (XML)
│   └── decision_agent.md         # Decision agent instructions (RESPONDER/IGNORAR)
│
├── services/ai/
│   ├── ChatCompletionProvider.js # Abstract base class for AI providers
│   ├── ChatProviderFactory.js    # Factory: instantiates provider by env var
│   └── MistralChatAdapter.js     # Concrete Mistral AI implementation
│
├── utils/
│   ├── messageStore.js           # Per-channel in-memory message history
│   ├── messageQueue.js           # Per-channel sequential processing queue
│   ├── configStore.js            # Persistent XML config (model, temp, personality)
│   ├── agentManager.js           # System prompt construction + AI parameters
│   └── tools/
│       ├── registry.js           # Tool registry (definitions + executors)
│       ├── rng.js                # rng_tool: dice rolls and picks
│       ├── gif.js                # gif_tool: Tenor GIF search
│       └── status.js             # status_tool: change bot presence
│
├── .env.sample                   # Environment variable template
├── .github/workflows/deploy.yml  # CI/CD: deploys to self-hosted runner via PM2
├── package.json
└── renovate.json                 # Automated dependency updates
```

---

## Architecture

### Dual Client Architecture

The bot runs two separate Discord connections:

| Client | File | Purpose |
|--------|------|---------|
| REST/HTTP | `app.js` | Receives slash command interactions via HTTP POST `/interactions` |
| Gateway | `discordClient.js` | Subscribes to real-time events (messages, voice state) |

Both connect using the same token. The HTTP server runs on port `3000` (or `PORT` env var).

### Message Processing Pipeline

All passive messages (non-slash-commands) flow through this pipeline:

```
Discord Message
      ↓
discordClient.js  →  messageQueue.js (per-channel sequential queue)
      ↓
messageHandler.js
  1. Extract user messages from channel history
  2. Decision Agent (callDecisionAgent): RESPONDER or IGNORAR
  3. If RESPONDER:
       Mode check (modeHandler): Silent / Emote / Text / Free
       Lumi Agent (callLumiAgent): iterative tool-calling loop (max 10)
  4. responseParser.js: parse XML into structured message objects
  5. messageSender.js: send text, reactions, attachments to Discord
```

### AI Provider Abstraction

```
ChatCompletionProvider (abstract)
        ↓
MistralChatAdapter (concrete)
        ↓
ChatProviderFactory (factory, reads CHAT_PROVIDER env var, default: 'mistral')
```

To add a new AI provider, extend `ChatCompletionProvider` and register it in `ChatProviderFactory`.

---

## Environment Variables

Copy `.env.sample` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ID` | Yes | Discord application ID |
| `DISCORD_TOKEN` | Yes | Bot token |
| `PUBLIC_KEY` | Yes | Discord public key (interaction verification) |
| `MISTRAL_API_KEY` | Yes | Mistral AI API key |
| `TENOR_API_KEY` | No | Tenor API key (enables gif_tool) |
| `DEFAULT_DEBUG_MODE` | No | Default debug level: `off`\|`thoughts`\|`full` (default: `full`) |
| `PORT` | No | HTTP server port (default: `3000`) |
| `CHAT_PROVIDER` | No | AI provider identifier (default: `mistral`) |

---

## Development Workflows

### Install Dependencies

```bash
npm install
```

### Run in Development (hot-reload)

```bash
npm run dev
```

Uses nodemon; watches `.js`, `.json`, `.md`, `.xml` files.

### Register Slash Commands

```bash
npm run register
```

Run this after adding or modifying any command definition. Commands are registered globally.

### Start Production Server

```bash
npm start
```

### Expose Interactions Endpoint (local dev)

```bash
npm run ngrok
```

Creates a public tunnel to `localhost:3000` for Discord to send interactions.

---

## Configuration System

Configuration is persisted to `config.xml` via `utils/configStore.js`.

**Configurable via `/configure` slash command:**

| Setting | Default | Notes |
|---------|---------|-------|
| `model` | `mistral-small-latest` | Mistral model name |
| `temperature` | `0.7` | Creativity (0.0–1.0) |
| `presence_penalty` | `0` | Penalty for new topics (-2.0–2.0) |
| `frequency_penalty` | `0` | Penalty for repetition (-2.0–2.0) |
| `personality` | (none) | Appended to base system prompt |

Config is loaded at startup and saved after every change. If `config.xml` is missing, defaults are used.

---

## Slash Commands Reference

| Command | Description |
|---------|-------------|
| `/ping` | Health check — replies "Pong! 🏓" |
| `/reset` | Clear conversation history for current channel |
| `/memory view` | Show all active channels and message counts |
| `/memory clear_all` | Wipe all channel histories |
| `/configure show` | Display current config + personality as file attachment |
| `/configure model <name>` | Switch Mistral model |
| `/configure personality <text>` | Append or overwrite personality instructions |
| `/configure creativity <0.0–1.0>` | Set temperature |
| `/configure presence_penalty <value>` | Set presence penalty |
| `/configure frequency_penalty <value>` | Set frequency penalty |
| `/configure clear_personality` | Remove custom personality |
| `/debug <mode>` | Set debug level: `off`, `thoughts`, `decisions`, `full` |
| `/history` | Export conversation history as `.txt` file |
| `/join` | Join the voice channel of the command author |
| `/leave` | Disconnect from voice channel |

---

## Response Mode System

When Lumi decides to respond (`modeHandler.js`), the mode affects how she responds:

**Active Mode** (within 3 minutes of being mentioned):
- 50% Silent (no response)
- 30% Emote (reaction only)
- 20% Text (full response)

**Passive Mode** (not recently mentioned):
- 85% Silent
- 10% Emote
- 5% Free (text response)

The mode system creates natural, non-spammy behavior in group chats.

---

## Tool System

Tools are registered in `utils/tools/registry.js` and follow Mistral's function-calling format.

**Available tools:**

| Tool | Description |
|------|-------------|
| `rng_tool` | Roll dice (ROLL) or pick from options (PICK) |
| `gif_tool` | Search Tenor for a GIF by query |
| `status_tool` | Change bot Discord presence (text, type, status) |

**Adding a new tool:**
1. Create `utils/tools/<name>.js` with `definition` (Mistral tool schema) and `execute(params)` function
2. Import and register in `utils/tools/registry.js`

The Lumi agent loops up to 10 iterations to support chained tool calls.

---

## AI Response Format

Lumi's responses are XML inside markdown code blocks. The parser (`responseParser.js`) extracts:

```xml
<THOUGHT>Internal reasoning (not sent to Discord)</THOUGHT>
<MESSAGE>
  <TEXT_CONTENT>Message text</TEXT_CONTENT>
  <REPLY_TO>DiscordMessageID</REPLY_TO>     <!-- optional -->
  <REACTION>emoji_code</REACTION>           <!-- optional -->
  <ATTACHMENT>URL</ATTACHMENT>              <!-- optional -->
</MESSAGE>
```

Multiple `<MESSAGE>` blocks are supported per response. Each maps to one Discord message sent.

---

## Debug System

Debug mode is set per-channel via `/debug` and falls back to `DEFAULT_DEBUG_MODE` env var.

| Level | Output |
|-------|--------|
| `off` | No debug output |
| `thoughts` | Shows `<THOUGHT>` blocks only |
| `decisions` | Shows decision agent evaluation |
| `full` | System prompt, full history, tool calls, complete XML |

Debug output is sent as file attachments to avoid cluttering the channel.

---

## Message Store

`utils/messageStore.js` tracks per-channel message history in memory:

- Max **100 messages** per channel (oldest trimmed automatically)
- Message states: `PENDING` → `WAITING` → `PROCESSED` / `GENERATING`
- Consecutive same-role messages are merged before sending to AI (token efficiency)
- Cleared on `/reset` or `/memory clear_all`

---

## Deployment & CI/CD Pipeline

The project features an automated, fast, and extremely clean CI/CD setup:

- **CI/CD Execution**: Handled automatically by `.github/workflows/deploy.yml` on every `git push` to the `main` branch.
- **Environment**: Runs on a **self-hosted runner** directly installed on the production OCI server `oci1` (`runs-on: self-hosted`).
- **Deployment Process**:
  1. Checks out the latest code from `main`.
  2. Syncs the workspace to `/opt/zavier-sama/` using `rsync` (efficiently excluding `.git`, `node_modules`, and `.env`).
  3. Generates the `.env` file dynamically on the fly using **GitHub Secrets & Variables**.
  4. Strips `package-lock.json` and runs a fresh `npm install --omit=dev --no-package-lock` (vital for resolving ARM/native dependencies correctly).
  5. Registers slash commands globally via `npm run register`.
  6. Restarts/reloads the PM2 process `zavier-sama` (falling back to direct startup of `app.js` if it isn't running).

> [!NOTE]
> **Line Endings (CRLF vs LF) Hash Differences:**
> When checking file integrity or comparing hashes between a Windows workspace (which uses `CRLF`) and the Linux `oci1` server (which uses `LF`), Git automatically handles final line endings. While SHA256 hashes will differ due to the line-ending byte representation (`\r\n` vs `\n`), the code contents are functionally identical. Manual `scp` transfers from Windows bypass the runner and transfer CRLF files directly to Linux. Under normal workflows, **always use `git push origin main`** to let the CI/CD pipeline deploy standard LF files.

---

## Key Conventions

### Code Style
- ES Modules throughout (`"type": "module"` in package.json) — use `import`/`export`, not `require`
- No TypeScript — plain JavaScript
- Functions are exported individually (named exports), not as default class instances
- Async/await used for all async operations

### Adding a Slash Command
1. Create `commands/<name>.js` with `data` (interaction definition) and `execute(interaction)` function
2. Import and add to the export in `commands.js`
3. Add routing in `app.js` command handler
4. Run `npm run register` to register with Discord

### Modifying the AI Pipeline
- System prompts live in `prompts/` as markdown files
- `agentManager.js` loads and assembles the system prompt at call time (not cached)
- Decision agent prompt: `prompts/decision_agent.md`
- Response format prompt: `prompts/output_format.md`
- Character personality: `LUMI_INSTRUCTIONS.md` (base) + configurable addition via `/configure personality`

### State
- All state is in-memory except `config.xml` (rules and dynamic rules) and `data/evolution_log.jsonl` (personality evolution logs).
- Restarting the bot clears active conversation history (stored in-memory in `messageStore.js`).
- There is no SQL/NoSQL database; persistence is XML/JSONL file-based.

### Error Handling
- Tool call errors are caught per-iteration in the Lumi agent loop
- The bot will not crash on individual message processing errors (handled in queue)

---

## Node.js Version

Requires **Node.js >= 18** (specifically runs on Node **v24.12.0** in production under OCI).

---

## 📋 Project Backlog & Tasks

The detailed task backlog has been extracted to a dedicated directory for better organization.
Please refer to: **[`docs/backlog/README.md`](./docs/backlog/README.md)**

*Current Priority:* **Iterating core Chat interactions & Evolution logs.**
