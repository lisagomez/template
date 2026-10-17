# Propuesta de CDC: centro de mando por voz (goal `centro-de-mando-voz`)

> **Estado (2026-10-16).** Los puntos 1 y 2 (nivel `voz` y prompt del cerebro) los firmó el laboratorio: la versión
> firmada es la entrada «2026-10-16 — centro de mando por voz: clase `cerebro-de-voz` en un nivel nuevo `voz` y
> prompt del cerebro» de `.claude/gobernanza/BITACORA-CDC.md`, y entraron en `main` por el #268. Los puntos 3 a 6
> quedaron fuera de esa firma a propósito y van cada uno en su propia entrada: el 3, el 5 y el 6 se firmaron el mismo
> día y entraron por el #269; el 4 (Silero en el navegador) tiene la suya, con la medición con ruido de sala que pedía
> (`centro-de-mando-voz-medicion/detector.md`). **Este archivo ya no se borra**: las entradas firmadas lo citan.
> Abajo sigue la propuesta tal como se redactó.
>
> **Propuesta, no entrada de bitácora.** Se redacta fuera de `.claude/gobernanza/BITACORA-CDC.md` (una entrada sin
> firma tumba `verify:gobernanza`, aprendizaje del 2026-09-20). La firma la escribe el laboratorio.

---

### 2026-10-16 — centro de mando por voz: clase `cerebro-de-voz` en un nivel nuevo `voz`, prompt del cerebro, y cuatro cambios propuestos sin aplicar — radio: routing (C8), producto (paquete `@tu-scope/bucle-voz`, app `/centro-de-mando`) y skill global de dictado

