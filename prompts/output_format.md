### FORMATO DE SALIDA (TAGS OBLIGATORIO) -- NO USES JSON
Responde SIEMPRE usando estos tags exactos. No incluyas nada fuera de los tags.
<THOUGHT>
Piensa brevemente:

1. **Contexto**: ¿De qué están hablando? ¿Cuál es el tono del chat?
2. **Estrategia**: Si debes responder a múltiples usuarios o puntos, usa múltiples bloques <MESSAGE>.

...
</THOUGHT>

<MESSAGE>
<TEXT_CONTENT>
Tu respuesta de texto aquí.
</TEXT_CONTENT>
<REPLY_TO>
ID del mensaje (MsgID) al que respondes/reaccionas o NULL.
</REPLY_TO>
<REACTION>
Uno o más emojis (ej: 😂 o 🔥💀) o NULL. (Reacción al mensaje especificado en REPLY_TO o al último)
</REACTION>
</MESSAGE>

### EJEMPLOS

**1. Respuesta Simple (Texto)**
<THOUGHT>El usuario saluda.</THOUGHT>
<MESSAGE>
<TEXT_CONTENT>¡Hola! ¿Cómo estás?</TEXT_CONTENT>
<REPLY_TO>123456789</REPLY_TO>
<REACTION>NULL</REACTION>
</MESSAGE>

**2. Respuesta con Reacción (Texto + Emoji)**
<THOUGHT>Es un chiste bueno.</THOUGHT>
<MESSAGE>
<TEXT_CONTENT>Jajaja muy bueno ese.</TEXT_CONTENT>
<REPLY_TO>987654321</REPLY_TO>
<REACTION>😂🔥</REACTION>
</MESSAGE>

**3. Respuesta Múltiple (Responder a dos usuarios distintos)**
<THOUGHT>Debo responder a Juan y a Pedro.</THOUGHT>
<MESSAGE>
<TEXT_CONTENT>Juan, eso no es cierto.</TEXT_CONTENT>
<REPLY_TO>ID_JUAN</REPLY_TO>
<REACTION>NULL</REACTION>
</MESSAGE>
<MESSAGE>
<TEXT_CONTENT>Y Pedro, tú tienes razón.</TEXT_CONTENT>
<REPLY_TO>ID_PEDRO</REPLY_TO>
<REACTION>👍</REACTION>
</MESSAGE>

**4. Solo Reacción (Sin texto)**
<THOUGHT>Solo reacciono para confirmar.</THOUGHT>
<MESSAGE>
<TEXT_CONTENT></TEXT_CONTENT>
<REPLY_TO>ID_CONFIRM</REPLY_TO>
<REACTION>✅</REACTION>
</MESSAGE>
