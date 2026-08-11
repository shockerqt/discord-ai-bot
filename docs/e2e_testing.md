# 🧪 Framework de Testing y Simulador

Dos herramientas para trabajar el comportamiento del bot sin desplegarlo en Discord.

---

## 1. Suite automatizada — `npm run test:e2e`

Corre **sin credenciales ni red**. El proveedor de IA se reemplaza en caliente por un doble de
prueba (`ChatProviderFactory.createProvider`), y Discord se reemplaza por un canal simulado que
implementa `messages.fetch`, `send`, `sendTyping` y `react`.

Archivo: `tests/e2e.js`. Salida: una línea por prueba y código de salida distinto de cero si algo
falla (apto para CI).

### Qué cubre

| Grupo | Verifica |
|-------|----------|
| Detección de invocación | Responde a `@Lumi`; ignora mensajes normales, `@everyone` y menciones de rol |
| Contexto | Orden cronológico, agrupación por rol, límite de mensajes, mensaje citado, limpieza de la mención, detección de audio, y que sobreviva a un canal sin permiso de leer historial |
| Parseo | Formato XML, bloques de código internos intactos, fallback a texto plano, `NULL` como ausencia de valor |
| División de mensajes | Respuestas >2000 chars: ningún chunk excede el límite, los ``` quedan balanceados y no se pierde contenido |
| Pipeline completo | Responde citando la mención; ejecuta una tool y vuelve a llamar al modelo; cambia de modelo ante un 429; no envía nada si el modelo falla del todo |

### Agregar una prueba

```js
await test('descripción', async () => {
    const channel = createMockChannel({ history: [ /* mensajes previos */ ] });
    const trigger = createMockMessage({ content: '<@lumi-bot-id> hola', mentionsBot: true, channel });
    // ...
    assert.equal(channel.sent.length, 1);
});
```

Para controlar lo que "responde" la IA, usa `createFakeProvider([...])`: cada elemento es una
respuesta consecutiva del modelo, con `content` y opcionalmente `toolCalls`.

---

## 2. Simulador interactivo — `npm run simulate`

Consola que ejecuta el pipeline real contra la **IA real** (usa las credenciales de `.env`), sobre
un canal simulado en memoria. Útil para evaluar prompts, tono y herramientas.

Archivo: `scripts/simulate.js`.

| Entrada | Efecto |
|---------|--------|
| `texto normal` | Mencionas a Lumi: responde |
| `nombre: texto` | Otro usuario escribe. Solo contexto, Lumi **no** responde |
| `/historial` | Muestra el canal simulado |
| `/reset` | Vacía el canal simulado |
| `/config` | Muestra la configuración activa |
| `exit` | Salir |

Los adjuntos de debug (system prompt, contexto enviado, traza de tools) se imprimen en la terminal,
así que `DEFAULT_DEBUG_MODE=full` en `.env` sirve para ver exactamente qué recibe el modelo.

### Flujo típico

```
> Ana: alguien sabe en qué puerto corre esto?
(contexto agregado como Ana, Lumi no responde)

> en qué puerto corre?
[Lumi] El puerto por defecto es 3000, configurable con la variable PORT.
```
