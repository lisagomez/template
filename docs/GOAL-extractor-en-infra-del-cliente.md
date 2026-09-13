# Extractor documental en la infraestructura del cliente — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-13. Este archivo es el spec completo; el bloque
> `/goal` corto que se pega en la sesión apunta aquí por ruta absoluta.
>
> Continúa `docs/GOAL-corpus-a-modelo.md` (spec 008, cerrada) y la spec 009 (identificadores y
> códigos, cerrada). Retoma la spec 005 (A2A, **0 de 16 tareas**) con la capacidad real que
> `docs/SDD-puente-a2a-extractor.md` ya diseñó. El grafo del sistema vive en
> `docs/grafos/extractor-en-infra-del-cliente.json` y el plan de orquestación de §GRAFO se
> derivó de él con `grafo2plan.py`, no a mano.

## MISION

Que un cliente que instala este template en **su propio VPS** —el proveedor lo elige él después,
y el template no lo asume— tenga, con un `docker compose up`, un servicio de extracción
documental que:

1. **Lee cada documento por la vía que le corresponde, y solo esa.** PDF con capa de texto: capa
   0, sin motor y sin coste. XML fiscal: lector con registro de esquemas, exacto. Códigos QR y
   de barras: primero, porque son deterministas. Texto impreso en imagen: **Tesseract por zonas
   sobre Pillow** (ya integrado en `motores/proceso-local`, medido a **197 páginas por minuto
   en CPU** sobre 84 páginas reales). Y solo lo que Tesseract no resuelve —por la regla medida
   «clase con identificador esperado que ni código ni OCR dieron, o identificador que no pasó
   el checksum»— va a un modelo de visión especializado en documentos (GLM-OCR o PaddleOCR-VL
   por vLLM), que en CPU cuesta entre 150 y 331 segundos por página y con GPU es otro mundo. El
   cliente no elige motor: el servicio detecta la GPU y hace el resto.

   **La GPU se considera un servicio del VPS, no una rareza.** El stack la contempla desde el
   diseño: un servicio de inferencia en el compose con reserva de dispositivo, su propia imagen
   pineada, su límite de memoria de vídeo, su health y su lugar en la medición de
   `configura:deploy`. Un cliente que contrata un VPS con GPU la ve trabajando con el mismo
   `docker compose up`; uno sin GPU arranca igual, con la cola en CPU y el servicio de GPU
   declarado como «no disponible en esta máquina», nunca como error.

2. **Mejora la confianza donde la confianza se puede mejorar de verdad.** Hoy la confianza de
   Tesseract no está calibrada (el preprocesado la movió entre 0 y 3 puntos; los modos que la
   «suben» leen la mitad de palabras) y el motor de visión devolvía una constante. El sistema
   deja de tratar la confianza como un número del motor y la construye por **capas de
   evidencia**: el código leído (confianza 1), el dígito verificador (el valor puede existir),
   la corroboración entre dos lecturas (`corrobora`), y solo al final la estimación del motor.
   Cada campo dice **de qué evidencia sale su confianza**, y un consumidor puede filtrar por eso.
   Si tras medir la correlación confianza-error el motor no da señal, se declara y **no se fija
   umbral**: TAR-17 y TAR-25 de la spec 007 se cierran con un número medido o con «sin señal»,
   nunca con un default.

3. **Separa dos rendimientos que hoy se confunden**: la **latencia por documento** (un usuario
   sube una factura y espera: p50 y p95, por etapa) y el **rendimiento de lote** (páginas por
   minuto de un corpus nocturno). Se miden por separado, en la máquina del cliente, con
   `configura:deploy` midiendo CPU, RAM, y la GPU como un recurso más: modelo, memoria de vídeo,
   driver y runtime de contenedores. El servicio elige concurrencia y perfil a partir de eso.
   Nada se promete que no se haya medido en ese hardware, y la medición se hace en las dos
   configuraciones si hay dónde: solo CPU, y CPU más GPU.

