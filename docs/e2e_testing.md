# Framework de Pruebas E2E y Simulador de Consola CLI 🧪

Para facilitar el desarrollo continuo y garantizar que las características principales de Lumi (como el agente de decisiones, el agente de personalidad, las herramientas de GIFs y la evolución de personalidad) funcionen de forma correcta sin requerir levantar el bot en Discord en vivo, hemos diseñado un completo **Framework de Pruebas End-to-End (E2E)** y un **Simulador Interactivo de Consola CLI**.

---

## 🧪 Pruebas Automatizadas E2E

La suite de pruebas automatizadas ejecuta flujos reales simulando la recepción de mensajes en el pipeline pasivo, verificando la toma de decisiones del bot, el control de cooldowns y la persistencia de la evolución.

### 🏃 Cómo Ejecutar las Pruebas

Para correr la suite de pruebas completa, ejecuta en la terminal de tu proyecto:

```bash
npm run test:e2e
```

### 📋 Pruebas Incluidas

La suite verifica los siguientes cuatro escenarios críticos:

1.  **Test 1: Pipeline Pasivo - Mención Directa (Bypass de personalidad)**
    *   **Objetivo:** Validar que si un usuario menciona directamente a Lumi (`@lumi` o incluye `lumi` en el texto), el bot se activa inmediatamente ignorando cualquier otra regla de gating pasivo.
    *   **Verificación:** Comprueba que se genera y envía una respuesta de texto válida al canal.
2.  **Test 2: Servicio de Evolución - Respetar Cooldown**
    *   **Objetivo:** Asegurar que la evolución de personalidad respeta el cooldown establecido en memoria (mínimo de 6 mensajes en el canal).
    *   **Verificación:** Valida que al evaluar un historial con pocos mensajes (`force: false`), la IA decide no evaluar y devuelve `{ evaluated: false }` para ahorrar tokens y costos.
3.  **Test 3: Servicio de Evolución - Disparar evolución con fuerza (`force: true`)**
    *   **Objetivo:** Confirmar que el flujo completo de evolución con la API de IA funciona perfectamente de punta a punta conectándose con la API real.
    *   **Verificación:** Fuerza una evaluación (`force: true`) usando un historial simulado. Se valida la llamada real a la IA, la extracción del formato XML, la actualización en caliente de `config.xml` y el envío del mensaje de anuncio. (Cuenta con bypass inteligente si la cuota de la API está agotada).
4.  **Test 4: Servicio de Evolución - Canalización Offline Completa (Mock AI & XML Parser)**
    *   **Objetivo:** Garantizar que todo el pipeline local de evolución (evaluación de cooldown, inyección de prompts, parseo exacto de etiquetas XML, almacenamiento persistente en `config.xml` y envío de feedback estilizado) funcione al 100% de forma robusta e independiente de la red o límites de cuota de la API de IA.
    *   **Verificación:** Mockea la respuesta del motor de IA para inyectar una estructura XML controlada, ejecuta el ciclo completo de evolución y realiza aserciones exactas sobre los datos guardados en disco y la notificación enviada al canal simulado.

---

## 🌙 Simulador de Chat Interactivo CLI

El Simulador CLI es una consola interactiva sumamente visual y potente. Permite a los desarrolladores chatear localmente con Lumi, fingiendo ser uno o varios usuarios a la vez, interactuar con herramientas, y observar la toma de decisiones y las trazas del sistema en tiempo real con colores vibrantes en la consola.

### 🏃 Cómo Iniciar el Simulador

Ejecuta el siguiente comando en la raíz del proyecto:

```bash
npm run simulate
```

### 🎮 Comandos Especiales Disponibles en el Simulador

Una vez dentro de la consola del simulador, puedes usar los siguientes comandos especiales para gestionar el estado de la conversación o inspeccionar el bot:

*   `exit` o `salir`: Cierra la interfaz del simulador y detiene el proceso de forma limpia.
*   `/reset`: Reinicia el historial en memoria para el canal simulado actual. Ideal para empezar una conversación desde cero.
*   `/config`: Despliega de forma visual las reglas dinámicas de personalidad guardadas actualmente en `config.xml`.

### 👥 Simular Múltiples Usuarios

Por defecto, la consola te asignará el usuario `UsuarioPrueba`. Sin embargo, para testear dinámicas complejas o disparar la evolución de personalidad con apodos cruzados o referencias de terceros, puedes escribir el nombre del usuario seguido de dos puntos y el mensaje.

*   **Ejemplo de uso:**
    ```text
    Tú: yue: Lumi, de ahora en adelante te llamaremos la robot chiquita y tonta, ese será tu nuevo apodo en el server
    ```
    *(El simulador procesará el mensaje como si hubiese sido enviado por el usuario **yue**).*

---

## 🎨 Trazas Visuales y Depuración

Una de las mayores bondades del simulador es que intercepta los archivos de depuración que el bot escribe tras bambalinas y los imprime formateados con colores en consola:

*   `[🤖 INPUT HISTORY]` (Amarillo): Muestra el historial completo de mensajes tal como se le enviará al modelo para generar la respuesta.
*   `[🧠 AGENTE DE DECISIONES]` (Azul): Muestra el razonamiento y veredicto del Decision Agent sobre si debe ignorar o responder al mensaje del usuario en base a RNG, contexto o mención directa.
*   `[🛠️ TRACE DE PROCESAMIENTO]` (Cian): Muestra el pensamiento interno `<THOUGHT>` de Lumi, las llamadas a la herramienta de búsqueda de GIFs (`gif_tool`) y su respuesta cruda.
*   `[Lumi]` (Magenta): La respuesta final formateada que Lumi le responde al usuario en el chat.
*   `[✨ Evolución de Personalidad]` (Estilo Arcoíris/Colores): Muestra el proceso de evolución cuando se gatilla, indicando el razonamiento interno del Evolution Agent, si decide evolucionar, las nuevas instrucciones y el resumen que se publica.

Gracias a esta suite de herramientas, el desarrollo del comportamiento conversacional de Lumi es sumamente rápido, seguro y 100% verificable localmente.
