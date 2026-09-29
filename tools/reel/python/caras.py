"""Detección de caras con YuNet (OpenCV). Solo DÓNDE hay una cara, nunca QUIÉN es: no calcula
rasgos ni huellas biométricas. Uso: python3 caras.py <modelo.onnx> <umbral> <cuadro.png>... → JSON."""
import json
import sys

import cv2

modelo, umbral, archivos = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
detector = cv2.FaceDetectorYN.create(modelo, '', (320, 320), umbral, 0.3, 5000)
salida = []
for archivo in archivos:
    imagen = cv2.imread(archivo)
    if imagen is None:
        salida.append({'archivo': archivo, 'caras': [], 'error': 'no se pudo leer'})
        continue
    alto, ancho = imagen.shape[:2]
    detector.setInputSize((ancho, alto))
    _, caras = detector.detect(imagen)
    lista = [] if caras is None else [
        {'x': int(max(0, c[0])), 'y': int(max(0, c[1])), 'ancho': int(c[2]), 'alto': int(c[3]), 'confianza': round(float(c[14]), 3)}
        for c in caras
    ]
    salida.append({'archivo': archivo, 'caras': lista})
print(json.dumps(salida))
