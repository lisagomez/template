# Propuesta para business-os: el command-center por voz, local y sin sus defectos

> Del goal [`centro-de-mando-voz`](centro-de-mando-voz.md) (2026-10-16). **Propuesta escrita**: el repo de
> business-os no se tocó (solo lectura, `749d89e`, árbol limpio; lo trabaja otra sesión). Aplicarla es la fase 3 de
> FUERA DEL HECHO, en su repo y con su sesión.
>
> Rutas cortas: `hooks/` = `src/features/command-center/hooks/`, `lib/` = `src/features/command-center/lib/`,
> `cc/` = `src/features/command-center/components/`, `api/` = `src/app/api/chat/`. Las líneas son las de `749d89e`.

## 1. Defectos, por prioridad (seguridad primero)

### Seguridad — antes de tocar la voz

| # | Defecto | Dónde | Qué pasa | Arreglo |
|---|---|---|---|---|
| S1 | **Notas de voz en un bucket PÚBLICO, listable y editable** | `src/features/chat/components/VoiceInput.tsx:80-92` (sube ANTES de transcribir, 94-97), nombre `voice-${Date.now()}.webm` (82); `supabase/migrations/00000000000000_base_schema.sql:594` (bucket público), 604-606 (SELECT sin `to`: también `anon`), 616-624 (cualquier `authenticated` hace UPDATE/DELETE); la URL viaja al daemon (`ChatPanel.tsx:1452-1456` → `api/stream/route.ts:95`) | Con la anon key se lista el bucket y se descarga la voz de cualquiera; el audio queda subido aunque la transcripción falle; cualquier usuario puede borrar o sustituir notas ajenas | No subir audio: transcribir en local (el servicio de `dictado`) y guardar solo texto. Si hace falta conservar audio: bucket privado, RLS por dueño, nombre aleatorio, borrar tras transcribir, AISIA |
| S2 | **RLS abierta en las conversaciones** | `base_schema.sql:505-523`: `for all to authenticated using (true)` en `chat_sessions` y `chat_messages` | Cualquier usuario autenticado, también `member`, lee y escribe todas las conversaciones con la anon key | RLS por dueño (y por organización si aplica); probar con el caso malo |
| S3 | **`service_role` sin comprobar dueño ni validar** | `api/sessions/[sessionId]/messages/route.ts:9-16, 96-118` (POST: `role`, `content`, URLs y `metadata` libres, sin Zod), 29-73 (GET `?source=mc` lee cualquier sesión); `api/sessions/route.ts:104-110, 123-124` (PATCH/DELETE sin dueño) | Escritura y lectura de sesiones ajenas; contradice `service.ts:3-7` | Sesión del usuario + RLS (C7: las superficies de negocio no usan `service_role`); Zod en toda entrada |
| S4 | **Inyección de prompt por `metadata.source = 'cron'`** | `api/stream/route.ts:62-77` inyecta como contexto de confianza toda fila marcada `cron`; `messages/route.ts:116` acepta `metadata` del cliente | Se planta un «briefing de cron» falso ante un agente con herramientas | El origen `cron` lo marca solo el servidor; rechazar `metadata` del cliente; delimitar el contexto como dato |
| S5 | **ESC aborta TODAS las sesiones del daemon** | `hooks/useVoiceLoop.ts:517-521` (y 494-498) manda `sessionId: null` hasta el `init` (79, 276-278); `api/interrupt/route.ts:18-25` convierte lo que no es string en `{}` = «todas»; ESC actúa en cualquier estado, también con el foco en un campo (`cc/CommandCenterLive.tsx:80-81`) | ESC en reposo o antes del `init` mata los crons y los chats en curso de todos | La ruta rechaza `sessionId` vacío (400); el HUD manda el id de SU turno; ESC no actúa en campos de texto |
| S6 | **Web Speech manda el audio a Google** mientras la pestaña Live está abierta | `hooks/useWakeWord.ts:85-87` (`continuous`), activo también al hablar (`cc/CommandCenterLive.tsx:60`) | Flujo de datos no decidido (C4): todo lo que se dice cerca del micrófono sale | Palabra de activación por texto local (§3) o activación por toque/tecla |
| S7 | Bypass de escritorio por cabecera `Host` (fuera del HUD) | `desktop-auth-server.ts:4-9`; `supabase/server.ts:40-61` | Solo importa si `BUSINESS_OS_DESKTOP_EMBED=1` corre en un host expuesto | No confiar en `Host`; ligar el bypass a loopback real |

