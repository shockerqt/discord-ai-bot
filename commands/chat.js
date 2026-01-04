import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import { Mistral } from '@mistralai/mistralai';
import { getConversationId, setConversationId, deleteConversationId } from '../utils/conversationStore.js';
import { getOmniAgentId } from '../utils/agentManager.js';
import { debugChannels } from './debug.js';

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// Slash command removed. This module now only handles passive messages.


// Helper to send interleaved messages
export async function handlePassiveMessage(messages) {
    // Ensure array
    const msgs = Array.isArray(messages) ? messages : [messages];
    if (msgs.length === 0) return;

    const lastMessage = msgs[msgs.length - 1]; // Use last message for context ID, channel, author(if needed generic)
    const contextId = lastMessage.channel.id;

    // Check for mentions to bypass RNG
    const botId = client.user?.id; // Need to ensure client is imported or accessible. 
    // Wait, 'client' is not imported in chat.js? 
    // chat.js imports Mistral client as 'client'. DISCORD client is passed in req? No.
    // handlePassiveMessage receives 'messages' (Discord Message objects).
    // messsage.mentions.users.has(botId)
    // We can get botId from the message.client.user.id

    // State for Active Mode (3 minutes)
    // Note: In a persistent bot, this should be outside the function scope. 
    // Since 'handlePassiveMessage' is exported, we need a module-level variable. 
    // Let's assume we can declare it at the top of the file, but for now, we'll check if we can attach it to the client or use a global.
    // Ideally, define `const channelLastActive = new Map();` at the top of the file. 
    // BUT since we are editing a chunk inside a function, I will rely on a module-level variable that I will ADD in a separate edit or assume exists? 
    // No, I should add it at the top level first or check if I can add it here. 
    // Wait, the user wants me to edit `chat.js`. I can't easily see the top level right now without viewing the file again, 
    // but I can add it to the `client` object if passed? No, `client` is the Mistral client.
    // Let's use a static property on the function or a global map in this module. 

    // Better idea: I will add the Map declaration at the top level in a separate edit if needed, 
    // OR I can use a property on `handlePassiveMessage` itself to simulate static state.
    if (!handlePassiveMessage.channelLastActive) {
        handlePassiveMessage.channelLastActive = new Map();
    }
    const lastActiveTime = handlePassiveMessage.channelLastActive.get(contextId) || 0;
    const nowTime = Date.now();
    const isActiveMode = (nowTime - lastActiveTime) < (3 * 60 * 1000); // 3 minutes

    // Check if ANY message in the batch mentions the bot
    const botUser = lastMessage.client.user;
    const isMentioned = msgs.some(m =>
        m.mentions.users.has(botUser.id) ||
        /^lumi\b/i.test(m.content.trim())
    );

    let forcedInstruction = "";
    let debugRngInfo = "";

    if (isMentioned) {
        // Update Active Timestamp
        handlePassiveMessage.channelLastActive.set(contextId, nowTime);
        debugRngInfo = "Mode: Active (Mentioned) | 3.0m left";
        forcedInstruction = "\n\n[SISTEMA]: MODO ACTIVO INICIADO. Tienes 3.0 minutos de atención prioritaria. Responde (TEXTO o REACCIÓN) SOLO si el mensaje ES RELEVANTE para la conversación en curso o si te mencionan directamente. Si cambian de tema a algo que no te incumbe, IGNORA (<SEND_TEXT>: FALSE, <REACTION>: NULL).";
        console.log("[Active Mode] Refreshed by Mention.");
    } else if (isActiveMode) {
        // ACTIVE MODE (Timer)
        // Bypass RNG, but conditional response based on relevance logic
        const timeLeft = (3 - (nowTime - lastActiveTime) / 60000).toFixed(1);
        debugRngInfo = `Mode: Active (Timer) | ${timeLeft}m left`;
        forcedInstruction = `\n\n[SISTEMA]: MODO ACTIVO (${timeLeft}m restantes). El usuario te habló hace poco. Responde (TEXTO o REACCIÓN) SOLO si el mensaje sigue el hilo de la conversación original. Si el usuario habla de otra cosa irrelevante para ti, DEBES IGNORAR.`;
        console.log(`[Active Mode] Timer Active. ${debugRngInfo}`);
    } else {
        // PASSIVE MODE (RNG)
        const roll = Math.random() * 100;
        let modeName = "Unknown";

        if (roll < 85) {
            // 85% Silent Mode
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO SILENCIOSO. El RNG SOLO decidió que NO tienes permiso para hablar esta vez. Tu personalidad y nivel de caos NO cambian por el RNG. Configura <SEND_TEXT> en FALSE. <REACTION> DEBE SER NULL (Prohibido reaccionar en este modo).`;
            modeName = "Silent";
        } else if (roll < 95) {
            // 10% Emote Mode (Reaction Only, No Text)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO EMOTE. El RNG decidió que SOLO puedes usar emojis. Configura <SEND_TEXT> en FALSE. <REACTION> está PERMITIDA si el contexto lo amerita (no es obligatorio, sé selectiva).`;
            modeName = "Emote Mode";
        } else {
            // 5% Free Mode (Text + Reaction Allowed)
            forcedInstruction = `\n\n[SISTEMA]: RNG ROLL: ${roll.toFixed(2)}. MODO LIBRE. El RNG SOLO decidió que TIENES permiso para hablar esta vez. Tu personalidad y nivel de caos NO cambian por el RNG - siempre eres tú misma. Puedes responder (<SEND_TEXT>: TRUE) o reaccionar si el contexto lo amerita.`;
            modeName = "Free Mode";
        }

        debugRngInfo = `Mode: ${modeName} (Roll: ${roll.toFixed(2)}%)`;
        console.log(`[RNG] Triggered! ${debugRngInfo}`);
    }

    // Construct Context from Batch
    const now = new Date().toLocaleString('es-ES', { timeZone: 'America/Santiago' });
    let fullContent = "--- CURRENT MESSAGES ---\n";

    // Append batch messages line by line
    for (const msg of msgs) {
        const authorName = msg.member ? msg.member.displayName : msg.author.username;
        fullContent += `[${now}] (ID: ${msg.id}) (UID: ${msg.author.id}) ${authorName}: ${msg.content}\n`;
    }

    const OUTPUT_INSTRUCTION = `
### FORMATO DE SALIDA (TAGS OBLIGATORIO) -- NO USES JSON
Responde SIEMPRE usando estos tags exactos. No incluyas nada fuera de los tags.
<THOUGHT>
Piensa como si fueras una persona real en Discord:

1. **Primera impresión**: ¿Qué siento al leer esto? ¿Me da risa, me aburre, me interesa, me irrita? ¿Cuál es mi reacción instintiva?

2. **¿Me están hablando? (CONTEXTO DE CHAT GRUPAL)**: 
   - Estamos en un grupo. NO todo gira en torno a mí.
   - **Discernir Atención**: No hace falta un @tag para que me hablen. Si dicen "Lumi", me están invocando.
   - **¿Me hablan A mí o DE mí?**:
     - "Lumi, ¿qué opinas?" -> Me hablan A mí -> Responder.
     - "Lumi es muy rara" -> Hablan DE mí -> Evaluar. A menudo es mejor dejar pasar el comentario o reaccionar (emoji) en lugar de meterse a la fuerza.
   - Si no me hablan ni A mí ni DE mí, y el tema es ajeno -> IGNORAR (Lurkear).
   - Intervenir en cada mensaje es molesto. Aprende a callar y observar.

3. **Leer el ambiente**: ¿Cómo está el chat? ¿Están de buen humor, serios, trolleando? ¿Es momento de meter cuchara o mejor callarme? Revisa el modo actual (Silencioso/Libre/Activo) y respétalo.

4. **Si decido responder**: Revisa tu personalidad en las instrucciones del agente. Formula algo que suene a TI, no a un bot genérico. ¿Qué diría alguien con MI personalidad en esta situación?

5. **Decisión de Reacción (CHECK DE REGLAS)**:
   - **Frecuencia (OBLIGATORIA)**: ¿He reaccionado en los últimos 5-10 mensajes? Si SÍ -> ABORTAR reacción (NULL). Las reacciones deben ser ESPACIADAS.
   - **Excepción Ultra Rara**: Solo si es una ocasión MUY ínfima puedo hacer spam de emojis o letras regionales (🇦🇧🇨...). REGLA: Si ya usé este recurso alguna vez, JAMÁS repetirlo.
   - **Justificación**: ¿Es genuinamente gracioso o necesario? Si no -> ABORTAR.

6. **Último check antes de enviar**:
   - ¿Suena natural? ¿Un usuario real de Discord escribiría esto?
   - ¿Es corto y directo? Nada de párrafos largos.
   - ¿Estoy repitiendo algo que ya dije antes? Variedad es clave.
   - Si algo no cuadra, reescríbelo.
</THOUGHT>
<SEND_TEXT>
TRUE o FALSE
</SEND_TEXT>
<TEXT_CONTENT>
Tu respuesta de texto aquí. Vacío si SEND_TEXT es FALSE. Respuesta directa sin comillas.
</TEXT_CONTENT>
<REPLY_TO>
ID del mensaje al que respondes o NULL
</REPLY_TO>
<REACTION>
Uno o más emojis (ej: 😂 o 🔥💀) o NULL.
Usa NULL si no pasaste el Check de Reglas (Paso 5) en tu pensamiento.
</REACTION>`;

    // REORDER: System/Context instructions FIRST, then Format instructions.
    fullContent += forcedInstruction;
    fullContent += OUTPUT_INSTRUCTION;

    // Log Prompt
    console.log("--- PROMPT SENT TO AGENT ---");
    console.log(fullContent);
    console.log("----------------------------");

    // Debug: Echo Input to Chat
    if (debugChannels.has(contextId)) {
        const debugInputContent = `RNG: ${debugRngInfo}\n\n${fullContent}`;
        const buffer = Buffer.from('\uFEFF' + debugInputContent, 'utf-8');
        try {
            await lastMessage.channel.send({
                content: `**[DEBUG INPUT]**`,
                files: [{
                    attachment: buffer,
                    name: `debug-input-${Date.now()}.txt`
                }]
            });
        } catch (err) {
            console.error("Failed to send debug input attachment:", err);
        }
    }

    try {
        let conversationId = getConversationId(contextId);
        let contentBuffer = "";
        let currentState = "idle"; // "idle" | "thinking" | "writing"
        let hasShownTyping = false;

        // Función auxiliar para extraer texto de eventos de streaming
        const extractTextFromEvent = (event) => {
            // DEBUG: Loguear estructura completa del evento (comentar después de debuggear)
            // console.log("[Stream Event]", JSON.stringify(event, null, 2));

            // Manejar eventos message.output.delta - el contenido está en event.data.content
            if (event.data?.type === 'message.output.delta' && event.data.content) {
                return event.data.content;
            }

            // Manejar content.delta (formato alternativo)
            if (event.data?.type === 'content.delta' && event.data.delta?.text) {
                return event.data.delta.text;
            }

            // Verificar propiedades directas (el evento podría no tener .data)
            if (event.type === 'message.output.delta' && event.content) {
                return event.content;
            }

            if (event.type === 'content.delta' && event.delta?.text) {
                return event.delta.text;
            }

            // Manejar array de outputs si está presente (para eventos finales)
            if (event.data?.outputs && Array.isArray(event.data.outputs)) {
                return event.data.outputs
                    .filter(o => o.content)
                    .map(o => {
                        if (Array.isArray(o.content)) {
                            return o.content.filter(p => p.type === 'text').map(p => p.text).join('');
                        }
                        return typeof o.content === 'string' ? o.content : '';
                    })
                    .join('');
            }

            return "";
        };

        let streamResult;

        if (!conversationId) {
            const agentId = await getOmniAgentId();
            // Iniciar nueva conversación con streaming
            streamResult = await client.beta.conversations.startStream({
                agentId: agentId,
                inputs: [{ role: 'user', content: fullContent }]
            });
        } else {
            // Continuar conversación con streaming
            streamResult = await client.beta.conversations.appendStream({
                conversationId: conversationId,
                conversationAppendStreamRequest: {
                    inputs: [{ role: 'user', content: fullContent }]
                }
            });
        }

        // Procesar el stream
        for await (const event of streamResult) {
            // Extraer ID de conversación del primer evento si es una nueva conversación
            if (!conversationId && event.data?.conversationId) {
                conversationId = event.data.conversationId;
                setConversationId(contextId, conversationId);
            }

            const chunk = extractTextFromEvent(event);
            contentBuffer += chunk;

            // Detectar apertura de tags para cambiar estado
            if (contentBuffer.includes("<THOUGHT>") && !contentBuffer.includes("</THOUGHT>")) {
                if (currentState !== "thinking") {
                    currentState = "thinking";
                    console.log("[Streaming] State: THINKING");
                }
            }

            // Solo mostrar typing si hay contenido real después de <TEXT_CONTENT>
            if (contentBuffer.includes("<TEXT_CONTENT>") && !contentBuffer.includes("</TEXT_CONTENT>")) {
                // Extraer contenido después del tag de apertura
                const afterTag = contentBuffer.split("<TEXT_CONTENT>")[1] || "";
                // Verificar si hay contenido que no sea solo espacios en blanco
                if (afterTag.trim().length > 0 && currentState !== "writing" && !hasShownTyping) {
                    currentState = "writing";
                    console.log("[Streaming] State: WRITING - Sending typing indicator");
                    await lastMessage.channel.sendTyping();
                    hasShownTyping = true;
                }
            }
        }

        // Si aún no tenemos conversationId guardado (caso edge), intentar guardarlo
        if (!getConversationId(contextId) && conversationId) {
            setConversationId(contextId, conversationId);
        }

        // Strip code blocks if AI wrapped it in ```xml ... ```
        let contentStr = contentBuffer.replace(/```xml/g, '').replace(/```/g, '').trim();

        console.log("--- RAW RESPONSE ---");
        console.log(contentStr);
        console.log("--------------------");

        // PARSE TAGS using Regex
        const extract = (tag) => {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
            const match = contentStr.match(regex);
            return match ? match[1].trim() : null;
        };

        const thought = extract('THOUGHT');
        const sendTextRaw = extract('SEND_TEXT');
        const textContent = extract('TEXT_CONTENT');
        const replyToRaw = extract('REPLY_TO');
        const reactionRaw = extract('REACTION');

        const parsedResponse = {
            thought: thought || "",
            send_text: sendTextRaw && sendTextRaw.toUpperCase().includes('TRUE'),
            text_content: textContent || "",
            reply_to: (replyToRaw && replyToRaw.toUpperCase() !== 'NULL') ? replyToRaw : null,
            reaction: (reactionRaw && reactionRaw.toUpperCase() !== 'NULL') ? reactionRaw : null
        };

        console.log("--- PARSED RESPONSE ---");
        console.log(parsedResponse);
        console.log("-----------------------");

        // --- Process Parsed Output ---
        const output = parsedResponse;

        // Debug Mode Output
        if (debugChannels.has(contextId)) {
            const debugContent = `
RNG INFO: ${debugRngInfo}

--- COMPLETE RAW XML ---
${contentStr}
`;
            const buffer = Buffer.from('\uFEFF' + debugContent, 'utf-8');
            try {
                await lastMessage.channel.send({
                    content: `**[DEBUG OUTPUT]**`,
                    files: [{
                        attachment: buffer,
                        name: `debug-${Date.now()}.txt`
                    }]
                });
            } catch (err) {
                console.error("Failed to send debug attachment:", err);
            }
        }

        if (output.send_text && output.text_content) {
            // Send Typing (might already have been sent, but ensure it)
            if (!hasShownTyping) {
                await lastMessage.channel.sendTyping();
            }

            // ... logic to send message ...
            const msgOptions = { content: output.text_content };
            if (output.reply_to) {
                msgOptions.reply = { messageReference: output.reply_to };
            }

            try {
                await lastMessage.channel.send(msgOptions);
            } catch (sendErr) {
                console.error("Failed to send message:", sendErr);
            }
        }

        if (output.reaction) {
            try {
                // Support multiple reactions (e.g. "🎲⏳💀")
                // Use Intl.Segmenter to properly split emojis (grapheme clusters)
                const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
                const reactions = Array.from(segmenter.segment(output.reaction)).map(s => s.segment);

                // Limit to first 3 to avoid spam if AI goes crazy
                for (const reactionEmoji of reactions.slice(0, 3)) {
                    try {
                        await lastMessage.react(reactionEmoji);
                    } catch (e) {
                        console.error(`Failed to react with ${reactionEmoji}:`, e.message);
                    }
                }
            } catch (e) {
                console.error(`Failed to process reactions:`, e.message);
            }
        }


    } catch (error) { // End try
        console.error("Error calling Mistral:", error);
        if (debugChannels.has(contextId)) {
            await lastMessage.channel.send(`**Error**: ${error.message}`);
        }
    }
}
