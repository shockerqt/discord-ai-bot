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
    const reactionRaw = extractTag(contentStr, 'REACTION');

    // Parse Messages
    const messages = [];
    const msgRegex = /<MESSAGE>([\s\S]*?)<\/MESSAGE>/gi;
    let match;
    while ((match = msgRegex.exec(contentStr)) !== null) {
        const msgBlock = match[1];
        const textContent = extractTag(msgBlock, 'TEXT_CONTENT');
        const replyToRaw = extractTag(msgBlock, 'REPLY_TO');
        const reactionRaw = extractTag(msgBlock, 'REACTION');
        const attachmentRaw = extractTag(msgBlock, 'ATTACHMENT');

        messages.push({
            send_text: !!(textContent && textContent.trim().length > 0),
            text_content: textContent || "",
            reply_to: (replyToRaw && replyToRaw.toUpperCase() !== 'NULL') ? replyToRaw : null,
            reaction: (reactionRaw && reactionRaw.toUpperCase() !== 'NULL') ? reactionRaw : null,
            attachment: (attachmentRaw && attachmentRaw.toUpperCase() !== 'NULL') ? attachmentRaw : null
        });
    }

    // Fallback: If no MESSAGE block found (legacy or error), try parsing root tags
    if (messages.length === 0) {
        const textContent = extractTag(contentStr, 'TEXT_CONTENT');
        const replyToRaw = extractTag(contentStr, 'REPLY_TO');
        const reactionRaw = extractTag(contentStr, 'REACTION');
        const attachmentRaw = extractTag(contentStr, 'ATTACHMENT');

        if (textContent || reactionRaw || attachmentRaw) {
            messages.push({
                send_text: !!(textContent && textContent.trim().length > 0),
                text_content: textContent || "",
                reply_to: (replyToRaw && replyToRaw.toUpperCase() !== 'NULL') ? replyToRaw : null,
                reaction: (reactionRaw && reactionRaw.toUpperCase() !== 'NULL') ? reactionRaw : null,
                attachment: (attachmentRaw && attachmentRaw.toUpperCase() !== 'NULL') ? attachmentRaw : null
            });
        }
    }

    return {
        thought: thought || "",
        messages: messages,
        reaction: null // Global reaction deprecated in favor of per-message
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
