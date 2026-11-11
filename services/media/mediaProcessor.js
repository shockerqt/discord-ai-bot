import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Guardrails de tamaño para adjuntos de imagen (10 MB)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE;

// MIME types de imagen soportados por Gemini Flash multimodal
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
]);
export const SUPPORTED_IMAGE_MIMES = SUPPORTED_IMAGE_MIME_TYPES;

/**
 * Normaliza el tipo MIME de una imagen.
 * Resuelve image/jpg -> image/jpeg y deduce por extensión si no hay contentType o es genérico.
 * @param {string} [contentType]
 * @param {string} [filename]
 * @returns {string} MIME type normalizado o cadena vacía si no se reconoce
 */
export function normalizeImageMimeType(contentType, filename = '') {
    let mime = (contentType || '').split(';')[0].trim().toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (!mime || mime === 'application/octet-stream') {
        const ext = (filename || '').split('.').pop()?.toLowerCase();
        if (ext === 'png') mime = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
        else if (ext === 'webp') mime = 'image/webp';
        else if (ext === 'gif') mime = 'image/gif';
    }
    return mime;
}

/**
 * Normaliza un objeto de adjunto de imagen para su uso en adaptadores de IA.
 * @param {Object} attachment - Adjunto de Discord ({ url, contentType, mimeType, name, filename, size, data, buffer })
 * @returns {Object|null}
 */
export function normalizeImageAttachment(attachment) {
    if (!attachment) return null;
    const rawMime = attachment.contentType || attachment.mimeType || '';
    const filename = attachment.name || attachment.filename || 'image';
    const mimeType = normalizeImageMimeType(rawMime, filename);

    const normalized = {
        type: 'image',
        url: attachment.url || '',
        mimeType: mimeType || rawMime,
        filename,
        size: attachment.size ?? 0,
    };

    if (attachment.data) {
        normalized.data = attachment.data;
    }
    if (attachment.buffer) {
        normalized.buffer = attachment.buffer;
    }

    return normalized;
}

/**
 * Valida un adjunto de imagen aplicando las guardas de tamaño y formato permitido.
 * @param {Object} attachment - Adjunto de Discord
 * @returns {{ valid: boolean, media?: Object, error?: string, reason?: 'oversized' | 'unsupported' | 'missing' }}
 */
export function validateImageAttachment(attachment) {
    if (!attachment) {
        return {
            valid: false,
            reason: 'missing',
            error: 'No se proporcionó ningún archivo adjunto.'
        };
    }

    const size = attachment.size ?? 0;
    if (size > MAX_IMAGE_SIZE) {
        return {
            valid: false,
            reason: 'oversized',
            error: 'El archivo adjunto supera el tamaño máximo permitido de 10 MB.'
        };
    }

    const rawMime = attachment.contentType || attachment.mimeType || '';
    const filename = attachment.name || attachment.filename || '';
    const mimeType = normalizeImageMimeType(rawMime, filename);

    if (!mimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
        return {
            valid: false,
            reason: 'unsupported',
            error: `El formato del archivo adjunto no es compatible (${mimeType || 'desconocido'}). Formatos soportados: PNG, JPEG, WEBP, GIF.`
        };
    }

    return {
        valid: true,
        media: normalizeImageAttachment(attachment)
    };
}

/**
 * Alias de compatibilidad para validar y normalizar.
 */
export function validateAndNormalizeImage(attachment) {
    return validateImageAttachment(attachment);
}

/**
 * Procesa un video de YouTube usando Gemini para extraer un resumen y transcripción.
 * @param {string} url - URL del video de YouTube
 * @returns {Promise<string>} - Resumen textual del video
 */
export async function summarizeYouTubeVideo(url) {
    console.log(`[MediaProcessor] Starting background summary for: ${url}`);
    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[MediaProcessor] Attempt ${attempt} for: ${url}`);
            const response = await genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [
                    { role: 'user', parts: [
                        { text: "Por favor, analiza este video y extrae una transcripción detallada de los puntos clave y un resumen estructurado. Sé preciso y responde en español." },
                        { fileData: { fileUri: url, mimeType: 'video/mp4' } }
                    ]}
                ],
                config: {
                    systemInstruction: "Eres un asistente experto en análisis de video. Tu tarea es ver el video proporcionado y extraer una transcripción detallada de los puntos clave y un resumen estructurado. Responde en español."
                }
            });

            const text = response.text || '';
            
            console.log(`[MediaProcessor] Summary completed for: ${url} (length: ${text.length})`);
            return text;
        } catch (error) {
            const status = error?.status || error?.httpStatus;
            if ((status === 500 || status === 503 || error?.message?.includes('"code":503') || error?.message?.includes('"code":500')) && attempt < MAX_RETRIES) {
                const delay = attempt * 3000; // 3s, 6s
                console.warn(`[MediaProcessor] ${status || 503} error on attempt ${attempt}, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            
            console.error(`[MediaProcessor] Error summarizing video ${url}:`, error.message);
            throw error;
        }
    }
}
