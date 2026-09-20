# Propuesta de CDC (C1): diarización con solape por PyanNet — NO aplicada

> Redactada el 2026-09-20 por el agente. Descargar y pinear un modelo nuevo cambia el
> comportamiento del dictado por lotes: exige diff, medición y **aprobación humana** antes de
> tocar `medicion/mide.mjs`. Hasta entonces, el laboratorio sigue diciendo en el caso 9 que
> «no ve dos personas hablando a la vez».

## Qué cambia

- `tools/dictado/medicion/mide.mjs`, lista `ARCHIVOS`: una fila nueva
  `{ archivo: 'segmentation-3.0.onnx', url: 'https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx', que: 'pyannote segmentation 3.0 (PyanNet, powerset) — solape' }`,
  con el **sha256** del archivo anotado en la fila una vez descargado.
- `tools/dictado/src/node/cli-lote.ts`: flag `--solape` que, si existe el modelo, usa
  `creaDiarizadorPorSegmentacion` + `creaModeloSegmentacion` de `@tu-scope/voz` (ya existen,
  con pruebas en `tools/voz/pruebas/segmentacion.ts`) y lista los tramos de `tramosSolapados`
  al final del acta. Sin el modelo, error claro con la URL, como hoy con `embedding.onnx`.
- `src/features/laboratorio-voz/services/casos.ts`, caso 9: quitar la `notaHonesta` del solape
  y añadir `'segmentacion'` a `requiere` (nueva pieza en `maquina.mjs piezas`).

## Cómo se mide antes de aprobar

1. Las tres reuniones simuladas de `medicion/corpus-propio/reuniones/` **no se pisan**: valen
   para confirmar que el camino nuevo no empeora el etiquetado (hoy 100 %) ni el WER.
2. Se fabrica una cuarta reunión con solape real: dos líneas mezcladas en el tiempo (ffmpeg
   `amix` con desplazamiento) y verdad de terreno con los tramos solapados.
3. Criterio: los tramos solapados aparecen con error de frontera < 300 ms, y el etiquetado del
   resto sigue ≥ 90 %. Coste: tiempo de proceso por segundo de audio, con y sin solape.

## Riesgo y quién decide

Peso de ~6 MB de un tercero (HuggingFace) con licencia MIT; corre local. El riesgo es de
comportamiento (otro modelo decidiendo quién habla), no de datos. Lo aprueba quien decide con
entrada en `BITACORA-CDC.md`; el agente no lo descarga por su cuenta.