4. **Clasifica cada página y la estructura en JSON con esquema por clase.** `clasifica-pagina`
   ya existe sin clases embarcadas; aquí cada clase declara su esquema JSON (Zod en la
   frontera, y `guided_json` cuando la cola va por vLLM, para que el JSON válido sea propiedad
   del decodificador y no promesa del modelo). La salida se valida contra los tipos del
   extractor (`CampoExtraido`, `PaginaExtraida`) en una prueba, como ya hace `salida-json.ts`.
   Un documento que no encaja en ninguna clase sale declarado como tal, no forzado.

5. **Se ofrece a otros agentes por A2A** con la Agent Card de dos skills del SDD (extracción
   con confianza por campo; lectura de XML sin verificar sello), JSON-RPC y Tasks con
   `@a2a-js/sdk` pineado, tres rutas exactas y prueba de opacidad que **enumera** la superficie.
   El puente escucha **solo en la red interna de compose**. Exponerlo fuera es un CDC con C3 y
   C4 y gate humano (spec 005 RF-12): este trabajo lo deja listo, no lo abre.

6. **Hermes lo consume.** `nousresearch/hermes-agent`, pineado por digest como ya hace
   `docs/FASE0-INFRAESTRUCTURA.md`, corre como servicio del mismo compose, descubre la Card y
   pide una extracción. Hermes **no tiene las llaves del extractor** ni del almacén: le llega
   una respuesta con confianza por campo y `revision_humana`, y eso es todo lo que sabe.

7. **Mistral se queda como adaptador opt-in, apagado por defecto.** Es una API externa: el
   documento sale del perímetro. Un cliente cuyos documentos **no** lleven datos de terceros
   puede activarlo con una decisión de flujo de datos escrita (C4). Un cliente cuyos documentos
   sí los lleven, no puede, y ninguna firma lo autoriza (límite de C5). El servicio no decide
   eso: lo declara y exige la decisión.

Nivel de referencia: las plataformas de inteligencia documental autohospedables que ofrecen
extracción con linaje por campo como capacidad para agentes. Con una diferencia que aquí es
requisito: el cliente se lleva el stack entero a su máquina, con el proveedor que quiera, y el
byte no sale.

## ANALISIS DE MOTOR (hecho, no pendiente: lo que la medición ya dijo)

La pregunta de origen era «¿cuál es la mejor opción, y se puede integrar pytesseract?». La
respuesta está medida en el repo y el agente no debe re-litigarla sin números nuevos:

| Motor | Estado en el repo | Medido | Papel que le toca |
|---|---|---|---|
| Tesseract 5.5 por zonas (pytesseract + Pillow; Leptonica va dentro de Tesseract) | `motores/proceso-local` + `motores-locales/tesseract.py` | 197 pág/min en CPU; RFC 4/4 expedientes con zonas + QR + checksum; NSS del alta IMSS **no lo lee** (falta zona propia) | **Base en CPU.** Es el motor por defecto de un VPS sin GPU |
| GLM-OCR 0,9B (Ollama, CPU) | `motores/openai-compat`, modo transcripción | 74 s por página en caliente (65 s codificando la imagen); 150-331 s en frío; transcribe exacto, **no obedece** un esquema | **Cola** bajo la regla A∪C. En GPU con vLLM y lote continuo cambia de categoría |
| PaddleOCR-VL 1.5 | citado en README, no medido aquí | empatado con GLM-OCR en OmniDocBench (0,1 puntos) | Candidato de cola; se decide midiendo sobre el corpus del cliente |
| Qwen2.5-VL 3b/7b | medidos | 8 min por página; el 3b no cierra el JSON con contexto 4096 | Descartados como motor; sirven de evidencia de que el contexto del servidor es parte del motor pineado |
| Mistral OCR 4.1 (API) | `motores/mistral` | contrato verificado; calidad en manuscrito no medida; el dato sale del perímetro | **Opt-in con decisión C4 escrita**; nunca default |
| RapidOCR | `motores-locales/rapidocr.py` mencionado como no medido | — | Solo si el agente lo mide contra la base; si no, sigue «no medido» |

Dónde **sí** queda margen de mejora, y dónde no:

- **No** en preprocesado de imagen genérico: medido, mueve 0-3 puntos de confianza. No gastar ahí.
- **Sí** en zonas nuevas (NSS en el alta del IMSS, etiqueta en formulario), en leer primero
  los códigos, y en el orden determinista → estimado → cotejo. Ahí es donde subieron los
  identificadores válidos de 1/4 a 4/4.
- **Sí** en la cola: hoy se paga el motor caro en 6 de 72 páginas con 4 aciertos. Con GPU y
  lote continuo, la misma regla cuesta segundos, no minutos.
- **Sí** en no mandar al motor lo que no lo necesita: en el corpus de medición más de la mitad
  de los documentos salió por capa 0 o XML.

## LIBERTAD TECNICA

Tú eliges la forma del servicio OCR (un proceso Python detrás de HTTP, un sidecar, un worker de
cola), el servidor de inferencia para la cola (vLLM, SGLang, Ollama), cómo se detecta la GPU y
se elige el perfil, la cola de trabajos y su reanudación, cómo mide `configura:deploy`, y cómo se
integra Hermes como consumidor. Probablemente sabes mejor que yo qué conviene. Cualquier
tecnología nombrada en este spec es sugerencia descartable, NO requisito, salvo la sección
RESTRICCIONES REALES. Optimiza por el mejor resultado posible, no por el camino más corto.

Lo que **ya existe y se reutiliza tal cual**, en `tools/extractor-documental/`:

- Los tres adaptadores de motor y su barrera común (`src/motores/comun.ts`): la validación de
  salida vive ahí y no se duplica.
- Capa 0, XML con registro de esquemas, lector de códigos (`lectores/zxing`), validadores de
  RFC/CURP/NSS, clasificación de página, flujo por página (`lote-pagina.ts`), lote de corpus
  con enrutado por bytes (`lote-corpus.ts`), regla `reglaFaltaIdentificador`.
- Corroboración (`corrobora`, `exigeRevision`), calibración (`cer`, `wer`,
  `correlacionConfianzaError`, `curvaDeUmbral`), salida JSON validada (`pruebas/salida-json.ts`).
- Medición: `medicion/expedientes.mjs`, `medicion/corpus.mjs`, `medicion/mide.mjs`.
- El diseño del puente A2A entero: `docs/SDD-puente-a2a-extractor.md`, con las constantes del
  SDK ya introspeccionadas (`AGENT_CARD_PATH` sin barra inicial, `A2A_CONTENT_TYPE`,
  `JsonRpcTransportHandler` sin Express). La skill `/add-a2a` y su entrevista de cuatro preguntas.
- El compose de producción (`docker-compose.yml`, `Dockerfile`, `scripts/configura-deploy.mjs`)
  y el patrón de Hermes pineado por digest en `docs/FASE0-INFRAESTRUCTURA.md`.

Lo que **no existe y es el corazón del trabajo**: el servicio OCR como contenedor con perfil de
GPU opcional; la confianza por capas de evidencia expuesta por campo; la separación medida de
latencia y rendimiento; el esquema JSON por clase; el puente A2A implementado (no diseñado); y
Hermes consumiéndolo en la misma red.

## INVESTIGA ANTES DE CONSTRUIR

- Lee entero `docs/SDD-puente-a2a-extractor.md`, `docs/INVESTIGACION-OCR-OPENSOURCE.md`
  §3-§5, `docs/SDD-extractor-documental.md` §2.23-§2.24, las tareas de las specs 005, 007
  (TAR-17, TAR-25, TAR-34) y 009 (TAR-9, TAR-10, TAR-14), y las reglas de `AGENTS.md`.
- Introspecciona `@a2a-js/sdk` instalado, no una lectura del proto (RF-4 de la spec 005 ya
  cazó dos errores del SDD por esa vía). Pinea la versión resuelta.
- Investiga 2-3 referencias world-class de servicio OCR contenedorizado con GPU como servicio
  (reserva de dispositivo en compose, runtime de contenedores para GPU, vLLM o SGLang con lote
  continuo), y de cómo un agente A2A consume una capacidad con incertidumbre por campo. Decide a
  partir de eso.