- **Cambio**:
  1. **`.claude/routing-modelos.json`: nivel nuevo `voz` y clase `cerebro-de-voz` → `voz`.** Modelo nuevo en el
     catálogo: **`anthropic/claude-haiku-5.5-20261007`** (identificador CON fecha: el pineo más estricto que acepta
     OpenRouter; comprobado con una llamada). Precio consultado el 2026-10-16 en `https://openrouter.ai/api/v1/models`:
     US$0.10 / 0.50 / 0.01 por millón (entrada / salida / caché). Alternativa abierta declarada (la misma del nivel
     `ligero`, DeepSeek V4 Flash), **con su primer token sin medir en voz**. `src/lib/ai/routing.ts` gana `'voz'` en
     el tipo `Nivel`.

     ```diff
     @@ "niveles"
     +    "voz": {
     +      "para": "conversacion por voz en tiempo real (centro de mando): lo que la persona espera es el PRIMER token; …",
     +      "modelo": "anthropic/claude-haiku-5.5-20261007",
     +      "precio": { "entrada": 0.1, "salida": 0.5, "lectura_cache": 0.01 },
     +      "consultado": "2026-10-16",
     +      "medicion": { "primer_token_p50_ms": { "anthropic/claude-haiku-5.5-20261007": 752, "anthropic/claude-haiku-4.5": 956, "google/gemini-2.5-flash-lite": 410 }, … },
     +      "alternativa_abierta": { "modelo": "deepseek/deepseek-v4-flash-0731", … },
     +      "indices": { "coding": null, "agentic": null, "intelligence": 43.4 }
     +    },
     @@ "tareas"
     +    "cerebro-de-voz": "voz",
     ```

     **Por qué un nivel y no `ligero`**: en voz manda el primer token, no el precio. Medido el 2026-10-16 (5 preguntas
     cortas en español por modelo, razonamiento apagado, desde esta máquina): haiku-5.5 **752 ms** p50, haiku-4.5 (el
     de `ligero`) **956 ms** y 10 veces más caro; gemini-2.5-flash-lite 410 ms pero 2 de 5 llamadas a ~1 s y una
     respuesta equivocada. Meter la clase en `ligero` habría pagado 200 ms más por turno y 10 veces el precio; cambiar
     el modelo de `ligero` habría movido seis clases que nadie midió con él. Gasto de esa medición: US$0.0026.
  2. **Prompt del cerebro** `src/features/centro-de-mando/services/servidor/prompt-cerebro.ts`, versión
     `cerebro-voz-3 (2026-10-16)` (sha256 del archivo `7f3d27e404386bd8…`), con `max_tokens` 160. Ocho reglas: es la voz de un
     centro de mando en México y habla por un altavoz; **40 palabras como máximo, en dos o tres frases**; **la primera
     frase va sola y es muy corta** (dos a seis palabras, con dos ejemplos); si piden detalle, lo esencial y ofrecer
     seguir; sin markdown, listas, emojis ni símbolos; **no tiene herramientas ni datos del negocio y no inventa
     cifras, nombres ni citas**; **no ejecuta acciones** (agendar, enviar, borrar, pagar → «este centro de mando solo
     lee»); si su turno anterior termina en «[interrumpido]», no lo repite. La versión viaja en
     `GET /api/centro-de-mando/estado`.

     **Cómo se eligió (medido, no a ojo)**: la primera frase es la que se sintetiza y suena primero, así que su largo
     es latencia. Tres redacciones contra el modelo pineado, 4 preguntas cada una (US$0.00087):

     | Redacción | Primer token p50 | Primera frase p50 | Palabras p50 |
     |---|---|---|---|
     | v2 «empieza con una frase corta, de seis palabras como mucho» | 912 ms | 60 caracteres | 46 |
     | **v3 (esta)**: 40 palabras, primera frase sola con ejemplos | **783 ms** | **24 caracteres** | **42** |
     | v4: reglas numeradas y un ejemplo de forma | 774 ms | 60 caracteres | 43 |

     La v1 (el primer borrador, una a tres frases) daba respuestas de 4-5 frases y una se cortó por el tope a media
     frase. La v3 no lo garantiza (es un modelo): lo que el código sí garantiza es el separador (primer trozo a los 70
     caracteres como mucho) y el tope de tokens.
  3. **Sin aplicar — skill GLOBAL de dictado** (`~/.claude/skills/dictado/SKILL.md`), contradicción sobre el motor en
     vivo: la línea 44 dice que desde el 2026-09-21 los defectos «son Parakeet con faster-whisper:small de respaldo»,
     y la línea 67 que «Parakeet oía inglés en frases cortas; **por eso el motor en vivo es faster-whisper**». Manda la
     44 (es lo que resuelve `ajustes.json` hoy: el banco no fija `motor`, así que es `parakeet`). Propuesta para la 67:

     ```diff
     -- **2026-09-16 · Parakeet oía inglés** en frases cortas; por eso el motor en vivo es faster-whisper.
     +- **2026-09-16 · Parakeet oía inglés** en frases cortas; ese día el motor en vivo pasó a faster-whisper, y desde
     +  el 2026-09-21 es Parakeet con faster-whisper:small de RESPALDO, que repite en español solo lo que oyó en otro
     +  idioma (ver arriba). El centro de mando, que no puede esperar 1,7 s del respaldo, ancla el idioma con una frase
     +  portadora (`src/features/centro-de-mando/services/servidor/transcribe.ts`).
     ```
  4. **Sin aplicar — Silero en el navegador** (`onnxruntime-web` + `creaModeloSilero` de `@tu-scope/voz/browser`)
     como detector del HUD en vez de la energía calibrada. Hoy no hace falta para lo medido (micrófono falso y voces
     sintéticas: la energía calibrada y la puerta de eco dan los números de abajo), pero en una sala con ruido la
     energía falla y Silero no. Activarlo cambia qué decide «hay voz» y pide: fijar `onnxruntime-web` exacto (1.29.0,
     el de `voz` en `RUNTIMES`), servir los `.wasm` y el `.onnx` (2 MB, v6.2 con huella) desde `public/`, y medir
     antes/después con `scripts/centro-de-mando/mide.ts` (más un corpus con ruido de sala, que no existe). Propuesta:
     fase aparte, con su medición; no entra con esta firma.
  5. **Sin aplicar — spec `012-voz`, tres datos vencidos:**
     - `tareas.md`: **TAR-15 está vencida y hecha.** «Opciones en `Transcriptor` (idioma, pista)» lo entregó voz 0.5.0
       (`transcribeTurnos` las pasa; `pruebas/familia.ts`). Propuesta: marcarla `[x]` con «hecha en voz 0.5.0
       (2026-09-21)».
     - `spec.md`, requisitos no funcionales: dice «Silero v5» y «91 pruebas». El archivo del banco es la **v6.2**
       (misma huella que la etiqueta `v6.2`; `raw/master` se movió) y la suite tiene **98**. Propuesta: «Silero
       v6.2 (la ficha decía v5 hasta el 2026-10-16; misma interfaz)» y «98 pruebas».
     - Requisito nuevo propuesto: «Los pesos se bajan de referencias inmutables y su huella `sha256` se comprueba
       antes de usarlos» (ya cumplido y probado en voz 0.6.0).
  6. **Sin aplicar — `AGENTS.md`, decision tree**: una rama «"Quiero un asistente por voz" / "que me conteste
     hablando" / "centro de mando"» → herramienta YA CONSTRUIDA `tools/bucle-voz/` + `/centro-de-mando`, con su
     restricción (solo lectura; el audio no sale; el texto al cerebro solo por el enrutador). Es el patrón de
     `extractor-documental` y `grafo-conocimiento`. No se aplica sin firma (C1, y el caché de prefijo).
  - **Sin cambios** en `.claude/settings.json`, hooks, `gates.json` ni el manifiesto de la imprenta. La suite nueva
    (`tools/bucle-voz`, 77 pruebas) entra sola en `prueba:tools`, que ya recorre `tools/*`.
