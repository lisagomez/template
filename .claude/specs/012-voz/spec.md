# Spec 012 — Detección de voz y diarización local como herramienta enchufable

> **Diseño y medición**: [`tools/voz/README.md`](../../../tools/voz/README.md) (no hay SDD aparte: el
> README es el documento de diseño y lleva las tablas medidas).
> **Contrato de empaquetado**: [`docs/EMPAQUETAR-HERRAMIENTA.md`](../../../docs/EMPAQUETAR-HERRAMIENTA.md).
> **Estado**: spec **retroactiva** (2026-09-16). `tools/voz/` 0.4.0 ya existe, con 91 pruebas en verde
> y medición contra pesos reales del 2026-09-01. Esta spec cierra el QUÉ de lo construido para que
> `013-dictado` tenga contra qué apoyarse; cada requisito nombra dónde se comprueba.

## Contexto y objetivo

Cualquier producto con voz —un bot que hay que interrumpir, un acta de reunión, un dictado— empieza
por dos preguntas que no son transcribir: **cuándo** habla alguien y **quién**. Resolverlas dentro
de cada app significa reescribirlas en la siguiente, y hacerlo con un modelo empaquetado significa
que todos los proyectos arrastran cientos de MB aunque solo uno los use.

El objetivo es una **herramienta empaquetable** (`tools/voz/`) que detecte habla en tiempo real,
reparta hablantes por canal, diarice por lotes y en vivo —con y sin habla solapada—, reconozca
voces registradas de una sesión a otra, y defina el enchufe para transcribir **sin transcribir**.
El núcleo no trae pesos ni runtime: los modelos se inyectan, y por eso el mismo algoritmo corre en
el navegador y en Node y se prueba entero sin descargar nada.

## Usuarios / actores

- **Integrador** — instala el paquete en su proyecto, aporta el runtime ONNX y los pesos, y elige
  qué camino usa (VAD, canales, lotes, en vivo, registro).
- **Usuario final** — la persona que habla delante del sistema (quien dicta, quien interrumpe al
  bot). Es quien nota si el turno empieza con «ola» en vez de «hola».
- **Persona grabada** — quien aparece en una reunión diarizada. **No usa el sistema y puede no
  saber que se le identifica por la voz.** Es a quien protege la sección de impacto.
- **Agente de la fábrica** — implementa, mide, empaqueta y verifica.

## Historias de usuario

- Como **integrador**, quiero saber en qué milisegundo empezó a hablar alguien para parar al bot
  antes de que termine la frase.
- Como **integrador**, quiero convertir una grabación en turnos con «Hablante 1/2/3» sin mandar el
  audio a ningún servicio.
- Como **integrador**, quiero que en una reunión real, donde la gente se interrumpe, dos voces a
  la vez salgan como dos turnos y no como uno con etiqueta falsa.
- Como **integrador**, quiero pintar el hablante en cuanto cierre el turno y que el sistema se
  corrija solo cuando la evidencia posterior lo contradiga, diciéndome qué reescribir.
- Como **integrador**, quiero poner «Ana» donde pone «Hablante 2», y que mañana la vuelva a
  reconocer, sin que confunda a un desconocido con ella.
- Como **integrador**, quiero enchufar mi transcriptor —local o remoto— sin que la herramienta
  opine cuál.
- Como **usuario final**, quiero que el turno no me corte la primera consonante ni me parta la
  frase cuando respiro.
- Como **persona grabada**, quiero que mi nombre no acabe en un acta por parecerme a otra voz.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA expondrá un núcleo TypeScript sin ninguna dependencia de ejecución: no
  importará runtimes ONNX, React, Next ni Supabase (lo comprueba `npm run empaqueta voz`
  importando el subpath `.` en un proyecto limpio).
- RF-2: CUANDO reciba audio mono en punto flotante a la frecuencia del modelo, EL SISTEMA emitirá
  `inicioHabla` con el instante en milisegundos y `finHabla` con el turno (inicio, fin y el audio
  si se pidió conservarlo).
- RF-3: EL SISTEMA declarará habla solo cuando la probabilidad supere el umbral de entrada y
  silencio solo cuando baje del umbral de salida, y rechazará al construirse una configuración con
  umbral de salida mayor que el de entrada.
- RF-4: SI un tramo de habla dura menos que el mínimo configurado, ENTONCES EL SISTEMA lo descartará
  sin emitir turno.
