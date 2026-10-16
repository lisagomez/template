# Centro de mando por voz: el command-center de business-os, alineado con `voz` y `dictado` — Spec

> Compilado con `/goal-compiler` el 2026-10-15 desde `main` (`26d944d`).
>
> **Forma: LOOP.** Es un solo trabajo con una sola línea de meta: un centro de mando por voz que existe
> en el template sobre los motores locales. Un agente lo hace entero sin perder nada (test de
> colapso), igual que el calendario.
>
> **Decidido por el laboratorio (15/10):**
> 1. **Se construye en el template.** business-os recibe una **propuesta escrita** de migración; su repo
>    no se toca (ahí trabaja otra sesión).
> 2. **El cerebro es inyectable.** El HECHO usa **OpenRouter**, con un modelo rápido y barato, versión
>    fijada y **tope duro de US$1**. Delante del LLM va un **enrutador intercambiable** con versión
>    local de base: las órdenes cortas no pasan por el LLM.
> 3. **Jev (TypeSafe) queda fuera del HECHO**, como candidato a enrutador «no medido» (ver FUERA DEL
>    HECHO).

## Lo que hay hoy (hechos, no suposiciones)

### La fuente: command-center de business-os

`/home/gsore/code/business-os-new` en el commit `749d89e` (MIT), unas 2 900 líneas. `/command-center`
redirige a `/chat?tab=live`. El HUD es `src/features/command-center/`:

- `useVoiceLoop` (564 líneas), la orquestación;
- `audio-engine` (346), `useWakeWord` (127) y `sentence-splitter` (88);
- la interfaz: `Orb`, `Subtitles`, `Waveform`, `Telemetry`, `TranscriptPanel` y `CommandCenterLive`;
- las rutas de `src/app/api/chat/`: `transcribe`, `tts`, `tts-fast` y `stream`. `complete` es el
  webhook de vuelta del daemon, no voz.

**Flujo.** La activación es tocar el orbe, mantener ESPACIO, decir el nombre del agente o la
reescucha sola a los 250 ms. Escucha con un VAD por umbral de energía y, tras 1,5 s de silencio, sube
el audio entero a Groq. El texto va al daemon ClaudeClaw por SSE. La respuesta se corta en oraciones y
se pide la voz de cada una a ElevenLabs (o al daemon), en paralelo. Se reproduce en orden, con
subtítulos sincronizados con el audio (karaoke).

**Proveedores**, todos fuera de la máquina:

| Etapa | Proveedor | Variable |
|---|---|---|
| Voz a texto | Groq `whisper-large-v3-turbo` | `GROQ_API_KEY` |
| Voz del agente | ElevenLabs `eleven_flash_v2_5` | `ELEVENLABS_API_KEY`, `COMMAND_TTS_VOICE` |
| Palabra de activación | Web Speech API de Chrome (servidores de Google) | ninguna |
| LLM | daemon (`CLAUDECLAW_URL`) | — |

**Lo bueno, que se conserva:**
- la voz por oración, pedida en paralelo y encolada en orden, con el primer trozo emitido pronto;
- `<audio>` + `MediaElementSource`, que cambia la velocidad sin alterar el tono y da el karaoke con el
  tiempo real del audio;
- la limpieza de nodos y URLs;
- el re-anclaje de los relojes al volver a la pestaña;
- el desbloqueo de audio en iOS;
- el respeto de `prefers-reduced-motion`.

**Defectos**, con `archivo:línea` en el análisis que se rehace al investigar:
1. **ESC puede abortar todas las sesiones del daemon**: manda `sessionId: null` y la ruta lo trata
   como «todas».
2. **No hay identificador de turno**:
   - un reposo falso abre otro turno con el stream anterior vivo;
   - un audio ya descargado suena después de interrumpir;
   - ESC no frena la transcripción en vuelo;
   - `startListening` no es reentrante: dos micrófonos escriben en los mismos trozos;
   - pulsar-para-hablar se queda colgado.
3. **La interrupción por voz no funciona**: el micrófono se cierra durante `speaking`.
4. **El VAD es frágil**: un solo frame lo dispara, la voz baja se corta tras una pausa y no hay
   calibración.
5. **La telemetría engaña**: subestima ~1,5 s, porque marca el fin del habla cuando el VAD decide y el
   primer audio al encolar, no al sonar.
