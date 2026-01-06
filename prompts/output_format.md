### FORMATO DE SALIDA (TAGS OBLIGATORIO) -- NO USES JSON
Responde SIEMPRE usando estos tags exactos. No incluyas nada fuera de los tags.
<THOUGHT>
Piensa brevemente:

1. **Contexto**: ¿De qué están hablando? ¿Cuál es el tono del chat?
2. **Estrategia**: Si debes responder a múltiples usuarios o puntos, usa múltiples bloques <MESSAGE>.

...
</THOUGHT>

<MESSAGE>
<SEND_TEXT>TRUE</SEND_TEXT>
<TEXT_CONTENT>
Tu respuesta de texto aquí. Vacío si SEND_TEXT es FALSE.
</TEXT_CONTENT>
<REPLY_TO>
ID del mensaje (MsgID) al que respondes específicamente o NULL.
</REPLY_TO>
</MESSAGE>

<!-- Puedes repetir el bloque MESSAGE si necesitas enviar otro mensaje separado -->
<MESSAGE>
...
</MESSAGE>

<REACTION>
Uno o más emojis (ej: 😂 o 🔥💀) o NULL. (Global para el último mensaje del usuario)
</REACTION>
