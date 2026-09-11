# Plan 008 — Del corpus al modelo

> Cierra el **CÓMO** de [`spec.md`](./spec.md). Se construye **sobre** 007, dentro de
> `tools/extractor-documental/`, y no toca el lienzo ni la barrera: la salida cabe en
> `PropuestaDeModelo` para que sirvan sin cambios.

## Módulos

Todos en el núcleo salvo el adaptador. Cero dependencias nuevas.

| Módulo | Contenido | Cubre |
|---|---|---|
| `src/corpus.ts` | **La inferencia.** `infiereModelo(corpus, descriptor)`: índice de valores por clave y documento; entidades por identificador que se repite exacto; atributos por dependencia funcional comprobada grupo a grupo; dudas por dependencia rota, cardinalidad no uniforme, texto repetido, identificador de un solo valor y documento vacío; proyección a `PropuestaDeModelo` reutilizando `sqlDeEntidad`, `CABECERA` y `revisaSql` de `modelo.ts` | RF-16..RF-29 |
| `src/lote-corpus.ts` | **El enrutado.** `leeCorpus(archivos, opciones)`: vía por bytes (`tipoMimeDe`, prólogo XML), capa 0 → patrones, XML → lector + registro, escaneo → `imagenesDelPdf` → motor, imagen → motor; `enVuelo` trabajadores; orden de entrada; tiempo por documento; fallo declarado por documento | RF-1..RF-10, RF-14 |
| `src/transcripcion.ts` | **La segunda lectura.** `cotejaContraTranscripcion(paginas)` y `huella(texto)`: un campo cuyo valor no está en la transcripción del propio motor no entra al resultado | RF-11..RF-13 |
| `src/patrones.ts` | `camposPorPatron(texto, patrones, origen)`: campos deterministas desde texto exacto (`codigo`, 1) o desde una transcripción de OCR (`ocr`, 0) | RF-9, RF-14 |
| `src/archivos.ts` | `tipoMimeDe` se muda aquí desde el adaptador: el núcleo no puede importar de `motores/`; el adaptador lo re-exporta | RF-1 |
| `src/motores/openai-compat.ts` | Opción `modo: 'campos' \| 'transcripcion'`. En transcripción no se exige JSON y se pide solo el texto (`INSTRUCCION_TRANSCRIPCION`); la respuesta vuelve como una página con `campos: []` | RF-14, RF-32 |
| `medicion/genera-corpus.py` | Corpus **sintético** con verdad conocida: escaneos (PNG con rotación, desenfoque y grano; uno como JPEG dentro de PDF) y PDF con capa de texto real; semilla fija; todo inventado y así declarado | RF-35 |
| `medicion/corpus.mjs` | La corrida: lee `corpus/`, enruta, mide (CER, campos correctos, correlación), infiere, escribe JSON por documento y propuesta. Imprime **forma**, nunca valores | RF-31, RF-33, RF-34, RF-36 |
| `pruebas/corpus.ts` · `lote-corpus.ts` · `transcripcion.ts` · `patrones.ts` | Pruebas puras, sin red. Incluyen los casos que **deben** fallar: entidad de texto libre, plantilla copiada, dependencia rota, documento perdido | RNF núcleo puro |
| `pruebas/salida-json.ts` | Valida la salida JSON contra la forma de los tipos, importando validadores y tipos desde `dist/` | RF-31 |

### Flujo

```
corpus ─► leeCorpus ──┬─► PDF con texto ──► leeCapaCero ──► camposPorPatron (codigo, 1) ─┐
                      ├─► XML ────────────► leeCfdi40 + registro ───────────────────────┤
                      ├─► PDF escaneado ──► imagenesDelPdf ─┐                            │
                      └─► imagen ──────────────────────────┴─► motor (inyectado) ─┬─► campos + transcripción ─► cotejaContraTranscripcion ─┤
                                                                                   └─► solo transcripción ─────► camposPorPatron (ocr, 0) ──┤
                                                                                                                                             ▼
                                                      LecturaDeDocumento[] (vía, motivo, campos, páginas, ms, cotejo) ◄──────────────────────┘
                                                                              │
                                                                              ▼
                                                     infiereModelo ─► InferenciaDeCorpus { propuesta, entidades, dudas, documentos }
                                                                              │
                                                                              ▼
                                                                   revisaSql ─► JSON ─► ══ GATE HUMANO ══
```