6. **La palabra de activación es frágil**: `\b` sin la bandera `u` solo entiende ASCII, el TTS puede
   dispararla, y deja huecos sordos de 800 ms.
7. **Hay errores silenciosos**: si fallan los dos TTS, la oración se pierde sin aviso.
8. **Latencia evitable**: un `getUserMedia` por turno, el stream de `tts-fast` descartado y una ida a
   Supabase Auth por oración.
9. **Hallazgos de seguridad**:
   - `VoiceInput` sube cada nota de voz a un **bucket público** (`chat-audio`), con nombre predecible,
     antes de transcribirla;
   - `sessions/[id]/messages` escribe con `service_role` sin comprobar el dueño.

### Los motores locales del template

**`tools/voz` 0.5.0.** Detecta dónde empieza y acaba el habla y quién habla. Corre en local, en el
navegador o en Node, y no transcribe.
- **VAD**: Silero ONNX con perfiles `bargeIn` (cierre a 500 ms) y `dictado` (1000 ms), o por energía
  calibrada.
- **Diarización**: por lotes y en vivo, más registro de hablantes.
- **Audio**: remuestreo, PCM16/WAV, y `capturaMicrofono` (AudioWorklet a 16 kHz).
- **Medido**: la interrupción por energía calibrada da **10/10 a SNR 8 y 18 dB**, frente a 0/10 sin
  calibrar. Además: registro de hablantes, umbrales y reunión sintética.
- **Sin medir**: DER, latencia y RTF.

**`tools/dictado` 0.1.0.** Hablas y el texto aparece donde está el cursor, todo en local.
- **Voz a texto**: Parakeet TDT 0.6B en sherpa-onnx (**WER 3,3 %, p50 532 ms y RTF 0,048**) y
  faster-whisper `small` de respaldo.
- **Demonio**: 127.0.0.1:47125, **319 ms** para una frase de 3,9 s. Exige `DICTADO_MOVIL_TOKEN`.
- **Voz del agente**: Piper/VITS, voz es_MX «claude» a 0,9, **primer audio a 33–60 ms**, en flujo
  por frase.
- **Modo conversación** (PRP-003, fases 1–3): envío al callar a los 1500 ms, half-duplex y hook
  `Stop`.
- **Pendiente**: la fase 4, interrupción con auriculares (RF-44, TAR-21), sin empezar.
- **Máquina medida**: Ryzen 7 5700G, 16 hilos, **sin GPU**, WSL2.

**`src/features/laboratorio-voz`** ya hace el bucle completo en manos libres en el navegador: energía
calibrada con la cancelación de eco del navegador, transcripción por el demonio, voz en flujo, y se
calla si le hablas encima. El cerebro es de **reglas**. Su `msVuelta` empieza a contar cuando el VAD
ya cerró y **no incluye esos 700 ms**.

**Huecos para un asistente de voz de punta a punta:**

| Etapa | Cobertura |
|---|---|
| Palabra de activación | **no** |
| VAD | sí |
| Voz a texto | sí, pero por turno completo, sin parciales |
| LLM en el bucle | **no** |
| Voz alimentada por el flujo del LLM | **a medias**: Piper habla por frases, pero nada le pasa los tokens |
| Interrupción | sí en el navegador; **no** en el escritorio WSL2 |
| Telemetría completa (fin real del habla → primer audio audible, LLM incluido) | **a medias** |

**Cabos sueltos en las herramientas:**
- los pesos se bajan de referencias móviles (`raw/master`, `resolve/main`) **sin verificar hash**;
- `dictado/src/remoto` convierte a PCM16 con la asimetría ×32767/×32768 que ya se corrigió una vez en
  `voz/node`;
- hay variables `DICTADO_*` sin documentar en el README;
- las cifras se contradicen entre READMEs;
- TAR-15 de la spec 012 está vencida;
- el skill **global** de dictado se contradice sobre el motor en vivo (líneas 44 y 67): es un CDC.

### Credenciales y entorno, medidos el 15/10 sin imprimir valores

- **`OPENROUTER_API_KEY`** está en `.env.local` (largo 73). A la llave le quedan **US$3.30** de su
  tope de US$15, y la **cuenta tiene US$2.59** de saldo compartido.
  - Se mira con `GET /api/v1/key` (`limit_remaining`) y `GET /api/v1/credits`.
