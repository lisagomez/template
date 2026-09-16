"""
faster-whisper (CTranslate2) como motor por proceso de `@tu-scope/dictado`.

Habla el protocolo de `src/node/motores/proceso.ts`: una linea JSON por peticion en stdin,
una linea JSON por respuesta en stdout. El audio llega en base64 (PCM16LE mono) y no por
archivo: nada toca el disco.

Mismo archivo en CPU y en GPU: `--dispositivo auto` elige CUDA si CTranslate2 la ve, y
`--calculo` sigue la regla de la casa (int8 en CPU, float16 en GPU). El modelo va PINEADO
por nombre y, si se quiere de verdad pineado, por ruta a una carpeta ya convertida.

Uso: python3 motores-locales/motor-faster-whisper.py --modelo small --dispositivo cpu --calculo int8 --hilos 8 --raiz-modelos <dir>
"""
import argparse
import base64
import json
import sys
import time

import numpy as np


def rss_mb() -> int:
    try:
        with open("/proc/self/status") as f:
            for linea in f:
                if linea.startswith("VmRSS:"):
                    return int(linea.split()[1]) // 1024
    except OSError:
        pass
    return -1


def responde(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--modelo", default="small")
    p.add_argument("--dispositivo", default="cpu", choices=["cpu", "cuda", "auto"])
    p.add_argument("--calculo", default=None, help="int8 (CPU) o float16 (GPU); por defecto segun dispositivo")
    p.add_argument("--hilos", type=int, default=8)
    p.add_argument("--raiz-modelos", default=None)
    p.add_argument("--haz", type=int, default=1, help="beam size; 1 = greedy, que es lo que se midio")
    args = p.parse_args()

    from faster_whisper import WhisperModel  # se importa tarde: el error de instalacion sale por stderr con contexto

    calculo = args.calculo or ("int8" if args.dispositivo == "cpu" else "float16")
    if args.dispositivo == "auto":
        import ctranslate2
        dispositivo = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        calculo = args.calculo or ("float16" if dispositivo == "cuda" else "int8")
    else:
        dispositivo = args.dispositivo
    modelo = WhisperModel(args.modelo, device=dispositivo, compute_type=calculo, cpu_threads=args.hilos, download_root=args.raiz_modelos)
    responde({"listo": True, "motor": f"faster-whisper-{args.modelo}-{calculo}-{dispositivo}", "rssMb": rss_mb()})

    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            peticion = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if peticion.get("cierra"):
            break
        ident = peticion.get("id")
        try:
            if peticion.get("calienta"):
                list(modelo.transcribe(np.zeros(16000, dtype=np.float32), language="es", beam_size=1)[0])
                responde({"id": ident, "texto": "", "ms": 0, "rssMb": rss_mb()})
                continue
            hz = int(peticion.get("hz", 16000))
            audio = np.frombuffer(base64.b64decode(peticion["pcm16"]), dtype=np.int16).astype(np.float32) / 32768.0
            if hz != 16000:
                # faster-whisper espera 16 kHz; remuestreo lineal basta para voz y evita otra dependencia
                n = int(len(audio) * 16000 / hz)
                audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)
            t0 = time.perf_counter()
            segmentos, _info = modelo.transcribe(
                audio,
                language=peticion.get("idioma") or "es",
                initial_prompt=peticion.get("pista") or None,
                beam_size=args.haz,
                vad_filter=False,
                condition_on_previous_text=False,
            )
            partes = [s for s in segmentos]
            texto = " ".join(s.text.strip() for s in partes).strip()
            confianza = None
            if partes:
                confianza = float(np.mean([np.exp(s.avg_logprob) for s in partes]))
            responde({"id": ident, "texto": texto, "ms": round((time.perf_counter() - t0) * 1000, 1), "confianza": confianza, "rssMb": rss_mb()})
        except Exception as e:  # el error viaja como dato, nunca tumba el proceso
            responde({"id": ident, "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    main()
