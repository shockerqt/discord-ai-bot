# CLAUDE.md — Discord AI Bot (Lumi)

## Project Overview

This is a Discord bot named **Lumi** that answers **only when mentioned**. It has no passive
listening, no memory store and no decision agent: a mention (`@Lumi`, or a reply to one of its
messages) triggers a single AI call, and the conversation context is read from Discord on the spot.

Two personas are available (switchable at runtime with `/configure persona`):

| Persona | Prompt | Behaviour |
|---------|--------|-----------|
| `assistant` (default) | `prompts/assistant.md` | Neutral, informative, concise |
| `lumi` | `LUMI_INSTRUCTIONS.md` | Full character, custom emojis, GIFs |

---

## Directory Structure

```
discord-ai-bot/
├── app.js                        # Express HTTP server + slash command routing + dashboard API
├── discordClient.js              # Discord.js Gateway client; filters mentions (isInvocation)
├── commands.js                   # Bulk slash command registration script
├── utils.js                      # Discord API helpers, verification middleware
├── LUMI_INSTRUCTIONS.md          # Lumi character personality (persona 'lumi')
│
├── commands/                     # Slash command implementations
│   ├── ping.js                   # /ping — health check
│   ├── configure.js              # /configure — persona, model, context size, temperature…
│   ├── debug.js                  # /debug — toggle debug output level
│   ├── history.js                # /history — export the channel's recent messages
│   ├── join.js                   # /join — join voice channel
│   └── leave.js                  # /leave — leave voice channel
│
├── handlers/
│   ├── mentionHandler.js         # THE pipeline: context → agent (tools) → send
│   ├── voiceHandler.js           # Voice channel connection management
│   └── message/
│       ├── messageSender.js      # Discord sending, emoji resolution, 2000-char splitting
│       └── responseParser.js     # XML response parser (+ plain-text fallback)
│
├── prompts/
│   ├── output_format.md          # Response format instructions (XML), always loaded
│   └── assistant.md              # Neutral assistant instructions (persona 'assistant')
│
├── services/
│   ├── ai/
│   │   ├── ChatCompletionProvider.js # Abstract base class for AI providers
│   │   ├── ChatProviderFactory.js    # Factory: instantiates provider from config
│   │   ├── GeminiChatAdapter.js      # Gemini (default; supports audio input)
│   │   ├── GroqChatAdapter.js        # Groq
│   │   └── MistralChatAdapter.js     # Mistral
│   ├── media/mediaProcessor.js   # YouTube video summarization via Gemini
│   └── genAiVoiceService.js      # Voice/live audio service
│
├── utils/
│   ├── contextBuilder.js         # Reads channel history from Discord, builds the AI context
│   ├── configStore.js            # Persistent XML config (config.xml)
│   ├── agentManager.js           # System prompt assembly + model params
│   └── tools/
│       ├── registry.js           # Tool registry (definitions + executors)
│       ├── rng.js                # rng_tool: dice rolls and picks
│       ├── gif.js                # gif_tool: GIF search
│       ├── emoji.js              # emoji_tool
│       └── status.js             # status_tool: change bot presence
│
├── public/index.html             # Config dashboard (single page)
├── tests/e2e.js                  # Offline test suite (fake AI provider)
├── scripts/simulate.js           # Interactive CLI simulator
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

Both connect using the same token. The HTTP server runs on port `3000` (or `PORT` env var) and also
serves the dashboard and its API.

### Mention Pipeline

```
Discord Message
      ↓
discordClient.js — isInvocation(message)?      ← mentions.users.has(botId)
      ↓ (no) descartado, sin llamadas a la IA
      ↓ (sí)
mentionHandler.js — handleMention(message)
  1. sendTyping()
  2. resolveVideoContext: si hay URL de YouTube, la resume (inline, avisa en el canal)
  3. contextBuilder.buildConversationContext: fetch de los últimos N mensajes del canal
  4. callAgent: system prompt + contexto → loop de tool-calling (máx. 10 iteraciones)
  5. responseParser.parseAIResponse: XML → objetos de mensaje
  6. messageSender: envía texto (partido a 2000 chars), reacciones y adjuntos