- Para la cola en GPU, mide antes de elegir entre GLM-OCR y PaddleOCR-VL; la diferencia
  publicada es ruido.

Reafirma el objetivo en una línea antes de cada edición grande para no derivar.

## GRAFO DEL SISTEMA (es un grafo, y por qué)

Se aplicaron las cuatro preguntas de `loop-vs-grafo`. Hay contextos especializados de verdad
(un servicio Python contenedorizado, un puente TypeScript en Next, infraestructura de compose,
medición sobre corpus), fan-out y fan-in reales (OCR y A2A se construyen en paralelo y convergen
en el stack y en la demo), el flujo se lee como diagrama, y el criterio de éxito cambia por nodo
(páginas por minuto, prueba de opacidad, arranque sin GPU). Y falla el test de colapso: si un
solo agente lo hiciera en secuencia, las corridas de medición en CPU (10 a 25 minutos cada una)
bloquearían el trabajo del puente, y la prueba de opacidad la firmaría quien escribió el puente,
que es el auto-sello que la spec 005 (TAR-15, TAR-16) prohíbe. **Es un grafo.** Cada nodo es un
loop con su propio comando de validación.

Nodos = artefactos; aristas = transformaciones tipadas; lazos = comparadores con referencia.
Fuente: `docs/grafos/extractor-en-infra-del-cliente.json`.

```
repo ──agente──► spec-010 ──┬──mixta──► servicio-ocr ──┬──script──► medicion ──mixta──► calibracion ──┐
     ──manual──► corpus ────┼──────────────────────────┘                                              │
                            └──mixta──► puente-a2a ─────┬──mixta──► stack-cliente ──mixta──► hermes ──┤
                                    servicio-ocr ───────┘                                             ▼
                                                                                              demo punta a punta
                                                                                                      │
                                                                                      ══ GATE HUMANO: exponer ══
```

### Plan de orquestación (derivado por `grafo2plan.py`, no a mano)

**Fase 1 · en paralelo**
- `spec-010`: redactar spec/plan/tareas desde el SDD del puente y las specs 005/007/008/009.
  Gate: `npm run verifica:specs` en verde.
- `corpus`: checkpoint humano. Corpus estratificado, ≥100 páginas, fuera del repo. Sin él, toda
  cifra de las fases siguientes se marca **no concluyente** y se dice.

**Fase 2 · en paralelo**
- `servicio-ocr`: empaquetar los motores existentes como servicio (imagen, health mudo, sin
  credenciales) y añadir la cola VLM por perfil. Gate: `npm run prueba` y `pruebas/contrato.ts`
  en verde, y la imagen arranca en una máquina **sin** GPU.
- `puente-a2a`: TAR-1 a TAR-11 de la spec 005 con el extractor como capacidad real. Gate: prueba
  de opacidad (rutas == card, rpc, health), health devuelve exactamente `{"status":"ok"}`,
  content-type `application/a2a+json`, SDK pineado. **La prueba de opacidad la revisa un agente
  distinto del que escribió el puente.**

**Fase 3 · en paralelo, con dos convergencias**
- `medicion` ← corpus + servicio-ocr (convergencia: un solo worker, para que ninguna corrida se
  pierda en silencio). Páginas por minuto, p50/p95 por documento, CER, campos correctos, coste
  por página; con y sin GPU si hay dónde medir GPU, y si no, se dice. Gate: toda cifra sale de
  una corrida real con hardware declarado, comparada contra la base de 197 pág/min.
- `stack-cliente` ← servicio-ocr + puente-a2a (convergencia: un solo worker). Servicios `ocr`,
  `ocr-gpu` (inferencia con reserva de dispositivo, imagen pineada, límite de memoria de vídeo,
  health) y `hermes`; A2A solo en la red interna; ningún puerto nuevo publicado por Caddy.
  `configura:deploy` mide la GPU como un recurso más del VPS, junto a CPU y RAM, y escribe su
  configuración. Gate: `docker compose config` válido, arranque sin GPU con el servicio de GPU
  declarado como no disponible, y arranque con GPU si hay dónde probarlo.