### Funcionales — los resuelve el paquete de §3

| # | Defecto | Dónde | Cómo queda en `@tu-scope/bucle-voz` |
|---|---|---|---|
| F1 | **Sin identificador de turno** (cinco variantes): un reposo falso abre otro turno con el stream vivo; audio ya descargado suena tras ESC; ESC no frena la transcripción; `startListening` no reentrante (dos micrófonos en los mismos trozos); pulsar-para-hablar colgado | `hooks/useVoiceLoop.ts:106-107, 197, 203-204, 287, 330, 543` · 175-187, 158-164 · 352 (fetch sin `signal`), 507-508 · 409-419, 449-451 · 380, 422-432; `cc/CommandCenterLive.tsx:74, 85` | `creaGestorTurnos` + `conSenal`: cada turno con su `AbortController`; abrir otro o interrumpir aborta transcripción, cerebro y voz; lo tardío se tira. Micrófono abierto una vez; activar es lógico e idempotente; soltar ESPACIO o perder el foco cierra el turno. **Probado**: «turno viejo nunca suena», «desactivar durante la transcripción», «activar dos veces» |
| F2 | **La interrupción por voz no funciona**: el micrófono se cierra al hablar | `hooks/useVoiceLoop.ts:382-383`; `lib/audio-engine.ts:249, 295, 316-317` (rms 0 → nunca dispara); `onBargeIn` muerto (105, 487-500) | Micrófono abierto; `creaInterrupcion` atenúa al primer marco y corta a los 120 ms de voz casi continua, con puerta de eco. **Medido** en §6 |
| F3 | **La telemetría engaña ~1,5 s** | `hooks/useVoiceLoop.ts:377` (fin = cuando decide el VAD, 1500 ms después, 439-440), 177-181 (primer audio = al encolar, antes de `play()`, `lib/audio-engine.ts:174`) | `creaTelemetria`: del fin REAL del habla (reloj de audio) a la primera muestra que suena; el cierre del VAD es una etapa dentro |
| F4 | **VAD frágil**: un frame dispara, la voz baja se corta (banda muerta 0,035-0,06), sin calibrar, en bytes y dependiente de los fps | `hooks/useVoiceLoop.ts:56-59, 433-447`; `lib/audio-engine.ts:294-301` | El detector de `@tu-scope/voz` con energía calibrada (300 ms de suelo), histéresis y mínimo de habla; medido 10/10 interrupciones a SNR 8 y 18 dB |
| F5 | **Errores silenciosos**: si fallan los dos TTS la oración se pierde; un 403/503 apaga el carril rápido toda la sesión; `play()` rechazado sin aviso; sin `result` no hay `flush` | `hooks/useVoiceLoop.ts:157, 163-164, 176, 188, 249-253, 307, 318, 323-324`; `lib/audio-engine.ts:174` | `creaCanalVoz`: reintento y aviso con la frase; un fallo del cerebro se DICE («no pude contestar») además de avisarse |
| F6 | **Palabra de activación frágil**: `\b` ASCII («Ámbar», «José» no tienen límite; añadir `u` no lo arregla, probado), basta el nombre en cualquier punto (lo dispara el propio TTS), huecos sordos de 800 ms | `hooks/useWakeWord.ts:48, 50-53, 99, 110-115` | `creaActivacion`: límites Unicode, frase al inicio, filtro de eco, sin reinicios. **Medido** en §6 |
| F7 | **Latencia evitable**: `getUserMedia` por turno; el stream de `tts-fast` se descarta (se espera el `arrayBuffer`); `auth.getUser()` por oración; sesión creada en serie; respaldo TTS en serie | `hooks/useVoiceLoop.ts:409, 156, 221-231, 153-164`; `api/tts-fast/route.ts:29-30, 64-65`; `api/tts/route.ts:29-30` | Micrófono abierto; voz por frase con caché de frases fijas y silencio inicial recortado; especulación en la pausa |
| F8 | **Separador**: una respuesta que empieza con «Sí.» no emite nada hasta el final (`exec` sin `g`); «Sr. Pérez», «3.5» y «$1,214» se parten | `lib/sentence-splitter.ts:18-19, 44-60` (y el comentario dice ≥40 mientras el código usa 22, 8 vs 53) | `creaSeparador`: avanza por posición, abreviaturas, decimales, miles, horas, iniciales, suspensivos, URL; primer trozo en la primera pausa ≥ 20 caracteres |
| F9 | El karaoke vuelve a gris al reescuchar; el opener nunca suena pero se paga su prefetch; turno fantasma al cambiar de pestaña con la STT en vuelo; `MediaRecorder` sin límite con la pestaña oculta; colores del orbe y la UI desalineados | `lib/audio-engine.ts:226` · `hooks/useVoiceLoop.ts:123-130, 209-215, 529` · 548-556 · 467-484 · `cc/Orb.tsx:15` vs `CommandCenterLive.tsx:134` | Eventos `karaoke` por turno; sin opener; desmontar aborta el turno; un color por estado |
| F10 | Sin `turnId` ni ACK con el daemon: probable duplicado en /chat y push por cada turno de voz desde el móvil | `hooks/useVoiceLoop.ts:237-244`; `api/stream/route.ts:91`; `api/complete/route.ts:92-94, 116-147, 182-185` | El id de turno del bucle viaja al daemon (lo resuelve el daemon; no verificable aquí) |