- RF-5: CUANDO detecte el inicio de habla, EL SISTEMA incluirá en el turno el relleno de audio
  anterior configurado (200 ms por defecto), para que el turno no empiece cortado.
- RF-6: EL SISTEMA cerrará un turno abierto tras el silencio configurado (500 ms por defecto) y
  también cuando el consumidor llame a cerrar el flujo.
- RF-7: EL SISTEMA funcionará sin ningún modelo descargado mediante un detector por energía, y
  admitirá el modelo Silero inyectado por `./browser` o `./node` con el runtime ONNX que aporte el
  consumidor.
- RF-8: DONDE cada persona tenga su propio canal de audio, EL SISTEMA etiquetará cada turno con su
  canal usando un modelo de voz por canal y ningún modelo de hablante.
- RF-9: CUANDO reciba turnos con audio y un modelo de hablante, EL SISTEMA los agrupará por persona
  y devolverá copias etiquetadas «Hablante N» en orden de primera aparición.
- RF-10: SI un turno dura menos que el mínimo para identificar a alguien, ENTONCES EL SISTEMA lo
  devolverá sin hablante en vez de inventarle uno.
- RF-11: DONDE el consumidor declare cuántos hablantes hay, EL SISTEMA agrupará exactamente en ese
  número.
- RF-12: DONDE se inyecte un modelo de segmentación por ventana, EL SISTEMA representará el habla
  solapada como turnos que se pisan y expondrá los tramos solapados con sus hablantes.
- RF-13: MIENTRAS diariza en vivo, EL SISTEMA emitirá tres eventos: `turno` (con confianza y marca
  de provisional), `correccion` (con los cambios de etiqueta por id) y `firme` (con los ids que ya
  no cambiarán).
- RF-14: MIENTRAS diariza en vivo por VAD, EL SISTEMA entregará la corriente de eventos de voz
  separada de la de diarización, para reaccionar al inicio de habla sin esperar al hablante.
- RF-15: SI en vivo dos hablantes se fusionan y hay turnos ya fuera de la ventana de corrección,
  ENTONCES EL SISTEMA declarará esos ids en el evento (`fuera`) en vez de reescribirlos o callarlo.
- RF-16: EL SISTEMA no reciclará el número de un hablante desaparecido por fusión.
- RF-17: DONDE exista un registro de voces con nombre, EL SISTEMA pondrá el nombre a los grupos que
  reconozca y dejará anónimos los demás sin recorrer su numeración.
- RF-18: SI dos voces registradas quedan a una distancia casi igual (dentro del margen), ENTONCES EL
  SISTEMA se abstendrá de poner nombre.
- RF-19: EL SISTEMA no fusionará dos voces con nombres distintos ni realimentará el registro con su
  propia salida.
- RF-20: SI se importa un registro cuya etiqueta de modelo no coincide con la del modelo actual,
  ENTONCES EL SISTEMA rechazará la importación en vez de nombrar mal en silencio.
- RF-21: EL SISTEMA definirá el enchufe `Transcriptor` y transcribirá turnos en serie con él,
  siguiendo ante el fallo de un turno salvo que el consumidor pida propagarlo.
- RF-22: CUANDO reciba turnos contiguos del mismo hablante separados por menos del hueco configurado,
  EL SISTEMA los fusionará concatenando el texto.
- RF-23: EL SISTEMA leerá WAV PCM de 16, 24 y 32 bits y flotante recorriendo sus cabeceras en vez
  de asumir que los datos empiezan en el byte 44.
- RF-24: EL SISTEMA remuestreará a la frecuencia del modelo y mezclará a mono, y convertirá PCM16
  a flotante.
- RF-25: EL SISTEMA calibrará el umbral de agrupamiento a partir de audio etiquetado a mano
  devolviendo el que más acierta por pares.
- RF-26: EL SISTEMA se instalará por tarball con `exports` tipados para `.`, `./browser` y
  `./node`, y con los runtimes ONNX como peers opcionales.

## Requisitos no funcionales

- **Pruebas sin red ni modelos**: 91 pruebas contra `dist/` en menos de un segundo (`npm run
  prueba`), con modelos falsos que reproducen el convenio de llamada.
