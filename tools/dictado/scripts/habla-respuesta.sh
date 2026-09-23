#!/bin/bash
# Hook `Stop` (PRP-003): comprueba en bash, en unos milisegundos y sin arrancar node, que hay un
# `dictar` en el socket local Y que saluda «dictar on <estado>» con el dictado encendido (RF-43:
# sin dictado o con la conversacion apagada, nada y en < 100 ms). Solo entonces
# `habla-respuesta.mjs` lee el JSON del arnes por stdin y manda el primer parrafo sin esperar a
# que suene. Nunca escribe en stdout y siempre sale 0: no decide nada por el arnes.
puerto="${DICTADO_CONVERSACION_PUERTO:-47126}"
(exec 3<>"/dev/tcp/127.0.0.1/$puerto") 2>/dev/null || exit 0
exec 3<>"/dev/tcp/127.0.0.1/$puerto" 2>/dev/null || exit 0
read -t 0.3 -r saludo <&3 || saludo=''
exec 3>&-
case "$saludo" in
  "dictar on inactivo"*) exit 0 ;;
  "dictar on "*) ;;
  *) exit 0 ;;
esac
aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$aqui/habla-respuesta.mjs" 2>/dev/null
exit 0