```

**`isInvocation`** uses `message.mentions.users`, which contains only explicit user mentions. That
covers a hand-typed `@Lumi` and a reply-with-ping to one of Lumi's messages, and excludes
`@everyone`, `@here` and role mentions by construction.

### Context (no persistence)

There is no message store. `utils/contextBuilder.js` calls
`channel.messages.fetch({ limit, before })` at invocation time and maps the result:

- The bot's own messages become `assistant` turns; everyone else's become `user` turns.
- Consecutive turns of the same role are merged to save tokens.
- Each user line is formatted as `[HH:MM] Nombre: contenido`, plus notes for attachments.
- The triggering message is always the last entry, labelled as the mention to answer.
- If the message replies to another one, the quoted text is appended to that last entry.
- Audio attachments are attached as `mediaAttachments` (consumed by `GeminiChatAdapter`;
  other providers degrade them to a text note via `stripMediaAttachments`).

Consequences: the context is always fresh (edits and deletions included), nothing survives to leak,
there is nothing to reset, and reading history requires the bot to have **Read Message History**
permission in the channel. If the fetch fails, the bot still answers using only the mention.

### AI Provider Abstraction

```
ChatCompletionProvider (abstract)
        ↓
GeminiChatAdapter / GroqChatAdapter / MistralChatAdapter
        ↓
ChatProviderFactory (reads config.provider, then CHAT_PROVIDER env var, default: 'mistral')
```

To add a new AI provider, extend `ChatCompletionProvider` and register it in `ChatProviderFactory`.

`mentionHandler.callAgent` falls back through `FALLBACK_MODELS` when a model returns 429
(quota) or 503 (overloaded).

---

## Environment Variables

Copy `.env.sample` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_ID` | Yes | Discord application ID |
| `DISCORD_TOKEN` | Yes | Bot token |
| `PUBLIC_KEY` | Yes | Discord public key (interaction verification) |
| `GOOGLE_API_KEY` | For Gemini | Gemini API key (default provider) |
| `GEMINI_API_KEY` | For video | Key used by `mediaProcessor` (YouTube summaries) |
| `MISTRAL_API_KEY` | For Mistral | Mistral AI API key |
| `GROQ_API_KEY` | For Groq | Groq API key |
| `TENOR_API_KEY` | No | Tenor API key (enables gif_tool) |
| `DASHBOARD_PASSWORD` | No | Basic-auth password for the dashboard (user: `admin`) |
| `DEFAULT_DEBUG_MODE` | No | Default debug level: `off`\|`thoughts`\|`full` |
| `PORT` | No | HTTP server port (default: `3000`) |
| `CHAT_PROVIDER` | No | Fallback provider if config.xml has none (default: `mistral`) |

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

### Test and Simulate

```bash
npm run test:e2e   # suite offline, sin credenciales (proveedor de IA falso)
npm run simulate   # CLI interactivo contra la IA real (usa .env)
```

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

Configuration is persisted to `config.xml` via `utils/configStore.js` (see `config.sample.xml`).

| Setting | Default | Notes |
|---------|---------|-------|
| `persona` | `assistant` | `assistant` (neutro) or `lumi` (personaje) |
| `provider` | `gemini` | `gemini` \| `groq` \| `mistral` |
| `model` | `gemini-3.7-flash` | Model name for the active provider |
| `context_limit` | `20` | Previous channel messages read as context (0–100) |
| `temperature` | `0.7` | Creativity (0.0–1.0) |
| `presence_penalty` | `0` | Penalty for new topics (-2.0–2.0) |
| `frequency_penalty` | `0` | Penalty for repetition (-2.0–2.0) |
| `personality` | (none) | Extra instructions appended to the system prompt |

Config is loaded at startup and saved after every change. If `config.xml` is missing, defaults are
used and the file is created. Editable from `/configure` or the dashboard.

---

## Slash Commands Reference

| Command | Description |
|---------|-------------|
| `/ping` | Health check — replies "Pong! 🏓" |
| `/configure show` | Display current config + personality as file attachment |
| `/configure persona <mode>` | Switch between neutral assistant and Lumi character |
| `/configure model <name>` | Switch provider + model |
| `/configure context_limit <0-100>` | How many previous messages to read as context |
| `/configure personality <text\|file>` | Append (text) or overwrite (file) extra instructions |
| `/configure creativity <0.0–1.0>` | Set temperature |
| `/configure presence_penalty <value>` | Set presence penalty |
| `/configure frequency_penalty <value>` | Set frequency penalty |
| `/configure clear_personality` | Remove extra instructions |
| `/debug <mode>` | Set debug level: `off`, `thoughts`, `full` |
| `/history [limit]` | Export the channel's recent messages as a `.txt` file |
| `/join` | Join the voice channel of the command author |
| `/leave` | Disconnect from voice channel |

There is no `/reset` or `/memory`: with no stored history there is nothing to clear.

---

## Dashboard

Served at `/` from `public/index.html`, protected by basic auth when `DASHBOARD_PASSWORD` is set.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Current configuration |
| `/api/config` | PATCH | Update any of: `provider`, `model`, `persona`, `context_limit`, `temperature`, `presence_penalty`, `frequency_penalty` |
| `/api/personality` | GET / PUT | Read / replace the extra instructions |