- **Medición contra pesos reales** (`npm run mide`, 2026-09-01, LibriSpeech dev-clean, 5 hablantes
  × 12 tomas, WeSpeaker ResNet34-LM, Silero v5): umbral de agrupamiento 0,55 da 5 grupos para 5
  hablantes; registro con umbral 0,45: 35 aciertos de 36, 0 nombres mal y 0 de 12 al impostor.
  Lo que no se ha medido está escrito como «sin medir» (el margen del registro).
- **Pesos pineados por URL exacta** en el script de medición; `latest` es anti-patrón (C1).
- **Plataformas**: navegador (`onnxruntime-web`) y Node ≥ 20 (`onnxruntime-node`).
- **Nada sale de la máquina**: la herramienta no abre red ni escribe archivos.
- **Idioma**: documentación y mensajes en español; identificadores en el idioma del código.

## Casos límite

- Audio a 8 kHz (Silero lo admite con marco de 256) y audio vacío.
- Señal que oscila alrededor del umbral: la histéresis evita abrir y cerrar turnos por marco.
- Toses y clics: el mínimo de habla los descarta; en diarización, evita hablantes fantasma.
- Dos voces a la vez: por VAD sale un turno mezclado (documentado); por segmentación, dos turnos.
- Silencio largo en vivo: la ventana de corrección se vacía y los turnos pasan a `firme`.
- Impostor: una voz no registrada que se parece a una registrada; el umbral y el margen son los
  mandos, y por lotes aguanta umbrales más laxos que en vivo (medido).
- Modelo con dimensiones dinámicas: Silero v5 acepta 512 muestras y devuelve basura; se le dan 576
  (64 de contexto), medido el 2026-09-01.

## Impacto sobre terceros (control C4)

- **Persona grabada**: la voz es un dato biométrico. Reconocerla por nombre (RF-17) permite
  atribuirle lo dicho en una reunión. Mitiga: la herramienta no guarda audio ni registro por sí
  misma (el integrador decide dónde vive el registro y con qué consentimiento), no aprende sola
  (RF-19), se abstiene cuando duda (RF-18) y no funde nombres distintos. **Límite**: usar la
  identificación para decidir algo sobre esa persona sin revisión humana no cabe aquí y no se
  ofrece la vía del registro de riesgo; el integrador que lo necesite tiene que rediseñar con la
  persona dentro del circuito.
- **Usuario final**: un turno mal cortado le hace repetir; un hablante mal etiquetado en un acta
  le atribuye palabras ajenas. Mitiga: relleno y mínimo de habla (RF-4, RF-5), eventos de
  corrección explícitos (RF-13, RF-15).
- **Integrador**: ninguno más allá de su proyecto; el paquete no abre red ni escribe.

## Fuera de alcance

- Transcribir: la herramienta define el enchufe y se aparta (`013-dictado` lo llena).
- Traer pesos o runtimes dentro del paquete.
- Decir quién habla **antes** de que cierre el turno (el VAD necesita el silencio de cierre).
- Habla solapada por el camino VAD (solo por segmentación).
- Aprendizaje automático del registro de voces.
- Interfaz gráfica: la demo del navegador es un banco, no un producto.
- Consentimiento y retención del registro de voces: decisión del proyecto que lo instala.

## Criterios de finalización

- Los 26 RF con prueba en `tools/voz/pruebas/` (91 en verde sin red ni modelos).
- `npm run empaqueta voz` en verde: contrato, build, tarball e integración con los tres subpaths.
- `npm run mide` corrido contra pesos reales, con la tabla y la fecha en el README.
- Los valores por defecto del README coinciden con los medidos, y lo no medido dice «sin medir».

## Dudas abiertas

- [NECESITA ACLARACIÓN] El **margen** del registro (RF-18) no está medido: LibriSpeech no tiene
  dos voces lo bastante parecidas. ¿Con qué voces se mide, y cuándo?
- [NECESITA ACLARACIÓN] Los umbrales del VAD por defecto (0,5 / 0,35, 500 ms) se midieron para
  barge-in sobre inglés; para dictar en español el cierre se midió en `013-dictado` (1000 ms).
  ¿Deben cambiar aquí, o cada consumidor fija los suyos como hace el dictado?
- [NECESITA ACLARACIÓN] ¿Hace falta un `docs/SDD-voz.md` aparte, o el README —que ya lleva diseño,
  decisiones y medición— es el documento de diseño?
