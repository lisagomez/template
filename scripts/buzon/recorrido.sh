#!/usr/bin/env bash
# Recorrido del buzón de CFDI (spec 015, TAR-19) de punta a punta, en un stack DESECHABLE y con datos sintéticos.
#
#   npm run recorrido:buzon
#
# Levanta el Supabase del despacho (docker-compose.despacho.yml, proyecto aparte y puertos propios), aplica las
# migraciones, da de alta una cuenta sintética y la hace miembro, arranca el servicio del extractor y la app, corre
# scripts/buzon/recorrido.mjs en el navegador y, al terminar o al fallar, lo borra TODO: contenedores, volúmenes y
# secretos. Al repo solo llegan las capturas y el resumen de pasos (.claude/specs/015-piloto-buzon-cfdi/recorrido/).
#
# Requiere Docker con Compose, Chromium de Playwright y Tesseract (si no está en el PATH: TESSERACT_CMD,
# LD_LIBRARY_PATH y TESSDATA_PREFIX). No es un gate: necesita Docker y tarda unos minutos.
set -euo pipefail

RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
cd "$RAIZ"
TMP=$(mktemp -d)
PROYECTO=despacho-recorrido
PUERTO_TLS=${PUERTO_TLS:-18443}
PUERTO_EXTRACTOR=${PUERTO_EXTRACTOR:-18080}
DESTINO=${DESTINO:-$RAIZ/.claude/specs/015-piloto-buzon-cfdi/recorrido}
XML=${XML:-$RAIZ/tools/extractor-documental/pruebas/fixtures/cfdi-40-ingreso.xml}
PIDS=()

compose() { docker compose -p "$PROYECTO" -f docker-compose.despacho.yml -f "$TMP/puertos.yml" --env-file "$TMP/.env" "$@"; }
psql_db() { compose exec -T db sh -c 'PGOPTIONS="-c client_min_messages=warning" PGPASSWORD="$POSTGRES_PASSWORD" psql -q -v ON_ERROR_STOP=1 -U postgres -h localhost -d postgres'; }
valor() { grep -E "^$1=" "$TMP/.env" | cut -d= -f2-; }
espera() { # url, intentos: sin sleep suelto en primer plano, curl reintenta
  curl -sk --retry "$2" --retry-connrefused --retry-delay 2 -o /dev/null -w '%{http_code}' --resolve "localhost:$PUERTO_TLS:127.0.0.1" "$1"
}
limpia() {
  local codigo=$?
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  compose down -v >/dev/null 2>&1 || true
  rm -rf "$TMP"
  echo "recorrido: stack, volúmenes y secretos borrados (salida $codigo)"
}
trap limpia EXIT

echo "recorrido: secretos sintéticos en $TMP (se borran al salir)"
printf 'DOMAIN=localhost\nTLS_EMAIL=operacion@despacho-ejemplo.mx\nNEXT_PUBLIC_SITE_URL=https://localhost\nNEXT_PUBLIC_SUPABASE_URL=https://localhost\n' > "$TMP/.env"
ENV_PRODUCCION="$TMP/.env" node scripts/despacho/llaves.mjs >/dev/null
printf 'services:\n  caddy:\n    ports: !override\n      - "%s:443"\n' "$PUERTO_TLS" > "$TMP/puertos.yml"

npm run -s prepara:gate >/dev/null
compose up -d db auth rest storage >/dev/null 2>&1
for _ in $(seq 1 60); do [ "$(compose ps --format '{{.Health}}' | grep -c '^healthy$')" -ge 4 ] && break; sleep 2; done
compose up -d --no-deps caddy >/dev/null 2>&1
for f in supabase/migrations/*.sql; do psql_db < "$f" >/dev/null; done
echo "notify pgrst, 'reload schema';" | psql_db >/dev/null
echo "recorrido: $(ls supabase/migrations/*.sql | wc -l) migraciones aplicadas"

SRV=$(valor SERVICE_ROLE_KEY)
espera "https://localhost:$PUERTO_TLS/auth/v1/health" 30 >/dev/null
ID=$(curl -sk --resolve "localhost:$PUERTO_TLS:127.0.0.1" -X POST "https://localhost:$PUERTO_TLS/auth/v1/admin/users" \
  -H "Authorization: Bearer $SRV" -H "apikey: $SRV" -H 'Content-Type: application/json' \
  -d '{"email":"contadora@despacho-ejemplo.mx","password":"sintetica-larga-1234","email_confirm":true}' \
  | node -e 'let s="";process.stdin.on("data",(c)=>s+=c).on("end",()=>console.log(JSON.parse(s).id))')
echo "insert into public.buzon_miembros (usuario_id) values ('$ID');" | psql_db >/dev/null
compose cp caddy:/data/caddy/pki/authorities/local/root.crt "$TMP/caddy-root.crt" >/dev/null 2>&1
echo "recorrido: cuenta sintética dada de alta y hecha miembro"

EXTRACTOR_PUERTO=$PUERTO_EXTRACTOR EXTRACTOR_ESCUCHA=127.0.0.1 EXTRACTOR_RESPALDO=ninguno \
  setsid node tools/extractor-documental/servicio/servidor.mjs > "$TMP/extractor.log" 2>&1 &
PIDS+=($!)
NEXT_PUBLIC_SUPABASE_URL="https://localhost:$PUERTO_TLS" NEXT_PUBLIC_SUPABASE_ANON_KEY=$(valor NEXT_PUBLIC_SUPABASE_ANON_KEY) \
  NEXT_PUBLIC_SITE_URL=http://localhost EXTRACTOR_SERVICIO_URL="http://127.0.0.1:$PUERTO_EXTRACTOR" \
  NODE_EXTRA_CA_CERTS="$TMP/caddy-root.crt" setsid npm run dev > "$TMP/app.log" 2>&1 &
PIDS+=($!)
[ "$(curl -s --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUERTO_EXTRACTOR/health")" = 200 ] \
  || { echo "recorrido: el extractor no arrancó"; tail -5 "$TMP/extractor.log"; exit 1; }
APP=""
for _ in $(seq 1 60); do APP=$(grep -oE 'http://localhost:30[0-9]{2}' "$TMP/app.log" | head -1 || true); [ -n "$APP" ] && break; sleep 2; done
[ -n "$APP" ] || { echo "recorrido: la app no arrancó"; tail -5 "$TMP/app.log"; exit 1; }
curl -s --retry 30 --retry-connrefused --retry-delay 2 -o /dev/null "$APP/login"
echo "recorrido: app en $APP; empieza el navegador"

set +e
APP="$APP" SALIDA="$TMP/salida" XML="$XML" node scripts/buzon/recorrido.mjs
CODIGO=$?
set -e
rm -rf "$DESTINO" && mkdir -p "$DESTINO"
cp "$TMP"/salida/capturas/*.png "$TMP/salida/pasos.json" "$DESTINO/" 2>/dev/null || true
echo "recorrido: capturas y pasos en ${DESTINO#$RAIZ/}"
exit $CODIGO
