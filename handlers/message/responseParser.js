/**
 * Response Parser - Parsea las respuestas XML del modelo AI
 */

/**
 * Extrae el contenido de un tag XML del string de respuesta.
 * @param {string} content - String de respuesta del AI
 * @param {string} tag - Nombre del tag a extraer
 * @returns {string|null} - Contenido del tag o null
 */
function extractTag(content, tag) {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
}

/**
 * Normaliza un valor de tag: trata "NULL" y vacío como ausencia de valor.
 */
function optional(value) {
    if (!value) return null;
    return value.toUpperCase() === 'NULL' ? null : value;
}

/**
 * Construye un objeto de mensaje a partir de los tags de un bloque.
 */
function buildMessage({ textContent, reaction, attachment }) {
    const text = textContent || '';
    return {
        send_text: text.trim().length > 0,
        text_content: text,
        reply_to: null, // lo decide el handler: siempre se responde a la mención
        reaction: optional(reaction),
        attachment: optional(attachment)
    };
}

/**
 * Parsea la respuesta del AI y extrae los mensajes a enviar.
 *
 * Al bot solo se le invoca por mención, así que una mención sin respuesta es un fallo.
 * Por eso, si el modelo no respeta el formato XML, se usa su texto plano tal cual.
 *
 * @param {string} rawContent - Respuesta raw del AI
 * @returns {{thought: string, messages: Array<Object>}}
 */
export function parseAIResponse(rawContent) {
    const contentStr = cleanContent(rawContent || '');
    const thought = extractTag(contentStr, 'THOUGHT');
    const messages = [];

    // 1. Bloques <MESSAGE> (formato esperado)
    const msgRegex = /<MESSAGE>([\s\S]*?)<\/MESSAGE>/gi;
    let match;
    while ((match = msgRegex.exec(contentStr)) !== null) {
        const block = match[1];
        messages.push(buildMessage({
            textContent: extractTag(block, 'TEXT_CONTENT'),
            reaction: extractTag(block, 'REACTION'),
            attachment: extractTag(block, 'ATTACHMENT')
        }));
    }

    // 2. Tags sueltos sin envoltura <MESSAGE>
    if (messages.length === 0) {
        const textContent = extractTag(contentStr, 'TEXT_CONTENT');
        const reaction = extractTag(contentStr, 'REACTION');
        const attachment = extractTag(contentStr, 'ATTACHMENT');

        if (textContent || reaction || attachment) {
            messages.push(buildMessage({ textContent, reaction, attachment }));
        }
    }

    // 3. Texto plano: el modelo ignoró el formato, pero hay que responder igual
    if (messages.length === 0) {
        const plainText = stripKnownTags(contentStr);
        if (plainText) {
            console.warn('[Parser] El modelo no usó el formato XML. Enviando su texto plano.');
            messages.push(buildMessage({ textContent: plainText }));
        }
    }

    return { thought: thought || '', messages };
}

/**
 * Quita los tags conocidos (y su contenido cuando no es la respuesta) del texto.
 */
function stripKnownTags(content) {
    return content
        .replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, '')
        .replace(/<REPLY_TO>[\s\S]*?<\/REPLY_TO>/gi, '')
        .replace(/<\/?(MESSAGE|TEXT_CONTENT|REACTION|ATTACHMENT)>/gi, '')
        .trim();
}

/**
 * Quita la envoltura ```xml ... ``` si el modelo metió todo el XML en un code block.
 *
 * Importante: solo se quita el bloque externo. Las respuestas informativas suelen
 * contener bloques de código propios (```js, ```bash) que deben sobrevivir intactos.
 *
 * @param {string} content - Contenido raw
 * @returns {string} - Contenido limpio
 */
export function cleanContent(content) {
    const trimmed = (content || '').trim();
    const outerFence = trimmed.match(/^```(?:xml)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i);
    return outerFence ? outerFence[1].trim() : trimmed;
}
