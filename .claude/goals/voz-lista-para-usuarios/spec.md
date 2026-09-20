# Voz lista para usuarios — Spec

Compilado por `/goal-compiler` el 2026-09-20 desde el plan de producto aprobado. Forma: **LOOP**.
Lo que se pega en `/goal` es `goal.txt`, NO este archivo. Alcance del goal: **Etapas 0 y 1**;
las Etapas 2 y 3 son el horizonte y se compilan como goal aparte cuando el piloto tenga dos
semanas de cifras (post-mortem primero).

## MISION

Que la voz y el dictado pasen de «funciona para el laboratorio» a «piloto interno medible» sin
perder lo que ya es bueno: privacidad por diseño, motor elegido por medición, honestidad como
interfaz. Al terminar existe un motor residente que quita los 3 s fijos de cada petición web,
telemetría de forma del dictado (trayectorias, sin contenido), WER medido con voz propia desde
el laboratorio, micrófono que se ajusta solo, datos personales con interfaz, reuniones de
ventas medidas con acta exportable, y los borradores de BUSINESS_LOGIC.md y de la AISIA de
Fase 0 listos para firma humana. Horizonte: la Etapa 2 (instalador de un paso, terceros
instalando solos) y la Etapa 3 (llamadas, la máquina que habla en tiempo real, educación, campo).

## LIBERTAD TECNICA

Tú eliges el cómo: arquitectura del demonio, formato de las trayectorias, la UI de datos
personales, cómo se mide y cómo se presenta. `tools/voz`, `tools/dictado`,
`tools/asesor-ventas` y `/laboratorio-voz` son la base: se extienden y se corrigen con
prueba, no se reescriben. Las propuestas de cada mejora (abajo) son el punto de partida
razonado, no una orden; si mides algo mejor, hazlo y explícalo. Optimiza por lo que la persona
que dicta vive, no por el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

Lee `tools/dictado/README.md`, `docs/SDD-dictado.md`, `tools/dictado/servicio/servidor.mjs`,
`tools/dictado/scripts/en-vivo.mjs`, `tools/dictado/src/node/cli-dictar.ts`,
`scripts/trayectorias/formato.mjs` y `docs/GOAL-trayectorias.md`,
`src/features/laboratorio-voz/services/servidor/dictado-cli.ts`,
`src/app/api/dictado/movil/route.ts` y `scripts/laboratorio-voz/maquina.mjs`. Corre las
herramientas a mano antes de diseñar (hechos antes que diseño). Reafirma el objetivo en una
línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

- Último output del comando de validación pegado, en verde; `npm run validate` en verde al final.
- Tabla antes/después del p50 de `/api/dictado/movil` y del laboratorio con la misma frase de
  4 s: hoy ~3,5 s, meta < 800 ms; con el demonio vivo, y con la caída al CLI demostrada.
- Una trayectoria de `dictar` escrita, ingerida por `npm run trayectorias:ingesta`, verificada
  sin contenido por `npm run verifica:trayectorias`, y el informe mostrando latencia p50.
- Capturas Playwright sobre build de producción: laboratorio con WER medido sobre un audio con
  texto de referencia; informe con WER por caso; UI de diccionario, snippets e historial usada
  de punta a punta (añadir término, corregir un dictado, ver el candidato).
- Tabla de calibración del VAD, la puerta de energía y la corrección del diccionario sobre el
  corpus propio, con la decisión tomada y la entrada en `.claude/gobernanza/BITACORA-CDC.md`.
- Acta exportada de una reunión de dos voces (turnos etiquetados, score con desglose, huecos)
  y la tabla de métricas de las tres reuniones simuladas contra los umbrales del piloto.
- Borradores de `BUSINESS_LOGIC.md` y de la AISIA Fase 0 (plantilla
  `.claude/gobernanza/plantillas/aisia.md`) listos para firma; el agente NO los firma.