**Fase 4 · en paralelo**
- `calibracion` ← medicion: `correlacionConfianzaError` y `curvaDeUmbral`; esquema JSON por
  clase de página con Zod. Gate: si la correlación es ~0, **no** se fija umbral y se declara.
- `hermes` ← stack-cliente: Hermes pineado por digest como servicio, descubre la Card, sin
  llaves del extractor ni del almacén.

**Fase 5 · convergencia final**
- `demo` ← hermes + calibracion: documento → Hermes → A2A → extractor → JSON validado, con
  tiempo por etapa. Gate: JSON validado contra los tipos; la confianza por campo sobrevive al
  protocolo; tiempos pegados.
- **Gate humano, fuera del agente**: exponer la Card fuera de la red interna.

Reglas del grafo: un nodo se declara cerrado solo con su gate en verde pegado; dos agentes
coexisten solo si escriben artefactos disjuntos; un merge que tira una fuente en silencio es el
fallo que más cuesta detectar, así que las convergencias van a un solo worker.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación. No corre comandos ni lee archivos. Todo lo de abajo se
**pega** en el transcript, no se afirma:

1. **La spec 010 existe y pasa su gate.** `.claude/specs/010-<nombre>/` con `spec.md`,
   `plan.md` y `tareas.md`, EARS, «Impacto sobre terceros» y el modelo de amenazas de la
   superficie A2A. Output de `npm run verifica:specs` en verde pegado.

2. **El servicio OCR arranca en Docker sin GPU** y su health devuelve exactamente
   `{"status":"ok"}`. Output de `docker compose --profile ocr up` y del health pegados.

   **Y la GPU como servicio del VPS está contemplada y demostrada**: el servicio `ocr-gpu`
   aparece en `docker compose config` con su reserva de dispositivo, imagen pineada y límites;
   `configura:deploy` pegado mostrando qué detectó de GPU (modelo, memoria de vídeo, runtime) o
   que no hay; y en una máquina con GPU, el servicio arrancando, su health, y la cola pasando
   por él con los tiempos pegados. Si no hubo máquina con GPU donde probar, se dice
   explícitamente y queda como no medido, no como hecho.

3. **Latencia y rendimiento, medidos por separado y en hardware declarado.** Tabla pegada:
   p50/p95 por documento y por etapa (clasificar, capa 0 / XML / códigos / Tesseract / cola),
   y páginas por minuto de lote, comparadas contra la base de 197 pág/min. Con corpus <100
   páginas, la tabla lleva la marca «no concluyente».

4. **La confianza por capas de evidencia.** Un JSON de salida pegado donde cada campo dice de
   qué evidencia sale su confianza (código / checksum / corroboración / motor), y la
   correlación confianza-error del motor pegada con su conclusión: umbral medido, o «sin señal,
   sin umbral». TAR-17 y TAR-25 cerradas con una de las dos.

5. **Clasificación y esquema JSON por clase.** Para al menos tres clases de página, el esquema
   declarado y un documento real o sintético saliendo por él; y un documento que no encaja
   saliendo **declarado** como sin clase. La prueba que valida contra los tipos del extractor,
   en verde, pegada.

6. **El puente A2A funciona y es opaco.** Output pegado de: la Agent Card servida en la ruta
   que exporta el SDK; una llamada JSON-RPC que crea un Task y devuelve campos con confianza;
   la prueba de opacidad que enumera rutas y exige igualdad; y la versión pineada del SDK. La
   revisión de opacidad viene de un agente distinto del autor, y lo dice.

7. **Hermes consume la capacidad.** Log pegado de Hermes descubriendo la Card y recibiendo una
   extracción, en la red interna del compose, con la imagen pineada por digest. Y la evidencia
   de que Hermes no tiene ninguna llave del extractor: su `env_file` pegado con valores
   enmascarados (presente/ausente, nunca el valor).

8. **Nada publicado al edge.** `docker compose config` pegado mostrando que solo Caddy publica
   puertos, y ninguno de OCR, A2A ni Hermes.

9. **Mistral apagado por defecto y declarado.** La configuración que lo activa exige una
   decisión de flujo de datos escrita; el arranque sin ella lo muestra como «no disponible:
   requiere decisión C4», pegado.