---

## Tool System

Tools are registered in `utils/tools/registry.js` and follow the OpenAI/Mistral function-calling format.

**Available tools:**

| Tool | Description |
|------|-------------|
| `rng_tool` | Roll dice (ROLL) or pick from options (PICK) |
| `gif_tool` | Search for a GIF by query |
| `emoji_tool` | Look up available custom emojis |
| `status_tool` | Change bot Discord presence (text, type, status) |

**Adding a new tool:**
1. Create `utils/tools/<name>.js` with `definition` (tool schema) and `execute(params)` function
2. Import and register in `utils/tools/registry.js`

`callAgent` loops up to 10 iterations to support chained tool calls.

---

## AI Response Format

Responses are XML (see `prompts/output_format.md`). The parser (`responseParser.js`) extracts:

```xml
<THOUGHT>Internal reasoning (optional, not sent to Discord)</THOUGHT>
<MESSAGE>
  <TEXT_CONTENT>Message text</TEXT_CONTENT>
  <REACTION>emoji_code</REACTION>          <!-- optional -->
  <ATTACHMENT>URL</ATTACHMENT>             <!-- optional -->
</MESSAGE>
```

Multiple `<MESSAGE>` blocks are supported; each maps to one Discord message. The first one is sent
as a reply to the mention.

**Robustness:** a mention must always get an answer, so if the model ignores the XML format the
parser sends its plain text instead. `cleanContent` only strips an *outer* ```` ```xml ```` wrapper,
so code blocks inside the answer survive.

**Long answers:** `messageSender.splitMessage` splits text above 2000 characters across several
messages, cutting at paragraph/line boundaries and closing/reopening code fences so no ``` block is
left open. Nothing is truncated.

---

## Debug System

Debug mode is set per-channel via `/debug` and falls back to `DEFAULT_DEBUG_MODE` env var.

| Level | Output |
|-------|--------|
| `off` | No debug output |
| `thoughts` | Shows the `<THOUGHT>` block only |
| `full` | System prompt, context sent, tool trace, raw XML, token usage |

Debug output is sent as file attachments to avoid cluttering the channel.

---

## Deployment & CI/CD Pipeline

The project features an automated, fast, and extremely clean CI/CD setup:

- **CI/CD Execution**: Handled automatically by `.github/workflows/deploy.yml` on every `git push` to the `main` branch.
- **Environment**: Runs on the dedicated **self-hosted runner** `lumi-bot-vps` on the production OCI server (`runs-on: self-hosted`).
- **Deployment Process**:
  1. Checks out the latest code from `main`.
  2. Syncs the workspace to `/opt/lumi-bot/` using `rsync` (efficiently excluding `.git`, `node_modules`, and `.env`).
  3. Generates the `.env` file dynamically on the fly using **GitHub Secrets & Variables**.
  4. Strips `package-lock.json` and runs a fresh `npm install --omit=dev --no-package-lock` (vital for resolving ARM/native dependencies correctly).
  5. Registers slash commands globally via `npm run register`.
  6. Installs and restarts `lumi-bot.service`, then verifies its loopback health endpoint.

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
1. Create `commands/<name>.js` with `data` (interaction definition) and `execute(req, res)` function
2. Import and add to `ALL_COMMANDS` in `commands.js`
3. Add it to the `commands` registry in `app.js`
4. Run `npm run register` to register with Discord

### Modifying the AI Pipeline
- System prompts live in `prompts/` as markdown files
- `agentManager.js` loads and assembles the system prompt at call time (not cached across personas)
- Response format prompt: `prompts/output_format.md` (always loaded)
- Neutral persona: `prompts/assistant.md`
- Character persona: `LUMI_INSTRUCTIONS.md` + extra instructions via `/configure personality`

### State
- The only persistent state is `config.xml`. Conversation context is read from Discord on demand.
- There is no database and no message history file; restarting the bot loses nothing.

### Error Handling
- Tool call errors are caught per-iteration in the agent loop
- Provider quota/overload errors trigger a model fallback
- A failed AI call sends nothing to the channel (only logs), unless debug mode is on

---

## Node.js Version

Requires **Node.js >= 18** (specifically runs on Node **v24.12.0** in production under OCI).

---

## 📋 Project Backlog & Tasks

The detailed task backlog has been extracted to a dedicated directory for better organization.
Please refer to: **[`docs/backlog/README.md`](./docs/backlog/README.md)**

*Current Priority:* **Iterating the mention-only informational flow.**