- **Motivo**: el goal `centro-de-mando-voz` (decidido por el laboratorio el 2026-10-15: cerebro inyectable por
  OpenRouter, modelo pineado, tope US$1, enrutador delante). Sin clase, el cerebro heredaría el default caro en
  silencio y `modeloPara` no compilaría (C8). Sin prompt revisado como código, lo que la máquina DICE en voz alta no
  pasaría por ningún gate (C1).
- **Qué hace que el prompt no baste solo** (defensa en profundidad, en código y probada):
  - el enrutador decide ANTES del cerebro: las órdenes no le llegan, las escrituras se quedan en dry-run sin tocarlo
    (`pruebas/bucle.ts`: «escritura en dry-run: ni cerebro ni lector»);
  - el cerebro no tiene herramientas: aunque el prompt fallara, no hay nada que pueda escribir;
  - tope duro de gasto en el servidor (402 al 100 %, `services/servidor/gasto.ts`), con el libro en JSONL;
  - un error del cerebro se dice en voz y se avisa (nada silencioso);
  - solo texto sale; el audio, nunca (el servidor de la app habla con el demonio en 127.0.0.1).
- **Estado del LLM** (2026-10-16): **MEDIDO**. Conversación con el modelo real en la medición de punta a punta
  (`docs/goals/centro-de-mando-voz-medicion/latencias.json`); gasto total del goal en el resumen del reporte, bajo el
  tope de US$1.
- **Gate aplicado**:
  - diff revisado ☐ (arriba, para el laboratorio);
  - regresión capa A ☑ 166/166 (2026-10-16);
  - `verifica:routing` ☑ coherente (con el nivel `voz`);
  - medición con el modelo real ☑ (cifras en el reporte del goal);
  - aprobación humana ☐;
  - pineo ☑ (`anthropic/claude-haiku-5.5-20261007`, con fecha);
  - capa B: no corrida por el agente (no cambia ningún skill ni instrucción del arnés; el skill global del punto 3
    queda sin aplicar); decide el laboratorio («capa A basta» o corrida en sesión limpia) ☐.
- **Regresión**: `npm run validate` tras el commit (cifra en el reporte del goal).
- **Aprobado por**: pendiente
