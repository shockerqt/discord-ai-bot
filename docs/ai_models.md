# Modelos de IA disponibles

Guía de referencia para cambiar el proveedor y modelo que usa el bot.

---

## Arquitectura de providers

El bot usa **un solo agente**: responde cuando lo mencionan. El modelo se configura con `<model>` y
el proveedor con `<provider>`.

| Config key | Rol |
|------------|-----|
| `<provider>` | `gemini` (recomendado), `groq` (fallback) o `mistral` (legacy) |
| `<model>` | Modelo que genera las respuestas |

> Antes existía un segundo agente (`<decision_model>`) que decidía si responder o ignorar cada
> mensaje del canal. Ya no existe: la mención es la decisión, así que esa clave se eliminó.

---

## Cómo cambiar el modelo

### Opción 1: Editar `config.xml` directamente

```xml
<config>
  <provider>gemini</provider>               <!-- gemini | groq | mistral -->
  <model>gemini-3.7-flash</model>           <!-- Modelo que responde -->
  <temperature>0.7</temperature>
  <persona>assistant</persona>              <!-- assistant | lumi -->
  <context_limit>20</context_limit>         <!-- Mensajes previos leídos como contexto -->
  ...
</config>
```

`configStore` reescribe el archivo en cada cambio, así que también se puede editar desde
`/configure` o el dashboard sin reiniciar. Si editas el archivo a mano, reinicia el bot
(`sudo systemctl restart lumi-bot.service`).

### Opción 2: Variables de entorno

```env
CHAT_PROVIDER=gemini   # Solo si no hay config.xml
```

---

## Modelos disponibles

### 🟦 Gemini (Google) — Provider: `gemini`

**API Key requerida:** `GOOGLE_API_KEY`

> ⚠️ Los modelos con Preview/Experimental pueden tener cuotas de RPM bajas en el free tier.  
> Si hay errores 429, el bot tiene fallback automático al siguiente modelo de la lista.

#### Modelos recomendados (`<model>`)

| Modelo | Velocidad | Calidad | Multimodal | Notas |
|--------|-----------|---------|------------|-------|
| `gemini-3.7-flash` | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ Texto, imagen, video, audio y PDF | **Recomendado producción** |
| `gemini-3.1-flash-lite` | ⚡⚡⚡⚡ | ⭐⭐⭐ | ✅ | Respaldo eficiente |
| `gemini-2.5-flash` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ Audio, imagen | Compatibilidad anterior |
| `gemini-2.5-flash-lite` | ⚡⚡⚡⚡ | ⭐⭐⭐ | ✅ | Más barato, menor calidad |
| `gemini-2.5-pro` | ⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ | Máxima calidad, más lento |
| `gemini-2.0-flash` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ | Estable, sin preview |

> **Modelos experimentales** (pueden no estar disponibles):
> - `gemini-3.1-flash-lite-preview` — preview, cuota muy limitada
> - `gemini-3-flash-preview` — preview

---

### 🟩 Groq (Llama) — Provider: `groq`

**API Key requerida:** `GROQ_API_KEY`

Groq es extremadamente rápido y tiene un free tier generoso. No soporta multimodal (audio, imágenes).

#### Modelos recomendados (`<model>`)

| Modelo | Velocidad | Calidad | Notas |
|--------|-----------|---------|-------|
| `llama-3.3-70b-versatile` | ⚡⚡⚡ | ⭐⭐⭐⭐ | **Recomendado** — Mejor balance |
| `llama-3.1-70b-versatile` | ⚡⚡⚡ | ⭐⭐⭐⭐ | Alternativa estable |
| `llama3-70b-8192` | ⚡⚡⚡ | ⭐⭐⭐ | Contexto más corto |

---

### 🟧 Mistral — Provider: `mistral`

**API Key requerida:** `MISTRAL_API_KEY`

Opción legacy, menos mantenida en el bot. No recomendada para uso principal.

---

## Configuraciones rápidas recomendadas

### Configuración actual (producción) — Gemini

```xml
<provider>gemini</provider>
<model>gemini-3.7-flash</model>
```

### Fallback sin cuota Gemini — Groq

```xml
<provider>groq</provider>
<model>llama-3.3-70b-versatile</model>
```

### Máxima calidad — Gemini Pro

```xml
<provider>gemini</provider>
<model>gemini-2.5-pro</model>
```

---

## Fallback automático

Si el modelo configurado devuelve 429 (cuota agotada) o 503 (saturado), el agente reintenta la
misma iteración con el siguiente modelo de la cadena:

```
[modelo configurado] → gemini-3.1-flash-lite → gemini-2.5-flash → gemini-2.5-flash-lite
```

La cadena está en `FALLBACK_MODELS`, al inicio de `handlers/mentionHandler.js`. El fallback ocurre
dentro del mismo proveedor: si quieres saltar de proveedor, cambia `<provider>`.

---

## Variables de entorno requeridas

```env
# Google Gemini
GOOGLE_API_KEY=...

# Groq (Llama)
GROQ_API_KEY=...

# Mistral (opcional, legacy)
MISTRAL_API_KEY=...
```

En producción estas viven en `/opt/lumi-bot/.env` en el servidor OCI.

---

## Archivos relevantes

| Archivo | Rol |
|---------|-----|
| [`config.xml`](../config.xml) | Configuración activa del bot (provider, modelos, personalidad) |
| [`config.sample.xml`](../config.sample.xml) | Template de referencia |
| [`services/ai/ChatProviderFactory.js`](../services/ai/ChatProviderFactory.js) | Factory que instancia el provider correcto |
| [`services/ai/GeminiChatAdapter.js`](../services/ai/GeminiChatAdapter.js) | Adapter para Gemini (soporta audio, multimodal) |
| [`services/ai/GroqChatAdapter.js`](../services/ai/GroqChatAdapter.js) | Adapter para Groq/Llama |
| [`utils/configStore.js`](../utils/configStore.js) | Lee/escribe `config.xml`, expone getters/setters |
| [`handlers/mentionHandler.js`](../handlers/mentionHandler.js) | Pipeline de respuesta y cadena de fallback de modelos |
