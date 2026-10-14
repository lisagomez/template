#!/usr/bin/env bash
# Enciende la sección en vivo en la máquina del laboratorio: el laboratorio de Soporte SAP en 127.0.0.1:3011 (en
# memoria, datos sintéticos, con el OCR local si está) y el portero en 127.0.0.1:8787, que es lo único a lo que apunta
# el túnel. El portero no arranca si la vitrina no responde «protegida». El túnel se abre aparte (ver
# docs/VITRINA-SOPORTE-SAP.md). Ctrl+C apaga los dos.
# Uso: bash scripts/vitrina/en-vivo.sh
set -euo pipefail
ENTORNO="$HOME/.soporte-sap-en-vivo.env"
[ -f "$ENTORNO" ] || { echo "✗ falta $ENTORNO: corre antes bash scripts/vitrina/siembra-secreto.sh <url de la vitrina>" >&2; exit 1; }
T="$HOME/.local/tesseract/usr"
if [ -x "$T/bin/tesseract" ]; then
  export TESSERACT_CMD="$T/bin/tesseract" LD_LIBRARY_PATH="$T/lib/x86_64-linux-gnu" TESSDATA_PREFIX="$T/share/tesseract-ocr/5/tessdata"
fi
SOPORTE_SAP_LABORATORIO=1 npx next dev --turbopack -H 127.0.0.1 -p 3011 &
LAB=$!
trap 'kill $LAB 2>/dev/null || true' EXIT
until curl -s -o /dev/null "http://127.0.0.1:3011/api/soporte-sap?rol=cliente"; do sleep 2; done
echo "✓ laboratorio en 127.0.0.1:3011"
node --env-file="$ENTORNO" src/features/soporte-sap/vitrina/en-vivo/portero.ts
