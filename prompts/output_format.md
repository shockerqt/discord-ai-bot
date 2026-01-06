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
