# 🌙 Lumi - Discord AI Bot

Un bot de Discord **informacional**: responde únicamente cuando lo mencionas con `@Lumi` (o cuando respondes a uno de sus mensajes). No lee ni comenta el resto del chat, pero al invocarlo lee los últimos mensajes del canal para entender el contexto.

## ✨ Características

- 🎯 **Solo por mención**: sin escucha pasiva. Si nadie lo menciona, no hace ninguna llamada a la IA.
- 🧠 **Contexto al momento**: al ser mencionado lee los últimos N mensajes del canal desde Discord. No guarda historial, así que el contexto siempre está fresco y no hay memoria que administrar.
- 🎭 **Dos personas**: asistente informativo neutro (por defecto) o el personaje Lumi, conmutables en caliente con `/configure persona`.
- 🔀 **Multi-proveedor**: Gemini, Groq y Mistral, con fallback automático de modelo si se agota la cuota (429) o el servicio está saturado (503).
- 🛠️ **Herramientas**: dados, búsqueda de GIFs, emojis y cambio de estado del bot.
- 🎥 **Multimedia**: resume videos de YouTube y escucha audios adjuntos (con Gemini).
- 📏 **Respuestas largas**: se dividen en varios mensajes sin truncar y sin romper los bloques de código.
- 🎤 **Soporte de Voz**: capacidad de unirse a canales de voz.
- 🧪 **Pruebas offline y simulador CLI**: suite que corre sin credenciales y consola interactiva para chatear localmente.

## 🚀 Inicio Rápido

### Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18.x
- Una [aplicación de Discord](https://discord.com/developers/applications) configurada
- API Key del proveedor de IA que vayas a usar: [Google Gemini](https://ai.google.dev/) (por defecto), [Groq](https://groq.com/) o [Mistral AI](https://mistral.ai/)

### Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/shockerqt/discord-ai-bot.git
cd discord-ai-bot
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno copiando `.env.sample` a `.env`:
```bash
cp .env.sample .env
```

4. Completa el archivo `.env` con tus credenciales:
```env
APP_ID=tu_app_id
PUBLIC_KEY=tu_public_key
DISCORD_TOKEN=tu_bot_token
GOOGLE_API_KEY=tu_google_api_key
```

> El bot necesita el intent **Message Content** y, en cada canal donde lo uses, permiso de
> **Read Message History** (así puede leer el contexto al ser mencionado).

5. Registra los slash commands:
```bash
npm run register
```

6. Inicia el bot:
```bash
npm start
```

Para desarrollo con hot-reload:
```bash
npm run dev
```

## 🧪 Pruebas y Simulación Local

Para facilitar las pruebas y el desarrollo del comportamiento de Lumi sin requerir levantar el bot en Discord en vivo, se incluye una robusta suite de desarrollo:

### 🏃 Ejecutar Pruebas Automatizadas
```bash
npm run test:e2e
```
Corre **sin credenciales**: el proveedor de IA se reemplaza por un doble de prueba. Valida la detección de menciones, la construcción del contexto, el parseo de respuestas, la división de mensajes largos y el pipeline completo (incluyendo tool-calling y fallback de modelo).

### 🎮 Iniciar Simulador Interactivo CLI
```bash
npm run simulate
```
Abre una consola para chatear con el bot contra la IA real, sobre un canal simulado en memoria. Escribe normal para mencionar a Lumi, o `nombre: mensaje` para agregar contexto de otro usuario sin invocarla.

Para más detalle: [Guía del Framework de Testing y Simulador](docs/e2e_testing.md)

### Configuración de Interacciones

El bot requiere un endpoint público para recibir interacciones de Discord.

1. Usa [ngrok](https://ngrok.com/) para crear un túnel:
```bash
npm run ngrok
```

2. Copia la URL HTTPS generada (ej: `https://xxxx.ngrok.io`)

3. En la [configuración de tu app](https://discord.com/developers/applications):
   - Ve a **General Information**
   - En **Interactions Endpoint URL**, pega: `https://xxxx.ngrok.io/interactions`
   - Guarda los cambios

## 🚀 Despliegue (CI/CD)

El bot incluye un workflow de GitHub Actions (`.github/workflows/deploy.yml`) para despliegue automático en un self-hosted runner al hacer push a la rama `main`.

En producción el artefacto vive en `/opt/lumi-bot` y se ejecuta como
`lumi-bot.service` bajo el usuario `ubuntu`. La aplicación escucha únicamente
en `127.0.0.1:8081`; Nginx termina TLS y reenvía el tráfico al puerto interno.
Los logs y el estado se consultan con:

```bash
sudo systemctl status lumi-bot.service
sudo journalctl -u lumi-bot.service
curl --fail http://127.0.0.1:8081/healthz
```

Durante el despliegue, el archivo `.env` se genera automáticamente. Para configurarlo, debes añadir los siguientes **Secrets** y **Variables** en tu repositorio (`Settings > Secrets and variables > Actions`):

**Repository Secrets:**
- `APP_ID`
- `DISCORD_TOKEN`
- `PUBLIC_KEY`
- `GOOGLE_API_KEY` (requerido para Gemini, el proveedor por defecto)
- `GEMINI_API_KEY` (usado por el resumidor de videos de YouTube)
- `MISTRAL_API_KEY` (opcional, si usas Mistral)
- `GROQ_API_KEY` (opcional, si usas Groq)
- `TENOR_API_KEY` (opcional, si usas `gif_tool`)
- `DASHBOARD_PASSWORD` (opcional, protege el dashboard)

**Repository Variables:**
- `DEFAULT_DEBUG_MODE` (Ej: `full`, `thoughts`, `off`)

El workflow fija `HOST=127.0.0.1` y `PORT=8081` como parte del contrato de
producción; no dependen de variables configurables del repositorio.

## 📋 Comandos

| Comando | Descripción |
|---------|-------------|
| `/ping` | Verifica que el bot está funcionando |
| `/configure show` | Muestra la configuración actual |
| `/configure persona` | Alterna entre asistente neutro y personaje Lumi |
| `/configure model` | Configura proveedor y modelo de IA |
| `/configure context_limit` | Cuántos mensajes previos lee como contexto (0-100) |
| `/configure personality` | Instrucciones extra para el system prompt |
| `/configure creativity` | Ajusta la temperatura |
| `/debug` | Nivel de debug: `off`, `thoughts`, `full` |
| `/history` | Exporta los mensajes recientes del canal |
| `/join` / `/leave` | Entra o sale de un canal de voz |

No hay `/reset` ni `/memory`: como no se guarda historial, no hay nada que limpiar.

## 📁 Estructura del Proyecto

```
├── app.js                    → Servidor Express, interacciones y API del dashboard
├── commands.js               → Registro de slash commands
├── discordClient.js          → Cliente Gateway; filtra menciones (isInvocation)
├── commands/                 → Implementación de cada comando
│   ├── configure.js
│   ├── debug.js
│   ├── history.js
│   ├── join.js
│   ├── leave.js
│   └── ping.js
├── handlers/
│   ├── mentionHandler.js     → El pipeline: contexto → agente → respuesta
│   ├── voiceHandler.js
│   └── message/              → Envío a Discord y parseo de respuestas
├── prompts/
│   ├── output_format.md      → Formato de salida (siempre cargado)
│   └── assistant.md          → Persona neutra
├── services/                 → Adaptadores de IA, media y voz
├── utils/
│   ├── contextBuilder.js     → Lee el historial desde Discord
│   ├── configStore.js        → Configuración persistente (config.xml)
│   ├── agentManager.js       → Ensamblado del system prompt
│   └── tools/                → Herramientas (dados, GIFs, emojis, estado)
├── public/index.html         → Dashboard de configuración
└── LUMI_INSTRUCTIONS.md      → Persona personaje
```

## 🛠️ Tecnologías

- **[Express](https://expressjs.com/)** - Servidor HTTP para interacciones
- **[discord.js](https://discord.js.org/)** - Cliente de Discord para Gateway y voz
- **[discord-interactions](https://github.com/discord/discord-interactions-js)** - Verificación de interacciones
- **[@google/genai](https://github.com/googleapis/js-genai)** - SDK de Gemini (proveedor por defecto)
- **[groq-sdk](https://github.com/groq/groq-typescript)** - SDK de Groq
- **[@mistralai/mistralai](https://github.com/mistralai/client-js)** - SDK de Mistral AI
- **[@discordjs/voice](https://discord.js.org/docs/packages/voice)** - Soporte de voz

## 📄 Licencia

MIT
