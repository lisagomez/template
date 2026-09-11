# Tareas 008 — Del corpus al modelo

> Una casilla marcada apunta a un artefacto que **existe y se verificó**. Las cifras de medición
> se escriben cuando la corrida termina, no antes. Estado al 2026-09-11.

## Cerradas

- [x] **TAR-1 · Inferencia desde el corpus.**
      → `src/corpus.ts` · `pruebas/corpus.ts` (15 pruebas) — `infiereModelo` funda entidades solo
      en identificadores que se repiten exacto, atributos por dependencia funcional comprobada en
      todos los grupos, dudas por dependencia rota / cardinalidad no uniforme / texto repetido /
      un solo valor / documento vacío; sale como `PropuestaDeModelo`, pasa por `revisaSql`.
      Probados los casos que deben fallar: texto libre no funda entidad, `...` no funda entidad,
      dependencia rota queda en el documento con los documentos que la rompen, id repetido lanza.

- [x] **TAR-2 · Reutilizar la generación de SQL en vez de copiarla.**
      → `src/modelo.ts` — `sqlDeEntidad` y `CABECERA` exportados. Sin cambio de comportamiento.

- [x] **TAR-3 · Segunda lectura: cotejo contra la transcripción.**
      → `src/transcripcion.ts` · `pruebas/transcripcion.ts` — `huella` pliega acentos, caso,
      puntuación y separadores de miles; un campo que no está en la transcripción no entra.

- [x] **TAR-4 · Campos por patrón desde texto.**
      → `src/patrones.ts` · `pruebas/patrones.ts` — determinista; un patrón que no casa no produce
      campo; origen `codigo`/1 por defecto y `ocr`/0 para transcripciones de OCR.

- [x] **TAR-5 · Enrutado del lote por lo que el documento ES.**
      → `src/lote-corpus.ts` · `pruebas/lote-corpus.ts` (8 pruebas) — capa 0 / XML / motor /
      ninguna; escaneo va como JPEG; fallo declarado por documento; orden de entrada; `enVuelo`;
      claves identificadoras marcadas por cualquier vía. `tipoMimeDe` mudado al núcleo.

- [x] **TAR-6 · Modo transcripción en el adaptador compatible.**
      → `src/motores/openai-compat.ts` · `src/motores/comun.ts` — `modo: 'transcripcion'` no
      exige JSON; `INSTRUCCION_TRANSCRIPCION` con el hallazgo medido sobre GLM-OCR.

- [x] **TAR-7 · Corpus sintético con verdad conocida.**
      → `medicion/genera-corpus.py` — 4 facturas escaneadas (1 como PDF con JPEG), 2 minutas
      escaneadas, 6 facturas digitales con capa de texto; semilla fija; todo inventado. Destino
      `corpus/`, ignorado por git (`.gitignore` de la raíz).

- [x] **TAR-8 · Script de corrida y medición.**
      → `medicion/corpus.mjs` — enruta, mide CER / campos correctos / correlación contra la
      verdad, infiere, imprime forma (nunca valores), escribe JSON por documento y propuesta.
      `fetch` con dispatcher de undici para saltar el `headersTimeout` de Node.

- [x] **TAR-9 · Spec, plan y tareas.**
      → esta carpeta; `npm run verifica:specs` en verde.

- [x] **TAR-10 · Prueba que valida el JSON de salida contra los tipos** (RF-31, DoF-6).
      → `pruebas/salida-json.ts` — usa `validaCampo` y `validaPaginas` del adaptador (no una
      copia) y un validador de `PropuestaDeModelo` escrito contra el tipo importado; una muestra
      con la confianza en texto falla; valida ademas lo que dejo la corrida en `corpus/salida-*`.

- [x] **TAR-13 · Duplicados por contenido e identificadores unicos.**
      → `src/lote-corpus.ts` (`identidad`, `duplicadoDe`: el mismo fichero dos veces se lee las
      dos y la segunda se declara copia; la corrida lo excluye de la inferencia) ·
      `src/corpus.ts` (`unicos`: valores del identificador vistos una sola vez, que es donde acaba
      un RFC mal leido por el motor).

## Abiertas

- [x] **TAR-11 · Corridas de medición** (DoF-2, 3, 4, 7, 8). Hardware: 16 hilos, 15 GB, sin GPU.
      → 22 documentos: 6 por capa 0 (0,0 s), 8 por XML (0,0 s), 8 por motor.
      → `glm-ocr:q8_0` transcripción, en frío: 103-128 s/página, 0,54 pág/min; **58 de 58 campos
      correctos**, CER 0,0 % en 6 de 7 (la séptima traía la transcripción duplicada: corregido en
      el adaptador). Misma imagen ya vista: 8-12 s (cache de Ollama).
      → `qwen2.5vl:3b` campos: 2 de 7 páginas cierran el JSON; 7 de 8 campos devueltos correctos;
      confianza constante 1,00. `qwen2.5vl:7b`: 3 de 7 cierran; 18 de 18 correctos; 288-462 s;
      confianzas 0,90 y 0,95.
      → Dos en vuelo (`OLLAMA_NUM_PARALLEL=2`, en frío): 0,60 pág/min frente a 0,54; cada
      petición casi al doble. En CPU no compensa.
      → Contexto del servidor: con `OLLAMA_CONTEXT_LENGTH=8192` las facturas que no cerraban el
      JSON cierran (7b: 2 de 2, 19 de 20 campos; 3b: 1 de 1, 8 de 10). El fallo era de
      configuración, no de lectura.
      → Correlación confianza-error: **no calculable o sin señal en los tres** (7b: r = 0,23
      sobre 20 campos con un solo fallo, que llevaba la misma confianza que 12 aciertos) (sin fallos entre lo devuelto,
      o confianza constante, o sin confianza). No se fija umbral.
      → Ahorro por enrutar: 14 de 22 documentos no pasaron por el motor; a 110 s la página, unos
      26 minutos de 41.

- [x] **TAR-12 · Documentación.**
      → `docs/SDD-extractor-documental.md` §2.22 (inferencia desde el corpus) y §2.23 (un motor de
      OCR puro no sigue instrucciones; el contexto del servidor es parte del motor pineado) ·
      README de la herramienta (sección «Del corpus al modelo» y tabla de motores medidos) ·
      `docs/INVESTIGACION-OCR-MISTRAL.md` §10 cerrado.

## Bloqueadas por hardware

- **Lote continuo con vLLM / SGLang**: exige GPU. Sin ella, la medición de «20 a 26 veces con
  lote de 64» no se puede reproducir y no se afirma. Lo que sí se mide: `enVuelo` 1 frente a 2 en
  Ollama sobre CPU.
- **PaddleOCR-VL**: no publicado en la biblioteca de Ollama a fecha de hoy (404). Se declara no
  medido.