## Decisiones, con la alternativa descartada

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Entidad solo desde `identificador` que se repite **exacto** | Agrupar por parecido (similitud de nombres) | Un parecido funda una entidad que no existe y parte o junta a dos terceros. El identificador se compara por igualdad, como en 007 |
| Atributo por dependencia funcional comprobada en **todos** los grupos | Mayoría (p. ej. 80 %) | La mayoría es un umbral, y los umbrales se miden. La dependencia rota se declara con los documentos; el humano decide |
| Dudas como salida de primera clase | Forzar la cardinalidad o el atributo | «Declarar, no descartar». Una duda callada aparece a los seis meses como un dato mal normalizado |
| Salida en `PropuestaDeModelo` | Un tipo nuevo de propuesta | El lienzo y la barrera ya existen y ya están probados; un tipo nuevo obliga a duplicarlos |
| `sqlDeEntidad` y `CABECERA` exportados y reutilizados | Copiar la generación de SQL | Una copia diverge de la barrera el día que alguien arregla una sola |
| Motor de OCR puro en modo **transcripción** + patrones | Forzarle el JSON | Medido: GLM-OCR devuelve HTML y `"markdown":=` cuando se le pide JSON, y texto exacto cuando se le pide texto |
| Confianza **0** para campos por patrón sobre OCR | Confianza 1 (el patrón es determinista) o un número «razonable» | El texto no es exacto y el motor no declara nada. 0 es la mínima: todo pasa por revisión hasta que una medición diga otra cosa. Un número inventado es exactamente el umbral que la casa prohíbe |
| Cotejo contra la propia transcripción del motor | Confiar en los campos | Medido el 2026-09-10: un campo de veinticinco era una recomposición, no una lectura |
| Vía por bytes | Vía por extensión | Un `.pdf` renombrado sigue siendo lo que es; 007 ya detecta por bytes |
| `enVuelo` como parámetro medido, no como default | Un paralelismo fijo | Ollama atiende de una en una salvo `OLLAMA_NUM_PARALLEL`; el número que sirve depende del servidor y se mide |
| Corpus sintético con verdad conocida para las métricas | Anotar a mano el escaneo real | El real lleva datos de terceros: no puede entrar al repositorio ni a un transcript. El sintético se genera con semilla y su verdad es exacta |
| `fetch` con dispatcher propio en el script de medición | Subir `milisegundosDeEspera` | No gobierna el `headersTimeout` de Node (007 ya lo documenta en `traduceElCorte`) |
| Ollama como servidor | vLLM / SGLang con lote continuo | Sin GPU en esta máquina; vLLM en CPU no da lote continuo útil. Se declara como techo y siguiente paso, no se estima |
| PaddleOCR-VL no medido | Estimarlo desde su ficha | No está en la biblioteca de Ollama; medir exige instalarlo por otra vía. Declarado, no estimado |

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Cómo se cubre |
|---|---|
| DoF-1 | Esta carpeta, con `npm run verifica:specs` |
| DoF-2 | `node medicion/corpus.mjs --modelo <pineado> --modo transcripcion` sobre `corpus/` + fixtures XML: tabla por documento |
| DoF-3 | Misma corrida con `--en-vuelo 1` y `--en-vuelo 2` (con `OLLAMA_NUM_PARALLEL=2`); el ahorro sale del recuento por vía |
| DoF-4 | Tres corridas: `glm-ocr:q8_0` (transcripción), `qwen2.5vl:3b` y `qwen2.5vl:7b` (campos); CER, campos correctos y latencia contra la verdad sintética |
| DoF-5 | `infiereModelo` al final de la corrida; SQL impreso; `revisaSql` llamado explícitamente |
| DoF-6 | `pruebas/salida-json.ts` |
| DoF-7 | Columna «cotejo ok/no» de la tabla; `cotejo.noCoinciden` en el JSON |
| DoF-8 | `correlacionConfianzaError` sobre las muestras del motor con verdad |
| DoF-9 | `npm run validate` y `npm run prueba` |
| DoF-10 | `grep` de `execute`, `query(`, `rpc(`, `apply_migration` en los módulos nuevos: cero |

## Estrategia de gates

- **Durante**: `npm run prueba` en la herramienta tras cada módulo (build incluido).
- **Al cerrar**: `npm run validate` desde la raíz.
- **Gates humanos, no de script**: aplicar la propuesta; pinear el motor de producción (CDC).
- **Lo que no es de este loop**: cualquier cambio a `AGENTS.md` o a un skill se propone aparte.

## Nota de estado

Módulos, pruebas y script de medición **construidos**. Las corridas de medición se ejecutan sobre
el hardware disponible (16 hilos de CPU, 15 GB de memoria, sin GPU); sus cifras van en
`tareas.md` y en el reporte de la conversación, nunca en esta spec como promesa.
