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
 * Parsea la respuesta completa del AI y extrae todos los campos.
 * @param {string} rawContent - Respuesta raw del AI
 * @returns {Object} - Objeto parseado con thought, send_text, text_content, reply_to, reaction
 */
export function parseAIResponse(rawContent) {
    // Strip code blocks if AI wrapped it in ```xml ... ```
    const contentStr = rawContent.replace(/```xml/g, '').replace(/```/g, '').trim();

    const thought = extractTag(contentStr, 'THOUGHT');
    const sendTextRaw = extractTag(contentStr, 'SEND_TEXT');
    const textContent = extractTag(contentStr, 'TEXT_CONTENT');
    const replyToRaw = extractTag(contentStr, 'REPLY_TO');
    const reactionRaw = extractTag(contentStr, 'REACTION');

    return {
        thought: thought || "",
        send_text: sendTextRaw && sendTextRaw.toUpperCase().includes('TRUE'),
        text_content: textContent || "",
        reply_to: (replyToRaw && replyToRaw.toUpperCase() !== 'NULL') ? replyToRaw : null,
        reaction: (reactionRaw && reactionRaw.toUpperCase() !== 'NULL') ? reactionRaw : null
    };
}

/**
 * Limpia el contenido raw de code blocks.
 * @param {string} content - Contenido raw
 * @returns {string} - Contenido limpio
 */
export function cleanContent(content) {
    return content.replace(/```xml/g, '').replace(/```/g, '').trim();
}
