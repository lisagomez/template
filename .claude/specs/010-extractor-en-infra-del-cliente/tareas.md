# Tareas 010 — El extractor en la infraestructura del cliente

> Orden por fases del grafo. Cada tarea cierra con evidencia pegada en la sesión, no con una promesa.
> Cifras de FORMA sobre corpus sintético; el corpus real del cliente no existe todavía (RF-24).

## Fase 1 — Spec y corpus

- [x] **TAR-1 · Spec, plan y tareas** (este directorio). `npm run verifica:specs`: 91/91 en verde.
- [ ] **TAR-2 · Corpus estratificado** (checkpoint humano). **No existe en este entorno.** Se midió
      con el corpus sintético (`medicion/genera-corpus.py`, 21 documentos) más 12 XML de fixtures:
      33 páginas, marcadas NO CONCLUYENTE. Hallazgo por el camino: los RFC sintéticos llevaban el
      dígito verificador mal y los validadores los mandaban a revisión, con razón; el generador
      ahora calcula el dígito con la tabla del SAT.

## Fase 2 — Servicio OCR y puente A2A (en paralelo)

- [x] **TAR-3 · Evidencia de la confianza** (`src/evidencia.ts`, `pruebas/evidencia.ts`): cinco
      evidencias, `revisionHumana` sale de la evidencia y el proyecto solo puede ampliar el conjunto.
- [x] **TAR-4 · Esquema JSON por clase** (`src/esquema-por-clase.ts`, `pruebas/esquema-por-clase.ts`):
      presentes por clave, faltantes obligatorias, no previstas conservadas, sin clase declarada.
      La capa 0 clasifica ahora sus páginas (antes un PDF digital salía siempre «sin clasificar»).
- [x] **TAR-5 · Tiempos por etapa** (`tiempos` en `LecturaDePagina` y `LecturaDeDocumento`, con
      prueba de reloj inyectado). Suite de la herramienta: **774/774**.
- [x] **TAR-6 · Servicio HTTP + Dockerfile** (`servicio/`): health exacto `{"status":"ok"}`,
      `/extraer`, `/lote`, 413 por tamaño declarado antes de leer, 404/400 sin interior, Mistral
      apagado sin decisión C4 («no disponible: requiere decision C4»). Imagen `node:22-bookworm-slim`
      por digest, usuario sin privilegios, `HEALTHCHECK`. Arranca sin GPU: `healthy` en Docker y
      `docker compose --profile ocr up -d --build ocr` con health `{"status":"ok"}` desde la red interna.
- [x] **TAR-7 · Puente A2A** (`src/features/a2a/`, tres Route Handlers, `scripts/prueba-a2a.ts`):
      **10/10**: opacidad enumerada, health exacto, Card con tipos del SDK y sin interior, versión
      exigida, JSON-RPC malformado sin 500, clave por cabecera, capacidad caída → FAILED con razón
      en español, entrada corrupta → FAILED, camino feliz COMPLETED con evidencia y
      `revisionHumana`, XML por la skill de comprobante con `selloVerificado=false`. `next build`
      lista `ƒ /.well-known/agent-card.json`, `ƒ /a2a`, `ƒ /a2a/health`.

## Fase 3 — Medición y stack (en paralelo)

- [x] **TAR-8 · Medición** (`medicion/servicio.mjs`, en proceso y por HTTP contra el contenedor,
      16 hilos, sin GPU, 4 en vuelo, 33 páginas, NO CONCLUYENTE):

      | Cifra | En proceso | Por HTTP en Docker |
      |---|---|---|
      | Vía motor, pág/min de reloj | 251,7 | 254,7 (base spec 009: 197) |
      | Latencia solo vía motor | p50 736 ms · p95 1993 ms | p50 729 ms · p95 1951 ms |
      | Etapa motor p95 | 1569 ms | 1619 ms |
      | CER (7 escaneos) | 0,0040 | 0,0040 |
      | Campos correctos (126) | 93,7 % | 93,7 % |
      | Evidencia (609 campos) | exacto 542 · checksum 23 · motor 44 · a revisión 44 | igual |

- [x] **TAR-9 · Stack**: `docker-compose.yml` con perfiles `ocr`, `ocr-gpu` (vLLM `v0.11.0`,
      `deploy.resources.reservations.devices` nvidia, health, modelo pineado por variable) y
      `hermes` (imagen por digest + `puente-hermes`); red `interna` sin salida; `docker compose
      config` con los tres perfiles: solo Caddy publica puertos (80, 443). `configura:deploy` mide
      la GPU (driver, `nvidia-smi`, runtime de Docker) y escribe `OCR_GPU`, `OCR_CPUS`, `OCR_MEM`,
      `OCR_EN_VUELO`; en esta máquina: «GPU: ninguna (sin driver NVIDIA cargado)».
      **`ocr-gpu` no se pudo arrancar aquí: no hay GPU. Queda declarado no medido.**

## Fase 4 — Calibración y Hermes (en paralelo)

