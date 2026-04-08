# 🎙️ Voice & Audio

La intención actual es **NO utilizar Gemini Flash Native Audio** para producción, y apostar por una versión controlada interconectando servicios. Todo aquí se encuentra **APARCADO**.

## 🛑 Parked / Future
- [ ] **Pipeline Manual Completo (STT -> LLM -> TTS):** Capturar el stream en `voiceHandler`, enviarlo a un STT (e.g. Whisper API), procesar el texto con Mistral y luego pasarlo a TTS (e.g. ElevenLabs) para regresarlo al canal.
- [ ] **Archivo de Gemini:** Documentar `genAiVoiceService.js` como experimento congelado por posible uso futuro.
- [ ] Sistema de colas de voz y priorización de hablantes.