- **`DICTADO_MOVIL_TOKEN`** está en `.env.local` (largo 32).
- No hay llave de TypeSafe ni ningún LLM local corriendo.
- **Modelos del dictado** ya descargados (4,3 GB) en el banco del árbol principal,
  `/home/gsore/code/template/tools/dictado/medicion/banco`: Parakeet, faster-whisper, las tres voces
  Piper, Silero y WeSpeaker. Se usan con `DICTADO_MODELOS=<banco>/modelos` y `DICTADO_RUNTIME=<banco>`.
  Un worktree nuevo no los trae: **no se vuelven a bajar**.
- El puerto 3000 lo ocupa otro proyecto: `npm run dev` elige otro.
- Playwright corre como librería con el Chromium de `~/.cache/ms-playwright`; el MCP no tiene Chrome.
- WSLg no tiene cancelación de eco, y por eso el escritorio es half-duplex.

### Jev (TypeSafe), revisado el 15/10

Es un modelo de **decisiones, no de texto**:
- recibe un estado y preguntas con tipo: elección (`choice`), puntuación (`score`), grado de verdad
  entre 0 y 1 (`noul`) o caja (`box`);
- contesta con una probabilidad;
- **no genera respuestas**.

Encaja como enrutador delante del LLM; es el patrón de su demo de casa inteligente.
- **A favor**: cuesta US$0.042 por millón de tokens de entrada y la salida es gratis. Permite fijar
  versión: `jev-1.14.0` o `jev-1.13.0`. Los alias `jev-latest` y `jev-preview` cambian solos y aquí
  están prohibidos.
- **En contra**:
  - según su documentación, «el inglés es el idioma principal» y los demás «no igual de bien»;
  - la retención cero de datos solo está en el plan empresarial;
  - está en acceso anticipado;
  - las cifras de latencia (70–500 ms) son del fabricante, sin verificar.

## MISION

Que exista en el template un **centro de mando por voz local, nivel referencia**: el HUD de
command-center con sus defectos resueltos, montado sobre `voz` y `dictado`, con un cerebro que
contesta en flujo y un enrutador que resuelve las órdenes sin LLM.

**Lo que la persona vive:**
- **Activación** con su palabra de activación local, sin Google; también con un toque, una tecla o
  manos libres.
- **Una orden corta** («para», «repite», «más despacio», «¿qué tengo hoy?») se resuelve sin LLM y se
  oye en **menos de un segundo desde que calla**. El segundo se mide de verdad: desde el fin real del
  habla, con el cierre del VAD dentro, hasta el primer audio que **suena**.
- **Una pregunta abierta** va al LLM. La voz empieza en cuanto llega la primera frase, sin esperar la
  respuesta entera.
- **Hablarle encima lo calla de inmediato**, sin que su propia voz lo interrumpa. El turno
  interrumpido muere entero: transcripción, LLM y voz en vuelo.
- **Lo ve**: orbe, onda, subtítulos karaoke y la telemetría por etapa de cada turno.
- **Privacidad**: el **audio nunca sale de la máquina**. El texto transcrito sale solo hacia el LLM,
  y solo cuando el enrutador decide que hace falta.

**Lo que queda para el monorepo:**
- **Un núcleo reutilizable.** La orquestación del bucle (estados, identificador de turno, cancelación
  e interrupción), el separador de frases, el motor de reproducción, el enrutador y la telemetría,
  empaquetados para que los consuman el HUD de business-os, el laboratorio de voz y los productos que
  hablan (el vendedor por WhatsApp, el asesor por voz). Dónde vive (extender `voz` o `dictado`, o una
  herramienta nueva) lo decides tú: hay reuso real, con tres consumidores.
- **Los huecos cerrados en `voz` y `dictado`**: palabra de activación local, voz alimentada por el
  flujo de tokens y telemetría honesta. Los cabos sueltos se arreglan, salvo lo que sea CDC.
- **La propuesta para business-os**:
  - los defectos priorizados, con los de seguridad primero (el bucket público, ESC);
  - el plan para cambiar Groq, ElevenLabs y Google por los motores locales (el servicio remoto de
    `dictado`, con token y TLS, ya existe);
  - qué paquete consumir y con qué versión exacta.

## LIBERTAD TECNICA

