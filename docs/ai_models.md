# Modelos de IA disponibles

Guía de referencia para cambiar el proveedor y modelo que usa el bot.

---

## Arquitectura de providers

El bot usa dos agentes con modelos independientes:

| Agente | Rol | Config key |
|--------|-----|------------|
| **Lumi** | Agente principal que genera respuestas | `<model>` |
| **Decision Bot** | Decide si Lumi debe responder o ignorar | `<decision_model>` |

El provider se configura con `<provider>` y aplica a **ambos** agentes.  
El provider soportado actualmente es **gemini** (recomendado) y **groq** (fallback).

---

## Cómo cambiar el modelo

### Opción 1: Editar `config.xml` directamente

```xml
<config>
  <provider>gemini</provider>               <!-- gemini | groq | mistral -->
  <model>gemini-2.5-flash</model>           <!-- Modelo de Lumi -->
  <decision_model>gemini-2.5-flash-lite</decision_model> <!-- Modelo del Decision Bot -->
  <temperature>0.7</temperature>
  ...
</config>
```

Luego reiniciar el bot (`pm2 restart zavier-sama`).

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

#### Modelos recomendados para **Lumi** (`<model>`)

| Modelo | Velocidad | Calidad | Multimodal | Notas |
|--------|-----------|---------|------------|-------|
| `gemini-2.5-flash` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ Audio, imagen | **Recomendado producción** |
| `gemini-2.5-flash-lite` | ⚡⚡⚡⚡ | ⭐⭐⭐ | ✅ | Más barato, menor calidad |
| `gemini-2.5-pro` | ⚡⚡ | ⭐⭐⭐⭐⭐ | ✅ | Máxima calidad, más lento |
| `gemini-2.0-flash` | ⚡⚡⚡ | ⭐⭐⭐⭐ | ✅ | Estable, sin preview |

> **Modelos experimentales** (pueden no estar disponibles):
> - `gemini-3.1-flash-lite-preview` — preview, cuota muy limitada
> - `gemini-3-flash-preview` — preview

#### Modelos recomendados para **Decision Bot** (`<decision_model>`)

El decision bot solo necesita clasificar RESPONDER/IGNORAR — priorizar velocidad y costo:

| Modelo | Velocidad | Notas |
|--------|-----------|-------|
| `gemini-2.5-flash-lite` | ⚡⚡⚡⚡ | **Recomendado** — Ideal para decisiones binarias |
| `gemini-2.5-flash` | ⚡⚡⚡ | Buena opción si se quiere más razonamiento |
| `gemini-2.0-flash-lite` | ⚡⚡⚡⚡ | Alternativa más estable |

---

### 🟩 Groq (Llama) — Provider: `groq`

**API Key requerida:** `GROQ_API_KEY`

Groq es extremadamente rápido y tiene un free tier generoso. No soporta multimodal (audio, imágenes).

#### Modelos recomendados para **Lumi** (`<model>`)

| Modelo | Velocidad | Calidad | Notas |
|--------|-----------|---------|-------|
| `llama-3.3-70b-versatile` | ⚡⚡⚡ | ⭐⭐⭐⭐ | **Recomendado** — Mejor balance |
| `llama-3.1-70b-versatile` | ⚡⚡⚡ | ⭐⭐⭐⭐ | Alternativa estable |
| `llama3-70b-8192` | ⚡⚡⚡ | ⭐⭐⭐ | Contexto más corto |

#### Modelos recomendados para **Decision Bot** (`<decision_model>`)

| Modelo | Velocidad | Notas |
|--------|-----------|-------|
| `llama-3.1-8b-instant` | ⚡⚡⚡⚡⚡ | **Recomendado** — Ultra rápido, ideal para decisiones |
| `llama3-8b-8192` | ⚡⚡⚡⚡⚡ | Alternativa |

---

### 🟧 Mistral — Provider: `mistral`

**API Key requerida:** `MISTRAL_API_KEY`

Opción legacy, menos mantenida en el bot. No recomendada para uso principal.

---

## Configuraciones rápidas recomendadas

### Configuración actual (producción) — Gemini

```xml
<provider>gemini</provider>
<model>gemini-2.5-flash</model>
<decision_model>gemini-2.5-flash-lite</decision_model>
```

### Fallback sin cuota Gemini — Groq

```xml
<provider>groq</provider>
<model>llama-3.3-70b-versatile</model>
<decision_model>llama-3.1-8b-instant</decision_model>
```

### Máxima calidad — Gemini Pro

```xml
<provider>gemini</provider>
<model>gemini-2.5-pro</model>
<decision_model>gemini-2.5-flash-lite</decision_model>
```

---

## Fallback automático

El bot tiene cadenas de fallback hardcodeadas en el código para cuando un modelo falla (error 429, 500, etc.):

### Lumi (`callLumiAgent`)
```
gemini-3.1-flash-lite-preview → gemini-3-flash-preview → gemini-2.5-flash → gemini-2.5-flash-lite
```

### Decision Bot (`callDecisionAgent`)
```
[modelo configurado] → gemini-2.5-flash-lite → gemini-2.5-flash → gemma-3-27b-it
```

> Para cambiar estas cadenas, editar `handlers/messageHandler.js`:
> - `LUMI_FALLBACK_CHAIN` (línea ~254)
> - `FALLBACK_MODELS` en `callDecisionAgent` (línea ~162)

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

En producción estas viven en `/opt/zavier-sama/.env` en el servidor OCI.

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
| [`handlers/messageHandler.js`](../handlers/messageHandler.js) | Define cadenas de fallback por agente |
