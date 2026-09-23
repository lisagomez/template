#!/bin/bash
# Hook Stop: el agente lee en voz alta el primer parrafo de su respuesta si hay un dictado
# escuchando con la conversacion encendida (PRP-003, RF-42 y RF-43). Todo vive en tools/dictado;
# esto solo lo apunta. Sin dictado sale en milisegundos; nunca escribe en stdout ni bloquea.
# Cablearlo en settings.json del repo es un CDC (C1): ver BITACORA-CDC.md.
exec bash "${CLAUDE_PROJECT_DIR:-.}/tools/dictado/scripts/habla-respuesta.sh"
