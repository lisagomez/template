#!/bin/bash
# Hook SessionEnd: convierte el transcript de la sesion que termina en una trayectoria de FORMA
# (spec 011, RF-5). Recibe por stdin el JSON del arnes ({session_id, transcript_path, cwd}).
# No lee nada mas, no copia texto y siempre devuelve {} para no bloquear el cierre.
# Cablearlo en settings.json del repo es un CDC; ver trayectorias/hooks.ejemplo.json.
exec node "${CLAUDE_PROJECT_DIR:-.}/scripts/trayectorias/captura-sesion.mjs" --hook
