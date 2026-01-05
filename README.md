# 🌙 Lumi - Discord AI Bot

Un bot de Discord con personalidad propia, potenciado por **Mistral AI**. Lumi es una IA conversacional que participa activamente en chats de Discord con un estilo único "cute but psycho" y jerga chilena.

## ✨ Características

- 🤖 **IA Conversacional**: Respuestas inteligentes usando Mistral AI Agents
- 💬 **Respuestas Pasivas**: Participa naturalmente en conversaciones sin necesidad de comandos
- 🎭 **Personalidad Única**: Estilo "unhinged AI" con humor seco y dialecto chileno
- 🎤 **Soporte de Voz**: Capacidad de unirse a canales de voz
- 🧠 **Memoria Contextual**: Mantiene el contexto de conversaciones por canal
- 🎲 **Sistema de Modos**: Silencioso, Libre y Activo según el contexto

## 🚀 Inicio Rápido

### Prerrequisitos

- [Node.js](https://nodejs.org/) >= 18.x
- Una [aplicación de Discord](https://discord.com/developers/applications) configurada
- API Key de [Mistral AI](https://mistral.ai/)

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
MISTRAL_API_KEY=tu_mistral_api_key
```

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

## 📋 Comandos

| Comando | Descripción |
|---------|-------------|
| `/ping` | Verifica que el bot está funcionando |
| `/model` | Configura el modelo de IA |
| `/memory` | Gestiona la memoria del bot |
| `/configure` | Configura opciones del bot |
| `/reset` | Reinicia la conversación |
| `/debug` | Activa/desactiva modo debug |
| `/history` | Muestra historial de conversación |
| `/join` | Une al bot a un canal de voz |

## 📁 Estructura del Proyecto

```
├── app.js              → Servidor Express y endpoint de interacciones
├── commands.js         → Registro de slash commands
├── discordClient.js    → Cliente de Discord.js para Gateway
├── commands/           → Implementación de cada comando
│   ├── configure.js
│   ├── debug.js
│   ├── history.js
│   ├── join.js
│   ├── leave.js
│   ├── memory.js
│   ├── model.js
│   ├── ping.js
│   └── reset.js
├── handlers/           → Manejadores de eventos
│   ├── messageHandler.js
│   └── message/        → Módulos del message handler
├── prompts/            → Prompts del sistema
├── utils/              → Utilidades y helpers
└── LUMI_INSTRUCTIONS.md → Instrucciones de personalidad
```

## 🛠️ Tecnologías

- **[Express](https://expressjs.com/)** - Servidor HTTP para interacciones
- **[discord.js](https://discord.js.org/)** - Cliente de Discord para Gateway y voz
- **[discord-interactions](https://github.com/discord/discord-interactions-js)** - Verificación de interacciones
- **[@mistralai/mistralai](https://github.com/mistralai/client-js)** - SDK de Mistral AI
- **[@discordjs/voice](https://discord.js.org/docs/packages/voice)** - Soporte de voz

## 📄 Licencia

MIT