## 2. Lo que se conserva de la fuente, y cómo quedó

| De business-os | En el template |
|---|---|
| Voz por oración, pedida en paralelo y encolada en orden (`useVoiceLoop.ts:167-189`) | `creaCanalVoz`, con tope de concurrencia y sin pérdidas silenciosas |
| `<audio>` + `preservesPitch` + `playbackRate` (`audio-engine.ts:118-132, 205-211`) | `creaReproductorNavegador`: igual, pero sin pasar por Web Audio (Chrome no cancela el eco de lo que suena por Web Audio, y ahora el micrófono queda abierto); el nivel para el orbe sale del PCM |
| Limpieza de nodos y URLs (`audio-engine.ts:177-186, 214-229, 332-345`) | Cada URL se revoca al terminar o al cortar; dos elementos reutilizados |
| Re-anclaje de relojes al volver a la pestaña (`useVoiceLoop.ts:461-484`) | `creaRelojAudio().reinicia()` en `visibilitychange` |
| Desbloqueo de audio en iOS (a medias en el HUD; el bueno en `AudioButton.tsx:13-19, 42-49, 74-77`) | `desbloquea()` en el gesto, sobre los mismos dos elementos que luego suenan |
| `prefers-reduced-motion` (`Orb.tsx:105` y siguientes; huecos en `Waveform.tsx:55`) | Orbe y onda lo respetan los dos |
| Disposición, colores por estado, orbe, onda de 36 barras, karaoke | `src/features/centro-de-mando/components/` (aviso MIT en `LICENSE-FUENTE`) |

## 3. Plan de migración

**Fase 0 — seguridad (sin voz nueva, se puede hacer ya):** S1 a S5 en este orden; S6 se cierra en la fase 1. Cada uno
con su prueba del caso malo (anon lista el bucket, un `member` lee una sesión ajena, ESC con `sessionId` vacío).

**Fase 1 — los proveedores, fuera:**

| Etapa | Hoy | Después | Cómo |
|---|---|---|---|
| Voz a texto | Groq `whisper-large-v3-turbo` | Parakeet TDT 0.6B v3 local, con anclaje de idioma para lo corto | el servicio de `@tu-scope/dictado` (`servicio/`): en la misma máquina, el demonio (127.0.0.1); en un VPS, el servicio con Bearer y TLS (`creaTranscriptorRemoto` de `./remoto`) — su C3 es la fase 4 de FUERA DEL HECHO |
| Voz del agente | ElevenLabs `eleven_flash_v2_5` | Piper es_MX «claude» (local) | `POST /sintetizar` del mismo servicio, una petición por frase |
| Palabra de activación | Web Speech de Chrome (Google) | texto local + `creaActivacion` (o toque/tecla) | el oído transcribe lo dicho en reposo con el mismo motor |
| LLM | daemon ClaudeClaw | **sigue el daemon** | un adaptador `Cerebro` de ~40 líneas: su SSE (`text_delta`, `usage`, `result`) → `PiezaCerebro` |