Tú eliges la arquitectura, las librerías, los motores y la estrategia. Cualquier tecnología de este
spec es una sugerencia descartable salvo las RESTRICCIONES. Optimiza por el mejor resultado, no por
el camino más corto. Ejemplos de sugerencias descartables:
- sherpa-onnx ya está en el repo y quizá cubra la palabra de activación o la transcripción parcial;
- Silero en el navegador existe en `voz`, aunque activarlo en producción es un CDC.

## INVESTIGA ANTES DE CONSTRUIR

- **Lee entera la fuente de command-center** (las rutas de arriba) y rehaz el análisis con
  `archivo:línea`. Lee también los README de `voz` y `dictado`, `laboratorio-voz`, el PRP-003 y las
  specs 012-voz y 013-dictado.
- **Investiga 2–3 referencias de punta** de asistentes de voz en tiempo real: cortes de turno
  (endpointing) por silencio y por sentido, interrupción sin auto-interrupción, palabras de activación
  locales en español y latencias de referencia. Decide el enfoque a partir de eso.
- **Reafirma el objetivo en una línea** antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve la conversación: todo se **pega**.

1. **Suites verdes con el conteo**: las de `voz`, `dictado` y la de cualquier herramienta nueva. Cubren
   como mínimo:
   - un turno viejo **nunca** suena en el nuevo;
   - interrumpir cancela la transcripción, el LLM y la voz en vuelo;
   - el separador no corta en decimales ni en abreviaturas y emite pronto el primer trozo;
   - el enrutador manda la orden a la herramienta sin LLM, la conversación al LLM, y lo dudoso al LLM;
   - la palabra de activación, con acentos y ñ;
   - la telemetría mide desde el fin real del habla.
2. **Medición reproducible con cifras pegadas** (un script). El audio es grabado o sintético,
   inyectado como micrófono falso:
   - latencia del fin real del habla al primer audio que **suena**, p50 y p95, en órdenes locales y en
     conversación con LLM;
   - tiempo de reacción de la interrupción, p50;
   - falsos disparos y activaciones perdidas de la palabra de activación sobre un corpus en español. Si
     no se logra en local con calidad, se declara «no medido» y la activación queda por toque, tecla o
     manos libres;
   - acierto del enrutador sobre un corpus de frases en español;
   - **gasto real de OpenRouter**, antes y después (sin imprimir la llave), **≤ US$1**.
3. **Capturas de Playwright del HUD**: reposo; escuchando con la onda; pensando; hablando con subtítulos
   karaoke; una interrupción, antes y después; una orden resuelta sin LLM; una conversación con LLM; y
   la telemetría por etapa.
4. **`propuesta-business-os.md`** junto a este spec: los defectos priorizados con `archivo:línea` de la
   fuente, el plan de migración y qué consumir.
5. **`propuesta-cdc.md`** junto a este spec, con todo lo que sea C1 o C8. Se redacta como propuesta,
   **nunca dentro de la bitácora**:
   - la clase de routing nueva;
   - el prompt del cerebro;
   - los cambios a skills, settings y hooks, incluida la contradicción del skill global de dictado;
   - activar Silero en el navegador.
6. **`npm run empaqueta <herramienta>`** verde por cada herramienta tocada o nueva, y **`npm run
   validate`** completo y verde **después del commit**.
7. **Reporte de decisiones**: qué stack, por qué, qué se tomó de la fuente y qué se rediseñó.
8. **Cómo podría estar mal o incompleto**, y cómo se resolvió cada punto.

O bien **BLOQUEADO**: si falta algo que solo da una persona (llave, saldo, firma), el goal se detiene y
pega el bloqueo, quién lo destraba y qué quedó hecho. Eso también cierra el goal.

## COMANDO DE VALIDACION

Tras cada cambio grande, pegando su salida:

```bash
npm --prefix tools/voz run prueba && npm --prefix tools/dictado run prueba && npm run typecheck
```

Si hay una herramienta nueva, se suma su `npm --prefix tools/<nombre> run prueba`, y el comando final
se declara en el primer checkpoint. `prueba:tools -- <nombre>` **no filtra**: no se usa para una sola
herramienta. Al cerrar: `npm run empaqueta <herramienta>` y `npm run validate`.

## RESTRICCIONES REALES

