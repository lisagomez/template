"""
Prepara el corpus de medicion: FLEURS es_419 (test) → WAV 16 kHz mono + manifiesto con la
transcripcion de referencia. Lo llama `mide.mjs` con el Python del banco (pyarrow).

FLEURS (Google, CC-BY-4.0): habla leida, ~12 s por toma, con `transcription` ya normalizada
(minusculas, sin puntuacion) y `raw_transcription` original. Se toman las N primeras filas del
parquet en orden estable, para que dos corridas midan lo MISMO.

Uso: python3 corpus.py <parquet> <destino> <tomas>
"""
import io
import json
import subprocess
import sys
import wave
from pathlib import Path

import pyarrow.parquet as pq

parquet, destino, tomas = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
destino.mkdir(parents=True, exist_ok=True)
manifiesto = []
lector = pq.ParquetFile(parquet)
for lote in lector.iter_batches(batch_size=32, columns=["id", "audio", "transcription", "raw_transcription", "gender", "num_samples"]):
    for fila in lote.to_pylist():
        if len(manifiesto) >= tomas:
            break
        # El mismo `id` (misma frase) aparece leido por varias personas: el nombre lleva el orden.
        salida = destino / f"fleurs-{len(manifiesto):03d}-{fila['id']}.wav"
        if not salida.exists():
            # Los bytes son WAV; ffmpeg los deja a 16 kHz mono PCM16 pase lo que pase.
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(salida)],
                           input=fila["audio"]["bytes"], check=True)
        with wave.open(str(salida)) as w:
            duracion_ms = round(w.getnframes() / w.getframerate() * 1000)
        manifiesto.append({"id": fila["id"], "archivo": str(salida), "duracionMs": duracion_ms,
                           "referencia": fila["transcription"], "referenciaCruda": fila["raw_transcription"], "genero": fila["gender"]})
    if len(manifiesto) >= tomas:
        break
(destino / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=1))
print(json.dumps({"tomas": len(manifiesto), "minutos": round(sum(m["duracionMs"] for m in manifiesto) / 60000, 1)}))