- Lista de lo que queda para la Etapa 2, reporte de decisiones, y lista de formas en que podría
  estar mal o incompleto, resueltas.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && (cd tools/dictado && npm run prueba) && npm run prueba:laboratorio`
tras cada cambio grande, con el output pegado. `npm run validate` (gate completo) antes de
cerrar. Para capturas: `npm run build && npx next start -H 0.0.0.0 -p 3000` (`next dev` no
hidrata en esta máquina).

## RESTRICCIONES REALES

- Nada sale de la máquina (C4). Ningún LLM, alojado ni local, en este goal.
- Ningún modelo nuevo se descarga ni se pinea sin CDC aprobado por una persona: la mejora 1.7b
  (PyanNet) se deja PROPUESTA con diff y medición, no aplicada.
- Grabaciones de terceros solo con consentimiento escrito; sin él, voces propias o sintéticas.
- Secretos jamás en pantalla ni en logs; las trayectorias llevan forma, nunca contenido.
- No se tocan `settings.json`, skills ni prompts (CDC). Los parámetros que cambien (VAD,
  energía, diccionario, playbooks) llevan entrada en la bitácora.
- Interfaz en español sin jerga; la honestidad como interfaz se conserva (LISTO / POR REGLAS /
  PUERTA HUMANA con razón, nada simulado).
- Probar con build de producción.

---

# El plan de producto que este spec compila

Compilado con `/goal-compiler` el 2026-09-20 en modo plan. Forma: **LOOP** (un ejecutor,
etapas secuenciales con gates; nada exige contextos separados ni fan-out real).

## Contexto

Encargo de producto: un autoanálisis, como product manager, de la herramienta de voz y dictado:
qué tan preparada está para una experiencia de usuario real y un plan de mejora para que
sirva a los distintos casos de uso. Decisiones tomadas en esta sesión (no se re-deciden):

- **Usuario meta: ambos, primero interno.** Se afina en casa como piloto medible y luego se
  empaqueta para terceros (vendedores, call centers, sectores regulados). Cada mejora sirve a
  los dos, con gates entre etapas.
- **Piloto 1: dictado diario + reuniones de ventas.** Lo que ya se usa a diario y el producto
  que ya se decidió vender.
- **Muro C4 intacto:** las palabras de un tercero jamás van a un LLM alojado; LLM solo tras
  AISIA firmada más seudonimización o pesos auto-hospedados. Modelos pineados; cambiar modelo,
  skill o prompt es CDC.

En `main` hoy (medido): `tools/voz` 0.4.0 (91 pruebas), `tools/dictado` 0.1.0 (35),
`tools/asesor-ventas` 0.1.0 (8), PWA `/dictar` con QR, laboratorio `/laboratorio-voz` con 20
casos y estado real calculado (13 LISTO, 5 POR REGLAS, 2 PUERTA HUMANA), `validate` en verde.

## Diagnóstico de preparación UX (hechos, con origen)

### Lo que ya está bien y no se toca sin medir
- Motor elegido por medición: WER 3,3 %, p50 532 ms, RTF 0,05 en audio limpio (README dictado).
- Privacidad por diseño: nada sale de la máquina, audio a temporal borrado, token en tiempo
  constante, asesor sin LLM. Es el diferenciador vendible (plan del asesor).
- Robustez ganada en vivo el 2026-09-19: puerta de energía, descarte de muletillas, apagado
  entero si muere la captura, respaldo en español para frases cortas.
- La honestidad como interfaz: LISTO / POR REGLAS / PUERTA HUMANA con razón, nada simulado.

### Los nueve huecos entre «funciona para el laboratorio» y «lista para un usuario»
1. **Instalación de 16 pasos y una sola plataforma.** WSL2 con WSLg, Node, ffmpeg, `uv` y
   Python 3.12, ~2,5 GB por `npm run mide` (incluye un corpus de 670 MB que el usuario no
   necesita), build, `dictado icono instala` repetido en cada actualización, PowerShell como
   administrador para el celular, certificado autofirmado sin Tailscale. Ni macOS ni Windows
   nativo. Para terceros es el bloqueo número uno.
2. **3 s fijos por petición web.** `/api/dictado/movil` y `/api/laboratorio/*` arrancan el CLI
   y cargan el modelo en cada llamada; el pipeline residente de `en-vivo` responde en 231 ms.
   El servicio HTTP de `tools/dictado/servicio/` ya expone la misma interfaz que un motor local.
3. **Sin texto parcial.** Parakeet en sherpa-onnx es offline: no se ve nada hasta cerrar el
   turno más la transcripción. Se mitiga con señal de escucha y nivel, no con streaming.
4. **Precisión con ruido sin medir.** 3,3 % es habla leída y limpia. Umbrales del VAD heredados
   de barge-in en inglés; corrección del diccionario apagada por no medida.
5. **Reuniones sin solape.** Camino VAD; el camino PyanNet de `voz` existe con pruebas pero su
   modelo (`segmentation-3.0.onnx`) no está descargado: usarlo es pinear un peso nuevo (CDC).
6. **Micrófono a ciegas.** Ganancia correcta distinta por máquina (+12 dB en una, saturación a
   −0,7 dBFS en otra), ajustada a mano con un flag.
7. **Datos personales sin interfaz.** Diccionario, snippets e historial solo por CLI. El
   historial guarda texto (contenido), no telemetría.
8. **Producto sin escribir.** `BUSINESS_LOGIC.md` es plantilla vacía; único uso demostrado: el
   laboratorio y el dictado propio. La AISIA de Fase 0 (procesar palabras del prospecto aun sin LLM) está
   pendiente de firma. Fase 3 (CRM, Supabase) espera la entrevista `new-app`.
9. **Sin telemetría del dictado.** La línea `herramientas` de trayectorias existe
   (`scripts/trayectorias/formato.mjs`) y nadie la alimenta desde voz ni dictado.

### Matriz por familia de casos (hoy)

| Familia | Semáforo | Hueco principal medido | Para que sirva a un usuario fuera del laboratorio |
|---|---|---|---|
| Dictado diario (PC y celular) | Lista en el laboratorio; parcial para un usuario | 1,3 s fin-de-habla→pegado en PC; ~3,5 s por frase desde el celular; ganancia manual; icono se reinstala; «en espera» sigue capturando | Demonio residente, ajuste automático de micrófono, instalador de un paso, UI de datos personales |
| Reuniones y asesoría de ventas | Parcial | `lote` demostrado solo con voces sintéticas; sin solape; asesor con 8 pruebas y ningún caso real con veredicto; AISIA Fase 0 sin firma | AISIA firmada, 3 reuniones medidas, PyanNet pineado, golden set del asesor, acta exportable |
| Atención al cliente (llamadas, FAQ) | Demostrable, no lista | Sin captura de llamada real; sentimiento e intención por reglas; el cliente es tercero afectado | Captura de dos canales tras C3 + AISIA propia; corpus con consentimiento |
| La máquina habla (audiolibro, picking, FAQ por voz) | Lista en demo | TTS por proceso: ~1 s fijo por respuesta; sin barge-in aunque `voz` lo emite; altavoz solo Windows | TTS en el demonio, barge-in, gramática de números para picking |
| Educación y evaluación (clases, competencias) | Parcial | Muletillas contadas sobre la salida de Parakeet, que tiende a omitirlas: métrica sin medir; lote largo sin progreso visible; alumnos pueden ser menores | Medir contra conteo manual, progreso en vivo, AISIA si hay menores |
| Campo y manos libres (EPI, celular en la calle) | No medida | WER con ruido desconocido; red obligatoria hacia la PC | Corpus propio con ruido y tabla; auto-ganancia; el modo sin red queda fuera |

## Plan de mejora por etapas

Formato: problema medido → propuesta → criterio de hecho → gate → tamaño → quién.
«Agente» = lo hace un agente solo; «Firma» = exige firma humana.

### Etapa 0 — Fundamentos (sirven a los dos destinos)
- **0.1 Demonio local de transcripción.** 3 s por petición → `en-vivo.mjs` levanta también
  `servicio/servidor.mjs` en `127.0.0.1` con el token móvil como Bearer; la ruta móvil y
  `dictado-cli.ts` del laboratorio decodifican con ffmpeg a PCM16 y llaman a
  `creaTranscriptorRemoto` (`@tu-scope/dictado/remoto`); si `/health` no responde, caen al CLI
  por proceso. `maquina.mjs piezas` añade `demonio` y el laboratorio lo pinta. Criterio: p50 de
  una frase de 4 s < 800 ms (hoy ~3,5 s). Gate: ninguno nuevo (loopback + Bearer; anotar en
  `docs/SDD-dictado.md` §7). **M · Agente.**
- **0.2 Un solo motor residente, solo si la RAM aprieta.** Dos Parakeet en RAM (1,5 GB cada uno)
  → extraer `conRespaldo` y `conPuertaDeEnergia` de `cli-dictar.ts` a un módulo compartido y
  que `dictar --motor remoto` use el demonio. Criterio: RAM < 2 GB, motor +50 ms como máximo.
  Gate: bitácora C1. **S · Agente.**
- **0.3 Trayectorias del dictado.** Nadie alimenta la línea `herramientas` → al cerrar `dictar`
  se escribe `tools/dictado/corpus/salida-<fecha>/trayectoria.json` con FORMA: turnos, sin voz,
  descartados por energía, muletillas, veces del respaldo, p50/p95 de latencia, `msMotor`,
  `msPegado`, pico dBFS, muertes de ffmpeg, duración, motor y flags. `mide.mjs` emite lo mismo
  con WER. Criterio: `trayectorias:ingesta` la ve, `verifica` pasa (cero texto), el informe
  muestra latencia p50 por semana. **M · Agente.**
- **0.4 Laboratorio con WER.** Veredictos cualitativos → campo «texto de referencia» en el panel
  de transcribir y WER/CER con `tools/dictado/src/texto/wer.ts`; el veredicto guarda rol del
  probador, dispositivo y métricas; `informeMarkdown` lista WER por caso. **S · Agente.**
- **0.5 Lógica de negocio y AISIA Fase 0.** `BUSINESS_LOGIC.md` vacío y datos del prospecto sin
  AISIA → entrevista `/new-app` (persona: vendedor en campo; tercero: prospecto; KPI: tiempo de
  acta y score coincidente) y borrador con `.claude/gobernanza/plantillas/aisia.md` (retención
  cero de audio, acta local y borrable, consentimiento, el asesor edita el acta). Criterio:
  `BUSINESS_LOGIC.md` sin la marca de plantilla; AISIA con firma y fecha. **C4 · Firma.**
  Bloquea 1.7 con voces de terceros reales, no con grabaciones propias o sintéticas.

### Etapa 1 — Piloto interno medible (dictado diario + reuniones de ventas)
- **1.1 Corpus propio con referencia.** Todo el WER es FLEURS leído → 30 frases con nombres
  propios, cifras y jerga, grabadas con `dictado dictar --graba` en PC silencio, PC ruido y
  celular, con referencia escrita; `dictado archivo` + `wer.ts` → tabla «medido con voz propia»
  en el README. **S · Agente prepara; se graba con voz propia.**
- **1.2 Calibrar VAD y puerta de energía.** Umbrales heredados y −45 dBFS a ojo → barrido sobre
  1.1. Criterio: < 1 % frases partidas, 0 sílabas comidas, 0 turnos fantasma; `DEFECTOS_DICTADO`
  cita la tabla. Gate: bitácora C1. Se valida con la segunda voz de 1.7 antes de fijar. **S.**
- **1.3 Corrección del diccionario, medida.** On/off sobre 1.1; se enciende solo si aciertos
  ≥ 10× errores; si no, sigue apagada con cifra en el README. Gate: bitácora. **S · Agente.**
- **1.4 Micrófono que se ajusta solo.** Los 2 s de pico que `cli-dictar.ts` ya mide deciden la
  ganancia para caer en [−20, −6] dBFS; si sigue fuera, el icono parpadea ámbar con aviso en
  palabras. Criterio: 0 sesiones fuera de [−45, −3] en las trayectorias de la semana 2. **S.**
- **1.5 «En espera» sin micrófono abierto.** Parar ffmpeg en `inactivo` y relanzar al alternar.
  Criterio: sin proceso de captura en espera; primer turno < 500 ms extra, o se documenta. **S.**
- **1.6 UI de datos personales.** Diccionario, snippets e historial por CLI → página (o pestaña
  del laboratorio) sobre `maquina.mjs` con órdenes `diccionario-*`, `snippets-*`,
  `historial-lee/corrige`, usando el lazo `corrige()` de `src/historial.ts` para proponer
  candidatos. Criterio: quien prueba añade un término y corrige un dictado sin terminal. **M.**
- **1.7 Reuniones de ventas medibles.** (a) 3 reuniones simuladas (dos personas con
  consentimiento, o dos voces propias mezcladas) → `lote --hablantes 2` → asesor → acta
  Markdown descargable desde el panel de reunión. Criterio: turnos del asesor bien etiquetados
  ≥ 90 %, WER < 10 %, proceso < 0,15× la duración. **M · Agente.** (b) Solape: pinear
  `segmentation-3.0.onnx` en `mide.mjs`, `lote --solape` con `creaDiarizadorPorSegmentacion`
  y `tramosSolapados` de `voz`; el caso 9 pierde la nota «no ve dos a la vez». **C1 · Firma.**
  (c) Registro «yo = asesor» con `creaRegistroHablantes`, solo la voz propia: registrar
  terceros es biométrico y espera AISIA. **S · Agente.**
- **1.8 Golden set del asesor.** 8 pruebas sin veredicto humano → 5 transcripciones propias con
  score esperado (±10) por quien prueba y huecos esperados como regresión estilo C2. Criterio: 4 de 5 en margen;
  si no, se ajusta el playbook con entrada en bitácora. **S · Agente, veredicto humano.**
- **1.9 Celular tras el demonio.** `/dictar` muestra «motor listo / arrancando» leyendo el
  estado; medir fin-de-toque→texto. Criterio: p50 < 1,5 s en LAN, «sin voz» < 5 %. **S.**

### Etapa 2 — Listo para terceros (se compila como goal aparte con los datos del piloto)
- **2.1 Instalador de máquina nueva** (`dictado instala`): comprueba Node, ffmpeg, WSLg;
  descarga solo pesos pineados (sin corpus, ≤ 1,8 GB); Python solo si se pide respaldo;
  icono; token; URL del celular. Criterio: máquina limpia operativa en < 20 min con ≤ 6
  acciones humanas, medido. Instalar en máquina ajena dispara «herramienta» según
  `docs/CREAR-UNA-HERRAMIENTA.md`; **publicar = Firma.** **L.**
- **2.2 Icono que se actualiza solo** (versión en `%LOCALAPPDATA%\dictado\`). **S.**
- **2.3 Red del celular con dos caminos** (Tailscale recomendado; LAN con `red-movil.ps1` y
  certificado) probados por Playwright. Exponer fuera de LAN: **C3 · Firma.** **S.**
- **2.4 Plataformas.** Linux de escritorio solo si un tercero lo pide (falta un `Pegador`);
  macOS no se porta. **M.**
- **2.5 `dictado diagnostico`** (versión, piezas, pico, `/health`, log sin texto). **S.**
- **2.6 Retención y borrado** (`historial --borra`, retención configurable, documento). **S.**
- **2.7 GPU/VPS** sigue sin medir hasta tener hardware; exponerlo es **C3 · Firma.**

### Etapa 3 — Casos ampliados
- **3.1 Llamadas** con captura de dos canales en vivo: **C3 + AISIA propia + aviso legal · Firma. L.**
- **3.2 Demonio que habla** (`/sintetizar` residente + barge-in con `inicioHabla`): vuelta
  pregunta→respuesta < 1 s en FAQ y picking. **M · Agente.**
- **3.3 Picking**: gramática de números y reintento; 20 líneas, 0 confirmaciones erróneas. **S.**
- **3.4 Educación**: medir muletillas contra conteo manual; menores exigen **AISIA · Firma. M.**
- **3.5 Campo**: corpus con ruido real y tabla; auto-ganancia ya de 1.4. **S.**
- **3.6 LLM (Fase 4), Zoom/Meet, role-playing**: solo tras AISIA firmada y seudonimización o
  pesos propios; el enchufe `Limpiador` de `posproceso.ts` existe sin proveedor. **Firma.**

## Qué se mide en el piloto interno (semanas 1 y 2)

| Métrica | Cómo se captura | Umbral propuesto |
|---|---|---|
| Latencia fin-de-habla→pegado p50/p95 (sin el primer pegado) | trayectoria de `dictar` (0.3) | p50 < 700 ms · p95 < 1,5 s |
| `msMotor` p50 en frases ≤ 5 s | trayectoria | < 400 ms |
| WER/CER con voz propia (PC limpio, PC ruido, celular) | corpus 1.1 + laboratorio 0.4 | < 6 % limpio · < 12 % ruido/celular; se refija tras la primera tabla |
| Frases partidas · sin voz · descartados por energía | trayectoria | partidas < 1 % · sin voz < 5 % |
| Veces que entró el respaldo | trayectoria | < 5 % de turnos |
| Sesiones muertas por ffmpeg | trayectoria + log | 0 por semana |
| Pico dBFS por sesión | trayectoria | 100 % en [−45, −3] |
| Veces que hubo que abrir una terminal | una línea diaria de quien prueba | 0 desde el día 3 |
| Celular: fin-de-toque→texto p50 · «sin voz» | `/dictar` devuelve `ms`; veredicto del caso 18 | < 1,5 s · < 5 % |
| Reuniones simuladas: turnos correctos, WER, score ±10, tiempo/duración | `lote` + acta + veredicto humano | ≥ 90 % · < 10 % · 4/5 · < 0,15× |
| Veredictos del laboratorio | `veredictos.jsonl` + informe | 20 casos con veredicto; ≥ 13 «funcionó» |

Regla: cada cifra con su fuente; el verde nunca tapa la cifra.

## Firmas humanas, riesgos y lo que no se hará

**Firmas:** 0.5 (BUSINESS_LOGIC + AISIA Fase 0) · 1.7b (CDC del modelo PyanNet) · 2.1 publicar
· 2.3 y 2.7 exponer fuera de LAN · 3.1 llamadas · 3.4 menores · 3.6 LLM. Todo lo demás lo hace
un agente solo, con entrada en bitácora cuando toca parámetros (1.2, 1.3, 1.8).

**Riesgos:** dos modelos en RAM tras 0.1 (0.2 lo resuelve si hace falta); el demonio es
superficie nueva (loopback + Bearer, documentado en SDD §7); umbrales calibrados con una sola
voz sobreajustan (se validan con la segunda voz antes de fijar); 30 frases dan intervalos
anchos (la tabla lleva n); el laboratorio como único banco de prueba sesga (Etapa 2 exige un tercero).

**No se hará, y por qué:** streaming parcial (Parakeet offline; a < 600 ms por frase no hace
falta, se da señal de escucha y nivel); LLM antes de AISIA + seudonimización o pesos propios;
bot en Zoom/Meet; nube de terceros para audio; port a macOS (sflow existe); modo sin red en el
celular (modelo en el teléfono: otra herramienta); medir GPU sin hardware; registrar voces de
prospectos (biométrico de tercero, infirmable con C5); publicar antes de que un tercero instale.

## Verificación del plan una vez ejecutado

- `npm run validate` en verde con los pasos nuevos (trayectoria del dictado verificada sin contenido).
- Latencia antes/después medida con la misma frase de 4 s por la ruta móvil y por el laboratorio.
- `npm run trayectorias:informe` muestra la latencia p50 del dictado por semana.
- Laboratorio: WER visible en el panel y en el informe; capturas por `scripts/laboratorio-voz/captura.mjs`.
- Acta de reunión exportada y tabla de las tres reuniones con los umbrales de la sección de métricas.
- Borradores de `BUSINESS_LOGIC.md` y de la AISIA presentes y marcados como pendientes de firma.

## Archivos críticos

- `tools/dictado/servicio/servidor.mjs` y `configuracion.mjs` — base del demonio local (0.1, 0.2, 3.2)
- `tools/dictado/src/node/cli-dictar.ts` — trayectoria de sesión, auto-ganancia, espera sin micrófono
- `tools/dictado/scripts/en-vivo.mjs` — arranque del demonio junto al pipeline
- `src/features/laboratorio-voz/services/servidor/dictado-cli.ts` — cliente remoto con caída al CLI; WER
- `src/app/api/dictado/movil/route.ts` — ruta del celular sobre el demonio
- `scripts/laboratorio-voz/maquina.mjs` — piezas + demonio, órdenes de datos personales, veredictos con métricas
- `tools/dictado/src/texto/wer.ts`, `src/historial.ts`, `tools/voz` (`creaDiarizadorPorSegmentacion`, `tramosSolapados`, `creaRegistroHablantes`) — piezas que se reutilizan
- `BUSINESS_LOGIC.md`, `.claude/gobernanza/plantillas/aisia.md` — los borradores para firma