- [x] **TAR-10 · Calibración**: correlación confianza-error con la confianza de página de Tesseract
      como proxy sobre las 66 muestras de la vía motor: **r = −0,11**, media en aciertos 0,909 y en
      fallos 0,923. **Sin señal: no se fija umbral.** TAR-17 y TAR-25 de la spec 007 cierran así:
      `revisionHumana` sale de la evidencia, no de un corte.
- [x] **TAR-11 · Hermes**: `hermes/config.extractor.yaml` (`mcp_servers.extractor.url`) y
      `hermes/.env.ejemplo` sin ninguna llave del extractor; servicio `hermes` del compose pineado
      por digest; `puente-hermes` con `descubrir_agente` y `extraer_documento` (por `archivo` en una
      carpeta de solo lectura con guarda contra `..`, o por base64). Verificado a mano por MCP:
      Card descubierta y extracción COMPLETED (clase `curp`, evidencia `checksum`).

## Fase 5 — Demo y cierre

- [x] **TAR-12 · Corrida punta a punta** documento → Hermes → puente MCP → A2A → extractor → JSON.
      Hermes (`nousresearch/hermes-agent` por digest `9f367c…`) con un modelo LOCAL en la misma
      red (`ollama/ollama:0.12.6`, `qwen2.5:3b`, sin salida a internet y sin ninguna llave de
      OpenRouter: este entorno no la tiene) llamó a `mcp_extractor_extraer_documento` con
      `archivo=constancia-curp-1.png` y devolvió la extracción: clase `curp`, un campo `curp` con
      confianza 0,55, evidencia `checksum`, `revisionHumana=false`, región, tiempos (códigos 60 ms,
      motor 994 ms), `motivo` público («imagen leida por el motor») y `selloVerificado=false`. El
      entorno de Hermes, enmascarado: `OPENAI_API_KEY` presente (largo 6), `OPENAI_BASE_URL` presente;
      cero variables del extractor, del almacén o `service_role`. Dos condiciones que Hermes impuso
      y quedan documentadas en `hermes/config.extractor.yaml`: `model.context_length` y
      `model.ollama_num_ctx` a 65536, y `OLLAMA_CONTEXT_LENGTH=65536` en el servidor. Nota honesta:
      el modelo de 3B reescribió `estado` como «SUCCESS» al copiar el JSON; la herramienta devolvió
      `TASK_STATE_COMPLETED` (verificado llamando al puente MCP a mano).
- [x] **TAR-13 · Revisión de opacidad por agente distinto del autor.** El revisor lanzó 69
      peticiones y encontró lo que las 10 pruebas del autor no cubrían: (1) el `motivo` del servicio
      OCR viajaba crudo («…salio con codigo 2 — extractor: zonas por defecto (ZONAS_MX…)»); (2) el
      `-32603` que el SDK fabrica dentro de `handle()` llevaba `error.message` de Node
      («Cannot read properties of null…»); (3) `ListTasks` enumeraba las tareas de todos con el
      documento en `history` (37 tareas, 39,7 MB); (4) la cabecera de versión se ecoaba entera;
      (5) un `mediaType` con CRLF se reportaba como «caída». **Los cinco están corregidos** con
      regresión en `scripts/prueba-a2a.ts` (ahora **15/15**): catálogo cerrado de motivos, saneado de
      `-32603` y sin `data`, `ListTasks` cerrado, `AlmacenDeTareasEfimero` sin `history` con tope y
      caducidad, respuesta sin `history`, versión acotada a 32 caracteres y tipo de documento
      validado. Lo que el revisor confirmó intacto: Card, health, 401, DOCTYPE, tamaño, SSRF por
      parte `url`, y la regla de oro (confianza, evidencia y `revisionHumana` llegan intactas).
- [x] **TAR-14 · `npm run validate`, `npm run prueba`, `npm run empaqueta`.** `validate` sellado dos
      veces (antes y después de las correcciones de opacidad); `prueba` 774/774; `empaqueta`
      instala `tu-scope-extractor-documental-0.7.0.tgz` en un proyecto limpio e importa los doce
      entry points. Hallazgo de la imagen: las dependencias del servicio tienen que vivir en
      `/extractor/node_modules` (no en `servicio/`), o `dist/lectores/zxing.js` no resuelve
      `zxing-wasm` y el lector de códigos falla en silencio; corregido, y la sonda de arranque ahora
      distingue «cargado» de «intentado». Verificado con un fixture con QR: 6 campos con evidencia
      `codigo` y `revisionHumana=false`, 14 ms de lectura de códigos.
- [x] **TAR-15 · Documentación y bitácora**: README de la herramienta («Desplegar en el VPS del
      cliente»), `docs/SDD-puente-a2a-extractor.md` (nota de construcción), spec 005 con TAR-1..4 y
      8..13 cerradas, entrada en `BITACORA-CDC.md` con **aprobación humana pendiente**,
      `.env.production.example`, aprendizajes en `aprendizajes-stack.md`.
