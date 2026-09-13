# Plan 010 — El extractor en la infraestructura del cliente

> Derivado del grafo `docs/grafos/extractor-en-infra-del-cliente.json` con `grafo2plan.py`: cinco
> fases, cuatro con paralelismo. Aquí va lo que el ejecutor decidió dentro de cada nodo.

## Módulos y requisitos que cubren

| Módulo | Dónde | RF |
|---|---|---|
| Evidencia de la confianza | `tools/extractor-documental/src/evidencia.ts` (núcleo, sin dependencias) | RF-7, RF-8, RF-21 |
| Esquema JSON por clase | `tools/extractor-documental/src/esquema-por-clase.ts` (núcleo) | RF-12, RF-13, RF-14 |
| Tiempos por etapa | `src/lote-pagina.ts` y `src/lote-corpus.ts` (aditivo: `tiempos`) | RF-10, RF-11 |
| Servicio OCR | `tools/extractor-documental/servicio/` (servidor HTTP, Dockerfile, MCP para Hermes) | RF-1 a RF-6, RF-22 |
| Puente A2A | `src/features/a2a/` + tres Route Handlers en `src/app/` | RF-15 a RF-21 |
| Stack | `docker-compose.yml`, `scripts/configura-deploy.mjs` | RF-4, RF-5, RF-20, RF-23 |
| Medición | `tools/extractor-documental/medicion/servicio.mjs` | RF-9, RF-11, RF-24 |

## Decisiones, y lo que se descartó

- **Servicio en Node sobre `dist/`, no en Python.** El núcleo, los adaptadores, la barrera de
  validación y la regla de derivación ya están en TypeScript; Tesseract entra por
  `motores/proceso-local` como hasta ahora. Un servicio Python habría duplicado la barrera.
- **Tesseract es la base en CPU; la cola es un adaptador compatible con OpenAI** apuntando a
  `ocr-gpu` (vLLM) o a cualquier servidor que el cliente configure. La regla de derivación es la
  medida en la spec 009 (`reglaFaltaIdentificador`), sin umbral de confianza.
- **La GPU como servicio del compose (`ocr-gpu`)** con `deploy.resources.reservations.devices`,
  imagen de vLLM pineada por tag y modelo pineado por identificador. `configura:deploy` mide la
  GPU leyendo `nvidia-smi` si existe y lo escribe; sin GPU, escribe que no la hay.
- **Evidencia, no calibración.** En vez de inventar un umbral, cada campo lleva la evidencia que
  lo sostiene, y `revision_humana` sale de la evidencia. La correlación se mide y se reporta.
- **El puente A2A se monta con `JsonRpcTransportHandler` directo en un Route Handler**, sin
  Express, con los tipos del SDK 1.1.0 introspeccionado (constantes importadas, no reescritas).
- **Hermes consume por MCP→A2A.** Hermes no habla A2A nativo (verificado en su documentación:
  soporta servidores MCP por `mcp_servers` en `config.yaml`). Un puente MCP sin dependencias,
  servido por HTTP en la red interna, traduce `tools/call` a `SendMessage` contra la Card.
- **Descartado**: reescribir el motor de Tesseract; preprocesado genérico (medido: 0-3 puntos);
  derivar por confianza de página (medido: dobla el gasto sin rescatar identificadores).

## Cobertura de los criterios de finalización

| Criterio | Evidencia |
|---|---|
| 1 | `npm run verifica:specs` |
| 2, 9 | `docker compose --profile ocr up` y `docker compose config` |
| 3 | `docker compose config` con `ocr-gpu`; `configura:deploy` |
| 4, 5 | `medicion/servicio.mjs` |
| 6 | `pruebas/esquema-por-clase.ts`, `pruebas/salida-json.ts` |
| 7 | `scripts/prueba-a2a.ts` y revisión por subagente |
| 8 | log del contenedor de Hermes |
| 10 | `npm run validate`, `npm run prueba`, `npm run empaqueta extractor-documental` |

## Gates y riesgos

- **Gate humano**: exponer el puente fuera de la red interna. No se abre aquí.
- **Riesgo**: cifras no concluyentes por corpus sintético menor de 100 páginas. Se declara.
- **Riesgo**: `ocr-gpu` sin máquina donde probar. Se declara no medido.
- **Riesgo**: Hermes sin modelo de lenguaje disponible en este entorno. Se demuestra el descubrimiento
  de la herramienta y la llamada MCP→A2A; la conversación completa queda con el comando exacto.
