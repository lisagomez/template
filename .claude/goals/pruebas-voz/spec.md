# Laboratorio de voz — Spec

Compilado por `/goal-compiler` el 2026-09-20. Forma: **LOOP** (una app, un agente; los
nodos colapsan sin perder nada). Lo que se pega en `/goal` es el bloque corto, NO este archivo.

## ESTADO REAL DE LA VOZ (medido hoy, no supuesto)

Lo que existe y esta verde en `main`:

| Pieza | Que hace | Pruebas | Pesos en disco |
|---|---|---|---|
| `tools/voz` 0.4.0 | VAD Silero, reparto por canal, diarizacion por lotes / en vivo / con solape, registro de voces, enchufe de transcripcion | 91/91 | Silero si. **WeSpeaker y pyannote NO** (URLs pineadas en `tools/voz/medicion/mide.mjs`) |
| `tools/dictado` 0.1.0 | STT local (Parakeet 3,3 % WER, 532 ms p50), tres modos, comandos de dictado, snippets, diccionario, historial, `archivo`, `lote --hablantes`, servicio remoto, **TTS Piper es_MX** (`dictado di`) | 35/35 | Parakeet, faster-whisper, Silero, Piper es_MX: si |
| `tools/asesor-ventas` 0.1.0 | De turnos diarizados saca insights con evidencia, score 0-100 con huecos y siguiente pregunta, acciones, riesgos, stakeholders. Sin LLM, cero deps | 8/8 | no necesita |
| App Next | `/dictar` (PWA movil, emparejada por QR, token presente), `POST /api/dictado/movil`, puente al icono | build de produccion funciona | — |

Lo que NO existe: ninguna llave de LLM (`OPENROUTER_API_KEY` ausente), ningun proyecto
Supabase, ninguna integracion con Zoom/Meet/CRM/correo/calendario, ningun audio de muestra en
`tools/dictado/medicion/banco/datos` (0 wav), y `gog` (CLI de Google) no esta instalado.
`next dev` NO hidrata en esta maquina: la pagina se prueba con build de produccion
(`npm run build && npx next start -H 0.0.0.0 -p 3000`), como ya se aprendio en `/dictar`.

**Veredicto de partida:** la voz base (oir, transcribir, hablar, separar hablantes por canal)
esta lista. Lo que decide, integra o llama a un modelo alojado, no.

## MISION

Que exista en la app una **pagina de laboratorio de voz** que cualquier persona sin
conocimientos tecnicos pueda abrir y, en menos de un minuto, entender que sabe hacer hoy la
herramienta de voz, probarlo con sus propios oidos y su propia voz, y dejar su veredicto.
Nivel de referencia: la mejor pagina de "pruebalo tu mismo" de un producto de voz serio, no un
formulario de QA. Cada caso de uso es una tarjeta que dice en lenguaje llano que hace, en que
estado esta, como probarla en tres pasos y que deberia pasar. La persona prueba, ve el
resultado (texto, audio, hablantes, analisis) y marca «funciono / a medias / no» con una nota.
Esos veredictos quedan guardados en la maquina y se pueden exportar como un reporte.

La pagina es ademas la **auditoria honesta** de la funcionalidad: lo que no esta listo no se
disfraza. Se muestra con su estado real y con la razon (falta un peso, falta una llave, falta
una decision humana), en palabras que la persona que prueba pueda repetir a quien decide.

## LOS CASOS DE USO, ORGANIZADOS PARA QUIEN PRUEBA

Cuatro salas. El orden va de lo mas tangible a lo mas ambicioso. Cada caso lleva su estado
medido hoy: **LISTO** (la pieza existe y se demuestra), **POR REGLAS** (se demuestra con
logica local sin LLM, y se dice que es por reglas), **PUERTA HUMANA** (necesita una llave,
un peso, una integracion o una firma; la tarjeta explica cual y no simula nada).

### Sala 1 — Hablar y que se escriba
1. **Notas de voz a texto** — graba con el microfono o sube un audio y ve el texto. LISTO.
2. **Transcripcion de documentos dictados** — un audio largo → texto con tiempos y latencia. LISTO (`dictado archivo`).
3. **Lectura de clases** — grabacion de una clase → transcripcion con marcas de tiempo por parrafo, buscable. LISTO en texto; capitulos automaticos POR REGLAS (pausas largas del VAD).
4. **Comandos de voz para organizar** — «punto y aparte», «nueva linea», snippets, diccionario personal. LISTO. Comandos de accion (buscar documento, agendar, recordatorio, correo, CRM): POR REGLAS para *entender* la intencion y mostrar **vista previa** de lo que haria; **ejecutar** contra Calendar/Gmail/CRM es PUERTA HUMANA (accion irreversible + integracion inexistente). La tarjeta lo dice asi.
5. **Recordatorios por voz** — «recuerdame llamar a Ana el martes» → intencion + fecha extraida, guardado local. POR REGLAS.

