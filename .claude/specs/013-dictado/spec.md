# Spec 013 — Dictado local en WSL2 sobre `voz`, con motor elegido por medición

> **Diseño**: [`docs/SDD-dictado.md`](../../../docs/SDD-dictado.md) (mapa sflow → dictado, restricciones
> de WSL2 medidas, C3/C4 del servicio, veredicto).
> **Spec que lo pidió**: [`docs/GOAL-dictado-wsl2.md`](../../../docs/GOAL-dictado-wsl2.md).
> **Contrato de empaquetado**: [`docs/EMPAQUETAR-HERRAMIENTA.md`](../../../docs/EMPAQUETAR-HERRAMIENTA.md).
> **Se apoya en**: [`012-voz`](../012-voz/spec.md) — el VAD y los turnos son de ahí; esto pone el texto.
> **Estado**: spec **retroactiva** (2026-09-16). `tools/dictado/` 0.1.0 existe (PR #109) con 29 pruebas,
> empaquetado en verde y medición del 2026-09-15; queda pendiente la prueba en vivo con una persona.

## Contexto y objetivo

Hablar y que el texto aparezca donde está el cursor. sflow lo resolvió para macOS con las piezas de
esa plataforma; `voz` sabe cuándo habla alguien pero se aparta de transcribir. Faltaba la
herramienta que junte las dos cosas **en esta máquina** (WSL2 sobre Windows, CPU sin CUDA), con un
motor de transcripción elegido por cifras y no por fama, y que sea reutilizable en otros proyectos.

El objetivo es `tools/dictado/`: dictar a Claude Code en Windows Terminal o a cualquier app de
Windows, con diccionario personal, snippets, comandos de voz e historial; transcribir archivos y
reuniones con hablantes; y ofrecer el mismo motor por HTTP desde un servidor propio, con o sin GPU.
Y que quede escrito, con cifras, hasta dónde se alinea sflow con `voz`.

## Usuarios / actores

- **Quien dicta** — la dueña de la máquina; su voz es el dato que se procesa.
- **Integrador** — instala el paquete en otro proyecto y elige motor, pegador y almacén.
- **Persona en la reunión** — aparece en un lote diarizado; **no usa el sistema**.
- **Operador del servicio** — levanta `servicio/` en el VPS y custodia el token.
- **Agente de la fábrica** — implementa, mide, empaqueta y verifica.

## Historias de usuario

- Como **quien dicta**, quiero mantener una tecla, hablar y soltar, y que el texto aparezca donde
  tenía el cursor, sin cambiar de ventana.
- Como **quien dicta**, quiero decir «punto y aparte» o «y dale enter» y que se haga, no que se
  escriba.
- Como **quien dicta**, quiero que mis nombres propios y mi jerga salgan bien, y que el sistema me
  proponga añadirlos cuando corrijo un dictado.
- Como **quien dicta**, quiero saber cuánto tardó entre que callé y apareció el texto, para
  decidir si el motor me sirve.
- Como **integrador**, quiero un núcleo que no arrastre ffmpeg, ONNX ni Python, y elegir yo el
  motor.
- Como **integrador**, quiero convertir una grabación de reunión en un acta con turnos por persona.
- Como **operador**, quiero que el servicio no arranque sin token y no deje audio ni texto en logs.
- Como **quien dicta**, quiero que por defecto nada de mi voz salga de la máquina.
- Como **quien dicta**, quiero que el agente me conteste también en voz alta, con una voz local.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA expondrá un núcleo TypeScript sin dependencias que no importará `voz`, ffmpeg,
  ONNX, Python ni nada de Windows; hablará con cuatro interfaces (detector de voz, transcriptor,
  pegador, almacén) que cada entry point inyecta.
- RF-2: MIENTRAS escucha, EL SISTEMA pasará el audio al detector de voz y acumulará los turnos
  cerrados (modos `alternar` y `pulsar`) o los entregará uno a uno (modo `manosLibres`).
- RF-3: CUANDO termine un dictado en `alternar` o `pulsar`, EL SISTEMA juntará los turnos
  acumulados con un silencio corto entre ellos y los transcribirá en una sola llamada.
- RF-4: MIENTRAS está en `manosLibres`, EL SISTEMA transcribirá y pegará cada turno que el detector
  cierre, en serie y sin cerrar el micrófono mientras transcribe.
- RF-5: CUANDO entregue un texto, EL SISTEMA informará la latencia entre el fin de habla y el
  pegado, el tiempo del motor y la duración del audio.
- RF-6: SI no hubo turnos o el motor devuelve texto vacío, ENTONCES EL SISTEMA emitirá `sinVoz` y
  no pegará nada.
- RF-7: SI el motor falla, ENTONCES EL SISTEMA emitirá el error con su mensaje y volverá a
  inactivo sin dejar el micrófono a medias.
- RF-8: CUANDO reciba el texto crudo del motor, EL SISTEMA aplicará en este orden snippets,
  comandos de voz, diccionario y limpieza opcional, y dirá qué hizo cada paso.
- RF-9: CUANDO el texto contenga un comando de signo («coma», «dos puntos», «signo de
  interrogación»…) con una palabra delante, EL SISTEMA lo sustituirá por el signo; los saltos
  («nueva línea», «punto y aparte») no exigirán palabra delante.
- RF-10: CUANDO el texto termine en una acción verbal («dale enter», «press enter»), EL SISTEMA la
  recortará del texto y la ejecutará después de pegar; en medio del texto no la tratará como acción.
- RF-11: CUANDO un disparador de snippet aparezca como palabra completa (fronteras Unicode, sin
  distinguir mayúsculas), EL SISTEMA lo sustituirá por su expansión, probando antes el disparador
  más largo, y contará el uso.
- RF-12: DONDE el motor admita pista de vocabulario, EL SISTEMA le pasará el diccionario como pista
  en cada transcripción; la corrección posterior por similitud estará apagada por defecto.
- RF-13: CUANDO se corrija un dictado del historial, EL SISTEMA propondrá como candidatas al
  diccionario las palabras nuevas con mayúscula inicial o guion que no sean de parada.
- RF-14: EL SISTEMA guardará en el historial el texto final, el crudo si difiere, el motor, la
  duración y la latencia, y permitirá listar, buscar y corregir.
- RF-15: EL SISTEMA no guardará el audio de ningún dictado.
- RF-16: DONDE haya pegador de Windows, EL SISTEMA pegará el texto en la ventana con el foco por el
  portapapeles restaurando lo que hubiera, o tecleándolo sin tocar el portapapeles, y pulsará Enter
  si se pidió.
- RF-17: DONDE se use la tecla global, EL SISTEMA tratará mantenerla como hablar, dos toques como
  encender manos libres y un toque como apagarlas, y anunciará antes qué lanza del lado Windows.
- RF-18: CUANDO arranque el dictado, EL SISTEMA medirá el pico del micrófono en los dos primeros
  segundos y avisará si queda por debajo de −60 dBFS.
- RF-19: EL SISTEMA aceptará motores en proceso y motores en otro proceso que hablen JSON por
  líneas, ambos con el mismo contrato de transcriptor que `voz`.
- RF-20: SI un motor en otro proceso muere antes de declararse listo, ENTONCES EL SISTEMA fallará
  de inmediato con las últimas líneas de su error en vez de esperar al tope.
- RF-21: EL SISTEMA fijará el motor y el cierre por silencio por defecto a partir de una medición
  con fecha, corpus y hardware, y los escribirá en el README; lo no medido se declarará «sin medir».
- RF-22: CUANDO reciba un archivo de audio, EL SISTEMA imprimirá el texto y los tiempos de carga y
  transcripción y el factor de tiempo real.
- RF-23: CUANDO reciba una grabación con varias personas, EL SISTEMA devolverá un acta con turnos
  etiquetados por hablante (de `voz`) y texto (propio), fusionando los turnos contiguos de la misma
  persona.
- RF-24: EL SISTEMA ofrecerá un transcriptor por HTTP con la misma interfaz que uno local, que
  exigirá un token de al menos 16 caracteres y nunca lo imprimirá.
- RF-25: SI el servicio arranca sin token o con uno de menos de 32 caracteres, ENTONCES EL SISTEMA
  no arrancará.
- RF-26: SI una petición llega sin `Bearer` válido (comparado en tiempo constante), ENTONCES EL
  SISTEMA responderá 401.
- RF-27: SI el cuerpo declarado supera el máximo, ENTONCES EL SISTEMA responderá 413 antes de leerlo.
- RF-28: EL SISTEMA no escribirá texto ni audio en los logs del servicio, y `/health` devolverá
  solo `{"status":"ok"}`.
- RF-29: DONDE se den certificado y clave, EL SISTEMA servirá TLS propio; si no, no publicará
  puertos y exigirá terminación en el proxy.
- RF-30: EL SISTEMA ofrecerá dos perfiles de despliegue (CPU y CPU+GPU) con el mismo protocolo, y
  declarará «GPU: sin medir» hasta que la medición corra en una GPU.
- RF-31: CUANDO se pida la configuración, EL SISTEMA enmascarará el token como presente o ausente
  y su largo.
- RF-32: EL SISTEMA se instalará por tarball con `exports` tipados para `.`, `./node` y `./remoto`,
  con `voz` como peer de versión exacta y los runtimes como peers opcionales.
- RF-33: CUANDO reciba un texto para decir, EL SISTEMA lo sintetizará con una voz local en español
  frase a frase y hará sonar cada frase en cuanto exista, sin esperar a la última.
- RF-34: EL SISTEMA hará sonar la voz desde Windows (reproductor propio del sistema) y no por el
  PulseAudio de WSLg, y borrará los archivos temporales de audio al terminar.
- RF-35: SI la voz pedida no está en la carpeta de modelos, ENTONCES EL SISTEMA la descargará de su
  URL pineada diciendo cuál y cuánto pesa, o rechazará un nombre que no conozca.

## Requisitos no funcionales

- **Medición** (2026-09-15, Ryzen 7 5700G, CPU, FLEURS es_419 test, 150 tomas, 30,4 min, cada
  motor en su proceso): Parakeet TDT 0.6B v3 int8 WER 3,3 % a 532 ms p50 (327 ms en tomas ≤ 8 s);
  faster-whisper large-v3-turbo 2,5 % a 6,3 s; Whisper turbo por sherpa 11,4 %. Cierre del VAD a
  1000 ms parte el 0,7 % de las frases (700 ms, el 6,7 %). 8 hilos.
- **Voz sintética** (2026-09-16, Piper es_MX-claude-high por sherpa-onnx, 8 hilos): carga 635 ms,
  primera frase lista en 33–58 ms, síntesis 294–343 ms para 5,6–6,9 s de audio (RTF 0,05); el
  PulseAudio de WSLg reproduce a un cuarto de la velocidad (25–31 s por 6,9 s), Windows a tiempo real.
- **Pruebas sin red ni modelos**: 32 contra `dist/` en ~1 s.
- **Español primero**; comandos de voz también en inglés.
- **Plataforma**: WSL2 (micrófono por el PulseAudio de WSLg, pegado y tecla global por
  `powershell.exe`); Node ≥ 22.18; Python 3.12 solo para el motor faster-whisper.
- **Flujo de datos**: por defecto nada sale de la máquina; el remoto es infraestructura propia.
- Archivos ≤ 500 líneas; sin `any`; entradas validadas.

## Casos límite

- Una frase con pausa larga: con 1000 ms de cierre se parte en el 0,7 % de los casos; en
  `alternar` se junta al terminar, en manos libres sale en dos pegados.
- Un toque corto justo después de mantener: la cola serializa `empieza`/`termina` y el modo solo
  cambia con el dictado inactivo.
- El portapapeles tenía algo: se restaura tras pegar.
- Texto con `{}()+^%~` al teclear: se escapa para SendKeys; los saltos van como Enter.
- ffmpeg protesta tras una suspensión del equipo (marcas de tiempo hacia atrás): no es error.
- Micrófono mudo: aviso al arrancar, y la red de seguridad del spec original.
- Peer opcional ausente: el subpath `./node` no importa y el empaquetador lo dice, no lo tapa.
- Audio de más de 10 MB al servicio: 413 antes de leer.

## Impacto sobre terceros (control C4)

- **Quien dicta**: su voz sale del micrófono al motor local y, solo si lo elige, a su propio VPS
  cifrado y autenticado; el historial guarda texto, no audio (RF-15). Un pegado en la ventana
  equivocada escribe lo dictado donde no debía: mitiga la tecla global (no hace falta cambiar de
  ventana) y el aviso de que el destino es el foco de Windows.
- **Persona en la reunión** (lote): se le diariza y transcribe. Aplican las mitigaciones de
  `012-voz` (anonimato por defecto, sin registro de nombres aquí). **Límite**: poner nombres a
  terceros con el registro de `voz` para decidir algo sobre ellos no cabe en esta herramienta.
- **Operador del servicio**: un token filtrado convierte el servicio en un micrófono abierto a
  coste suyo; mitiga: rotación, sin puertos publicados, límites de tamaño y concurrencia.
- **Terceros por la red**: ninguno por defecto; no hay nube de terceros escrita.

## Fuera de alcance

- Modo comando y transformaciones por modelo de lenguaje (piden un proveedor; el enchufe existe).
- Interfaz gráfica, streaming parcial del texto, cualquier nube de terceros, macOS.
- Medir en GPU (no hay VPS): diseñado, declarado sin medir.
- Publicar en npm (gate humano).

## Criterios de finalización

- Los 35 RF con prueba en `tools/dictado/pruebas/` o demostrados en la conversación de
  construcción (lote A-B-A, servicio con 401/413/WAV/PCM16, pegador leyendo el portapapeles).
- `npm run prueba` 29/29; `npm run empaqueta dictado` en verde con `integracion`.
- `npm run mide` con la tabla en README y SDD, JSON crudo versionado.
- **Prueba en vivo con una persona** (casos a y b del GOAL): frase dicha, texto pegado donde
  estaba el cursor, latencia y `Get-Clipboard` como evidencia. **Pendiente.**
- `npm run validate` en verde, o el rojo ajeno demostrado como tal.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Prueba en vivo: ¿cuándo, y en qué dos apps (Windows Terminal con Claude
  Code y cuál más)?
- [NECESITA ACLARACIÓN] ¿Se mide la corrección por similitud del diccionario (hoy apagada) sobre
  un corpus con nombres propios, o se deja apagada?
- [NECESITA ACLARACIÓN] Para el lote, ¿el defecto debe ser Parakeet (rápido, 3,3 %) o
  faster-whisper large-v3-turbo (2,5 %, 12× más lento)?
- [NECESITA ACLARACIÓN] ¿Hace falta el ayudante de Windows con ventana propia (píldora) o basta
  la terminal?
