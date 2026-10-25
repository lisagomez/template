#!/bin/sh
# Arranque de una instancia del Arbrain personal (corre como «arbrain», sin privilegios).
#   1. La primera vez, el PASO 7 de su instalador hecho a mano: rama mi-arbrain, sembrar la capa del alumno desde la
#      semilla de ESTA etiqueta (sembrar.py nunca pisa) y guardarla en su rama.
#   2. El servidor de Arbrain en modo servidor (edición cliente): escucha solo en 127.0.0.1. Sin login de Claude,
#      sin llaves, sin modelo: arranca igual, y el chat no tiene con qué pensar (no hace falta para esta prueba).
#   3. En el VPS, el agente del túnel: SALE hacia el relevo y no abre ningún puerto.
set -eu
LADO="${CEREBRO_LADO:?falta CEREBRO_LADO}"
cd "$HOME/Arbrain"
mkdir -p "$HOME/.arbrain"

if [ ! -f .arbrain-sembrado.json ]; then
  git switch -q -c mi-arbrain
  git config --local user.name "Mi Arbrain"
  git config --local user.email "yo@mi-arbrain.local"
  python3 arbrain/cerebro/sembrar.py > "$HOME/.arbrain/sembrado.log"
  git add -A && git commit -qm "Mi capa: semilla de la versión $(cat VERSION)"
  echo "[$LADO] capa del alumno sembrada desde la semilla de v$(cat VERSION)"
fi

if [ -d "$HOME/.local/share/ai.arbrain.servidor/programa/v$(cat VERSION)-linux-x64" ]; then
  (cd arbrain && exec node scripts/servidor.mjs --sin-navegador) >> "$HOME/.arbrain/arranque.log" 2>&1 &
  echo "[$LADO] servidor de Arbrain arrancando (solo 127.0.0.1)"
else
  echo "[$LADO] sin programa compilado de v$(cat VERSION): esta instancia no arranca la app (solo la usa la prueba de versiones)"
fi

if [ "$LADO" = vps ]; then
  node /opt/cerebro-sync/tunel.mjs agente >> "$HOME/.arbrain/tunel.log" 2>&1 &
fi

exec sleep infinity