### Sala 2 — Quien habla y que paso
6. **Asistente de call center** — dos canales (agente / cliente) → cada voz por su lado, transcripcion por turno, y analisis del asesor (pains, objeciones, senales de compra, siguiente mejor pregunta). LISTO por canal (`creaDetectorPorCanal`) + POR REGLAS el analisis.
7. **Analisis de sentimiento** — POR REGLAS (lexico local en espanol, por turno, con la evidencia citada). Nunca se presenta como IA.
8. **Respuesta y feedback al asesor** — score 0-100 con desglose, huecos y pregunta sugerida. LISTO (`asesor-ventas`).
9. **Reunion grupal presencial** — un microfono, varias personas → turnos por hablante. PUERTA HUMANA hasta descargar los pesos pineados de WeSpeaker/pyannote con el mecanismo existente (`tools/voz/medicion/mide.mjs`); si se descargan en el build, pasa a LISTO (`dictado lote --hablantes`). Jamas se simulan hablantes.
10. **Evaluacion de competencias orales** — palabras por minuto, muletillas, pausas, ratio de habla, preguntas abiertas, sobre la propia grabacion. POR REGLAS.
11. **Role-playing con IA** — PUERTA HUMANA: requiere un modelo (sin llave hoy) y CDC para pinearlo. La tarjeta muestra el guion de lo que seria y el boton esta deshabilitado con la razon.
12. **Asistente de consultas frecuentes** — POR REGLAS: la persona pega sus 10 preguntas/respuestas, pregunta por voz y la pagina responde por voz con la mas parecida (similitud local). Un LLM aqui es PUERTA HUMANA.
13. **Asesoria profesional especializada** — playbooks por tipo de reunion (discovery, demo, negociacion) del asesor. LISTO como demostracion del asesor de ventas; otros dominios: PUERTA HUMANA (falta el playbook).

### Sala 3 — La maquina habla
14. **Locucion sintetica para audiolibros** — pega un texto, elige velocidad, escucha y descarga el WAV. LISTO (`dictado di --guarda`, Piper es_MX; medido RTF 0,05).
15. **Postproduccion de podcast** — sube un episodio: silencios detectados y recortables (VAD), transcripcion, capitulos por pausas, hablantes si hay pesos. LISTO parcial + POR REGLAS.
16. **Voz picking (almacen)** — la maquina lee «ubicacion A-12, tres unidades», la persona confirma por voz, siguiente linea. LISTO como bucle TTS→STT con diccionario de codigos.
17. **Comunicacion con EPI / manos libres** — modo manos libres con cierre por silencio de 1000 ms; la tarjeta advierte que el WER con ruido de campo **no esta medido** y ofrece medirlo con la grabacion de la persona. LISTO con esa honestidad.

### Sala 4 — Donde se usa
18. **Celular** — la PWA `/dictar` ya emparejada; la tarjeta enlaza y explica A la PC / Aqui / Ambos. LISTO.
19. **Zoom / Google Meet** — PUERTA HUMANA (un bot en una reunion es superficie externa: C3 + C4). Lo demostrable hoy: subir la grabacion de la reunion y pasarla por la Sala 2.
20. **Virtual y en campo** — virtual = grabacion o microfono del navegador (LISTO); en campo = celular + manos libres, con la misma nota de ruido sin medir.

## LIBERTAD TECNICA
Tu eliges como se construye la pagina, como se orquesta el CLI de `dictado` y los paquetes
`voz` / `asesor-ventas` desde la app, como se guardan los veredictos y como se exporta el
reporte. Los paquetes y el CLI son la base; si encuentras un bug en ellos lo arreglas con
prueba, pero no reescribes sus nucleos. Optimiza por la experiencia de la persona que prueba,
no por el camino mas corto.

## INVESTIGA ANTES DE CONSTRUIR
Lee `tools/dictado/README.md`, `tools/voz/README.md`, `tools/asesor-ventas/README.md`,
`src/app/(main)/dictar/page.tsx` y `src/app/api/dictado/movil/route.ts` (ya resuelven
microfono, HTTPS, token y transcripcion local). Mira 2-3 referencias de paginas «try it»
de productos de voz para la organizacion y el tono. Reafirma el objetivo en una linea antes de
cada edicion grande.

## DEFINICION DE HECHO (evidencia visible en la conversacion)
- `npm run typecheck && npm run lint` en verde, ultimo output pegado.
- Build de produccion arrancado y la pagina servida; sin errores de consola.
- Con Playwright, screenshots pegados de: (a) el mapa de las cuatro salas con el semaforo por
  caso; (b) «Notas de voz a texto» antes/despues: un audio real (grabado o generado con
  `dictado di`, nunca inventado el texto) → transcripcion con latencia; (c) «Locucion»
  con el audio generado y su duracion; (d) «Call center / asesor» con turnos → insights con
  evidencia y score con desglose; (e) una tarjeta PUERTA HUMANA con su razon y la vista previa
  sin ejecutar nada; (f) un veredicto guardado y el reporte exportado.
- Tabla final de los 20 casos con su estado REAL tras construir (LISTO / POR REGLAS / PUERTA
  HUMANA) y, si alguno cambio de estado, por que.
- Reporte de decisiones y lista de formas en que podria estar mal, resueltas.

## COMANDO DE VALIDACION
`npm run typecheck && npm run lint` tras cada cambio grande, output pegado. Antes de las
capturas: `npm run build && npx next start -H 0.0.0.0 -p 3000`.

## RESTRICCIONES REALES
- Audio y transcripciones **no salen de la maquina** (C4). Ningun modelo alojado: no hay llave
  y las palabras de terceros lo hacen infirmable. Lo que necesite LLM se marca PUERTA HUMANA.
- Ninguna accion irreversible se ejecuta (correo, evento, cobro): solo vista previa.
- Nada se simula: sin peso, sin llave o sin integracion, la tarjeta lo dice.
- El token movil y cualquier secreto jamas aparecen en pantalla ni en logs.
- No se tocan `settings.json`, modelos, skills ni prompts (CDC). Los modelos de voz van
  pineados por URL como ya lo estan.
- Interfaz en espanol, sin jerga: la persona que prueba no es tecnica.
- Probar con build de produccion; `next dev` no hidrata aqui.
