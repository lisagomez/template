#!/usr/bin/env bash
# Instala el motor local de lectura de fechas en un entorno aislado de Python.
#   bash motores/instala-rapidocr.sh <carpeta-destino>
# Deja <carpeta-destino>/bin/python; ese es el valor de ETIQUETAS_MOTOR_PYTHON.
# Todo local: los modelos PP-OCRv4 vienen DENTRO del paquete (no se descargan al leer).
set -euo pipefail
destino="${1:?uso: instala-rapidocr.sh <carpeta-destino>}"
aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v uv >/dev/null 2>&1; then
  uv venv -q -p 3.11 "$destino"
  uv pip install -q -p "$destino/bin/python" -r "$aqui/requirements-rapidocr.txt"
else
  python3 -m venv "$destino"
  "$destino/bin/pip" install -q -r "$aqui/requirements-rapidocr.txt"
fi
"$destino/bin/python" "$aqui/rapidocr-json.py" --sonda
echo "listo: ETIQUETAS_MOTOR_PYTHON=$destino/bin/python"