10. **El último output de `npm run validate` en verde, pegado.** Y `npm run prueba` de la
    herramienta, y `npm run empaqueta extractor-documental` instalando el tarball en un
    proyecto limpio.

11. **Reporte de decisiones**: forma del servicio, servidor de inferencia de la cola, cómo se
    detecta la GPU, cómo se separaron latencia y rendimiento, cómo se integró Hermes, y qué se
    descartó y por qué.

12. **Lista las formas en que podría estar mal o incompleto, y resuélvelas** antes de declarar
    hecho. En particular: una confianza que parece calibrada y no lo está; un JSON que encaja
    por casualidad; una ruta del puente que nadie enumeró; un documento que se pierde en la
    cola; un puerto que se publicó «para probar».

## COMANDO DE VALIDACION

Infraestructura conocida, comandos exactos:

```
npm run validate                                    # raíz: el gate completo
cd tools/extractor-documental && npm run prueba     # la herramienta
docker compose config                               # el stack, sin levantarlo
```

Cada nodo del grafo declara además su propio comando en su primer checkpoint (por ejemplo, la
prueba de opacidad para el puente, y el script de medición para el servicio). Córrelo tras cada
cambio grande y **pega su output**. Es el latido de cada loop; sin él, treinta turnos de deriva
pasan desapercibidos.

## RESTRICCIONES REALES

No negociables. Todo lo demás es libre.

- **El template no asume proveedor de VPS.** Nada en el compose nombra uno.
- **La GPU se considera dentro de los servicios del VPS.** El stack la contempla como servicio
  propio (inferencia con reserva de dispositivo, imagen pineada, límites y health) y
  `configura:deploy` la mide como un recurso más. Y sigue arrancando en una máquina sin GPU:
  ahí el servicio de GPU se declara no disponible y la cola va por CPU. Contemplarla no es
  exigirla.
- **Los documentos pueden llevar datos de terceros. Por defecto ningún byte sale del
  perímetro.** Mistral y cualquier API externa de visión quedan **apagados** y solo se activan
  con una decisión de flujo de datos escrita (C4). Si los documentos llevan datos de terceros,
  ninguna firma lo autoriza (límite de C5) y no se ofrece la vía del registro de riesgo.
- **El puente A2A no se expone fuera de la red interna.** Exponerlo es un CDC con modelo de
  amenazas (C3), AISIA (C4) y gate humano (spec 005 RF-12). Este trabajo lo deja listo y cerrado.
- **Hermes no tiene llaves.** Ni del extractor, ni del almacén, ni `service_role`. Recibe
  respuestas, no credenciales.
- **La superficie del puente son exactamente tres rutas**, y la prueba lo enumera. Health mudo.
- **El núcleo del extractor sigue sin dependencias** y `pruebas/contrato.ts` lo vigila. El
  servicio contenedorizado envuelve los adaptadores; no los reescribe ni duplica la barrera.
- **Los umbrales se miden, no se inventan.** Sin señal, sin umbral, y se declara.
- **El modelo, la imagen de Hermes y el SDK van pineados.** Alias autoactualizables se rechazan
  al construir (C1). El contexto del servidor de inferencia es parte del motor pineado.
- **Los documentos reales no entran al repositorio.** Fixtures sintéticos, y lo dicen.
- **Un documento que no se pudo procesar se declara, no desaparece.**
- **Cambiar `AGENTS.md`, un skill, un prompt o la configuración del agente es un CDC** con su
  propio gate, fuera de este loop. Si hace falta, se propone; no se hace dentro.

## RED DE SEGURIDAD

Si tras 50 turnos no converge, detente y reporta el bloqueo con precisión: qué nodos del grafo
están cerrados con gate en verde, cuáles no, y qué lo impide. Un reporte honesto de bloqueo vale
más que un «hecho» en falso.

Y dos límites que no son de turnos: **si el único camino para avanzar exige sacar un documento
del perímetro, o publicar el puente al edge, para y repórtalo.** No hay atajo ahí.
