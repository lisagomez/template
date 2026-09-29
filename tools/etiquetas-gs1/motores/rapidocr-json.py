#!/usr/bin/env python3
"""Lee el texto de UNA imagen con RapidOCR y lo escribe como JSON en stdout.

    python rapidocr-json.py [--puntos] <imagen>
    python rapidocr-json.py --sonda

Salida: {"lineas": [{"texto": str, "confianza": float, "caja": [x, y, ancho, alto]}], "variante": str}

--puntos: une los puntos de la tinta de inyeccion antes de leer (contraste, dilatar la tinta,
umbral). Es la variante que se mide contra la cruda; el nucleo decide cual usar.

Contrato con el adaptador (tools/etiquetas-gs1/src/motores/proceso.ts): un error NUNCA escribe el
texto leido ni la imagen; solo una linea en stderr que empieza por «motor:».
"""
import json
import sys


def une_puntos(ruta):
    import cv2
    import numpy as np
    gris = cv2.imread(ruta, cv2.IMREAD_GRAYSCALE)
    if gris is None:
        raise ValueError("no es una imagen legible")
    gris = cv2.normalize(gris, None, 0, 255, cv2.NORM_MINMAX)
    # La tinta suele ser mas oscura que el fondo; si la mediana es oscura, la tinta brilla (luz rasante).
    if np.median(gris) < 110:
        gris = 255 - gris
    tinta = cv2.erode(gris, np.ones((3, 3), np.uint8), iterations=2)
    tinta = cv2.GaussianBlur(tinta, (5, 5), 0)
    _, bn = cv2.threshold(tinta, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(bn, cv2.COLOR_GRAY2BGR)


def caja(puntos):
    xs = [p[0] for p in puntos]
    ys = [p[1] for p in puntos]
    return [round(min(xs)), round(min(ys)), round(max(xs) - min(xs)), round(max(ys) - min(ys))]


def main(argv):
    from rapidocr_onnxruntime import RapidOCR
    motor = RapidOCR()
    if argv == ["--sonda"]:
        print(json.dumps({"ok": True, "motor": "rapidocr-onnxruntime-1.4.4/ppocrv4"}))
        return 0
    puntos = "--puntos" in argv
    rutas = [a for a in argv if not a.startswith("--")]
    if len(rutas) != 1:
        print("motor: se espera una sola imagen", file=sys.stderr)
        return 2
    entrada = une_puntos(rutas[0]) if puntos else rutas[0]
    resultado, _ = motor(entrada)
    lineas = [{"texto": t, "confianza": round(float(c), 4), "caja": caja(p)} for p, t, c in (resultado or [])]
    print(json.dumps({"lineas": lineas, "variante": "puntos" if puntos else "cruda"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as e:  # noqa: BLE001 - el contrato es una linea sin datos
        print(f"motor: {type(e).__name__}", file=sys.stderr)
        sys.exit(1)
