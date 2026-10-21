#!/usr/bin/env bash
# Despliega el laboratorio alojado de Soporte SAP en Cloudflare (la mesa del experto). Lo corre el laboratorio, con `!`:
#   bash scripts/laboratorio-alojado/despliega.sh
# Antes: `npx wrangler@4.143.1 login`, los secretos (`wrangler secret put`, ver la guía) y Workers Paid.
#
# 1. Lo que sube es un commit: sin cambios sin commit.
# 2. El candado estático (Dockerfile, wrangler.jsonc, sin .env en la carpeta).
# 3. La imagen se construye AQUÍ, con la etiqueta del commit, y el candado la revisa por dentro.
# 4. Se sube ESA imagen al registro de Cloudflare y el Worker se despliega apuntando a ella (no a otra que wrangler
#    construya por su cuenta).
# 5. Después: sin sesión de Access, la mesa no abre. Si abre, el guion lo dice en rojo y no hay que dar el enlace.
set -euo pipefail
# wrangler manda telemetría de uso a Cloudflare si no se le dice que no.
export WRANGLER_SEND_METRICS=false
# Lo que no es secreto pero es de la cuenta (el equipo de Access) vive fuera del repo, en un archivo 600.
CONFIG_LOCAL="$HOME/.soporte-sap-mesa.env"
[ -f "$CONFIG_LOCAL" ] || { echo "✗ falta $CONFIG_LOCAL (ver docs/MESA-DEL-EXPERTO.md, «Una vez»)" >&2; exit 1; }
ACCESS_EQUIPO="$(grep -E '^ACCESS_EQUIPO=' "$CONFIG_LOCAL" | head -1 | cut -d= -f2- || true)"
# La raíz sale de dónde está este guion, no de dónde se corre: un `!` puede correr en otra copia del repo.
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
AQUI=scripts/laboratorio-alojado
git diff --quiet HEAD -- || { echo "✗ hay cambios sin commit: lo que sube tiene que ser un commit" >&2; exit 1; }
COMMIT="$(git rev-parse --short=12 HEAD)"
TAG="soporte-sap-laboratorio:${COMMIT}"

node "$AQUI/candado.mjs" estatico
docker build -f "$AQUI/Dockerfile" --build-arg "MESA_VERSION=${COMMIT}" -t "$TAG" .
node "$AQUI/candado.mjs" imagen "$TAG"

(cd "$AQUI" && npm ci --no-audit --no-fund >/dev/null)
WR="$RAIZ/$AQUI/node_modules/.bin/wrangler"
CUENTA="$("$WR" whoami 2>/dev/null | grep -oE '\b[a-f0-9]{32}\b' | head -1 || true)"
[ -n "$CUENTA" ] || { echo "✗ no sé tu cuenta de Cloudflare: corre antes, en una terminal aparte, npx wrangler@4.143.1 login" >&2; exit 1; }
REMOTA="registry.cloudflare.com/${CUENTA}/${TAG}"
# `containers push` deja la credencial del registro en ~/.docker/config.json, sin cifrar (medido el 2026-10-21): se
# quita al salir, pase lo que pase.
trap 'docker logout registry.cloudflare.com >/dev/null 2>&1 || true' EXIT
(cd "$AQUI" && "$WR" containers push "$TAG")

# La config que se despliega es la del repo con la imagen del commit: se genera aquí, se revisa y se borra al salir.
mkdir -p "$AQUI/.wrangler"
DESPLEGADA="$AQUI/.wrangler/desplegada.jsonc"
trap 'rm -f "$DESPLEGADA"; docker logout registry.cloudflare.com >/dev/null 2>&1 || true' EXIT
node -e "
const { jsonc } = await import('./$AQUI/candado.mjs');
const fs = await import('node:fs');
const c = jsonc(fs.readFileSync('$AQUI/wrangler.jsonc', 'utf8'));
c.main = '../entrada.mjs'; c.containers[0].image = process.argv[1]; c.vars.ACCESS_EQUIPO = process.argv[2]; delete c.containers[0].image_build_context; delete c['\$schema'];
fs.writeFileSync('$DESPLEGADA', JSON.stringify(c, null, 2));
" "$REMOTA" "$ACCESS_EQUIPO"
node "$AQUI/candado.mjs" estatico "$DESPLEGADA"
(cd "$AQUI" && "$WR" deploy -c .wrangler/desplegada.jsonc) | tee "$AQUI/.wrangler/ultima-salida.txt"

URL="$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$AQUI/.wrangler/ultima-salida.txt" | head -1 || true)"
if [ -z "$URL" ]; then echo "✗ NO PUDE COMPROBARLO: no encontré la URL del Worker en la salida de wrangler. Comprueba a mano que sin sesión no abre." >&2; exit 1; fi
echo "Desplegado: ${URL} (imagen ${REMOTA})"
node "$AQUI/candado.mjs" access "$URL" || { echo "✗ Access no está puesto: actívalo en el Worker (Settings → Domains & Routes → Cloudflare Access) y vuelve a comprobar con: node $AQUI/candado.mjs access ${URL}" >&2; exit 1; }