- **Dónde se trabaja.** En el worktree `/home/gsore/code/template/.claude/worktrees/centro-de-mando-voz`,
  rama `voz/centro-de-mando`. Se creó desde `main` (`26d944d`) el 15/10 con `npm ci` real (un
  `node_modules` enlazado rompe Turbopack).
  - Este spec ya vive en la rama, sin commit. Entra en el primer commit del goal, con su asiento en
    `inventario/activos.json` y `npm run inventario:vista`.
  - En el árbol principal puede escribir otra sesión: no se cambia de rama ni se hace `stash` allí.
- **business-os-new es de solo lectura**: hay otra sesión trabajando en él.
- **No se aplica sin firma.**
  - No se tocan: `.claude/` (skills, `gates.json`, settings, hooks, manifiesto de la imprenta),
    `AGENTS.md` ni el skill global de dictado.
  - La **clase de routing** del cerebro y su **prompt** sí entran en la rama (sin la clase, el gate
    rechaza la llamada), pero son CDC: van en `propuesta-cdc.md` y **nada se mergea sin la firma del
    laboratorio**.
- **El audio no sale de la máquina.**
  - No se usan Groq, ElevenLabs ni la Web Speech API de Chrome (manda el audio a Google), ni como
    defecto ni como respaldo.
  - El único dato que sale es el texto hacia el LLM elegido.
  - Ningún otro proveedor entra sin decisión C4 del laboratorio.
- **Gasto: tope duro de US$1 en OpenRouter.** Se mira el saldo antes y después. Si la cuenta no
  cubre, el goal cierra **BLOQUEADO**. Modelo con versión fijada, nunca un alias que cambie solo.
- **El bucle solo ejecuta órdenes de solo lectura y de control del propio bucle.** Nada que escriba
  fuera del laboratorio ni que notifique a terceros. Una orden que escribiría se queda en dry-run y
  pide confirmación explícita.
- **Consumidores existentes.** Si cambia la API de `voz` o `dictado`, se actualizan sus consumidores
  (`laboratorio-voz`, `ajustes`, `reel`) y siguen en verde. Las versiones van **exactas** donde se
  consuman. Los productos (WhatsApp, estudio, SGI) no se tocan.
- **Licencia**: se conserva el aviso MIT de business-os en lo que se porte.
- **Código**: sin `any`, Zod en toda entrada, archivos de 500 líneas como máximo y funciones de 50.
  Ningún token `T`+dígitos en el árbol: la regla anti-fuga lo rechaza.
- **Secretos**: nunca se imprime un valor. Se confirma presencia, largo y, a lo sumo, cuatro
  caracteres de prefijo.

## ESTIMACION DE GASTO

Con un modelo del nivel `ligero` del routing (hoy `anthropic/claude-haiku-4.5`), una vuelta de voz son
~1 500 tokens de entrada y ~100 de salida: unos **US$0.002**. Una medición con 150–300 vueltas cuesta
**US$0.30–0.60**. El tope de US$1 cubre con margen, y el saldo de la cuenta (US$2.59) también. Si eliges
otro modelo, rehaz la cuenta antes de gastar.

## FUERA DEL HECHO (fases aparte, cada una la abre el laboratorio)

1. **Jev como enrutador.** Requiere:
   - que el laboratorio consiga la llave;
   - medirlo en español contra la línea base local, con el mismo corpus;
   - una decisión C4 (cada frase saldría a TypeSafe);
   - fijar la versión `jev-1.14.0`;
   - un CDC.
2. **Prueba en vivo con la voz del laboratorio**, con la sala en silencio, y calibración con su voz.
3. **Migrar business-os** aplicando la propuesta, en su repo y con su sesión.
4. **Despliegue en un VPS** con el servicio remoto de `dictado` (token y TLS) y el C3 de esa
   superficie.
5. **Publicar** las versiones nuevas de los paquetes: gate humano.
6. **Interrupción en el dictado de escritorio WSL2**, si no se resuelve aquí (half-duplex por falta de
   cancelación de eco en WSLg).

## RED DE SEGURIDAD

- Si tras 50 turnos las suites no convergen, detente y reporta el bloqueo con el estado de cada pieza
  de la MISION.
- Al terminar, converja o no, se hace el **post-mortem**: fricciones, huecos, fallas y lo que
  funcionó. Cada hallazgo se mapea a un gate, una regla o a este spec.
