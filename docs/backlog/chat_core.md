# 💬 Chat & Core

Lista de mejoras iterativas para el flujo principal de chat y el cerebro del bot. **(Actualmente la mayor prioridad)**

## 🚀 TODO (To-Do)
- [ ] **Refinamiento de prompts**: iterar `prompts/assistant.md` según la calidad de las respuestas reales.
- [ ] **Evaluar el tamaño de contexto**: medir si 20 mensajes es el punto justo entre costo y utilidad.
- [ ] **Hilos**: decidir si en un hilo conviene leer el hilo completo en vez de los últimos N mensajes.

## 🔄 In Progress
- Ninguno actualmente.

## ✅ Done
- Implementación de `/configure` para personalidad y temperatura.
- **[Migración a Groq]** Implementación de nuevo SDK de LLM y `GroqChatAdapter.js`.
- **[Bot informacional]** El bot pasó a responder **solo por mención**. Se eliminaron el decision
  agent, el sistema de modos con RNG, el `messageStore` persistente, la cola por canal, el feedback
  por reacciones 👍/👎 y la evolución dinámica de personalidad. El contexto ahora se lee desde
  Discord en el momento de la mención (`utils/contextBuilder.js`).
- **[Personas]** `/configure persona` alterna entre asistente informativo neutro y el personaje Lumi.
- **[Respuestas largas]** Se dividen en varios mensajes en vez de truncarse a 2000 caracteres.
