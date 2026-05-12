import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