Variables que salen: `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `COMMAND_TTS_VOICE`/`MODEL`. Entran: la URL y el token del
servicio de dictado.

**Fase 2 — el bucle:** sustituir `useVoiceLoop`, `audio-engine`, `useWakeWord` y `sentence-splitter` por
`@tu-scope/bucle-voz` (`creaBucle` + `creaOido` + `creaReproductorNavegador`) con `@tu-scope/voz/browser`
(`capturaMicrofono`, `creaDetectorVoz`, `modeloEnergia`). La interfaz de business-os (Orb, Waveform, Subtitles,
TranscriptPanel) se queda y se alimenta de `bucle.suscribe` (`estado`, `frase`, `karaoke`, `interrumpido`, `aviso`) y
de `bucle.telemetria`. El enrutador local va delante del daemon: callar, repetir, velocidad y lecturas no gastan una
vuelta del agente. `/api/chat/transcribe`, `tts` y `tts-fast` desaparecen.

**Fase 3 — telemetría honesta en la tira:** la cascada por etapa del template (cierre VAD, transcripción, enrutado,
primer token, primera frase, voz lista, suena) en vez de STT / 1er token / 1er audio; el verde por debajo de 1 s
medido desde el fin real del habla.

**Fase 4 — medir allí:** el mismo banco (`scripts/centro-de-mando/mide.ts`: micrófono falso con verdad de terreno y
toma de lo que suena) contra su HUD.

## 4. Qué consumir, con qué versión exacta

```jsonc
"dependencies": {
  "@tu-scope/bucle-voz": "0.1.0",   // el bucle, el enrutador, la telemetría, el reproductor
  "@tu-scope/voz": "0.6.0",         // micrófono y detector en el navegador
  "@tu-scope/dictado": "0.2.0"      // solo `./remoto` si el servicio está en otro host
}
```

Exactas, sin `^` ni `latest` (C1). Se instalan por tarball (`npm run empaqueta <x>` en el template deja el `.tgz`)
hasta que publicar sea decisión del laboratorio (fase 5 de FUERA DEL HECHO). `onnxruntime-web` no hace falta mientras
el detector sea por energía (Silero en el navegador es un CDC aparte).

## 5. Lo que esta propuesta no resuelve

- El daemon ClaudeClaw y su `/interrupt` no están en el repo de business-os: S5 y F10 se arreglan del lado del HUD
  y de la ruta, pero su contrato con el daemon no se pudo verificar.
- La palabra de activación por texto cuesta una transcripción por tramo de voz en reposo (local, ~100-300 ms de CPU).
  Medida aquí con voces sintéticas: ver la medición; en una sala real, con su voz, falta medir (fase 2 de FUERA DEL
  HECHO).
- Las cifras de este goal son de un Ryzen 7 5700G sin GPU en WSL2 con voces Piper; en el VPS de business-os se miden
  otra vez.

## 6. Lo medido en el template (2026-10-16)

Con el HUD del template, no con el de business-os: micrófono falso con verdad de terreno y toma de lo que suena
(cota conservadora, +100-150 ms). Detalle y método en [`centro-de-mando-voz-medicion/resumen.md`](centro-de-mando-voz-medicion/resumen.md).

| Qué | Medido |
|---|---|
| Fin real del habla → primer audio, orden local sin LLM (n = 32) | p50 644 ms · p95 802 ms |
| Lo mismo, conversación con el cerebro (n = 12) | p50 1895 ms · p95 2644 ms |
| «Para.» dicho encima de la respuesta (F2) | 16 de 16 cortes; reacción p50 208 ms · p95 268 ms; 0 frases del turno viejo después |
| Auto-interrupciones con eco a −20 dB y sin cancelación de eco | 0 de 6 |
| Enrutador por texto, corpus nunca visto (n = 53) | 75,5 %; 0 órdenes equivocadas, 0 conversación tomada por orden |
| Palabra de activación por audio (F6), umbral 0,8 | 26/30 detectadas, 3/45 falsas (las tres «Oye, Armando»); por hora en sala real: no medido |
