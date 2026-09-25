#!/usr/bin/env bash
# ERP · prueba de instalación desde cero en un Postgres EFÍMERO (docker).
#   1. levanta postgres:17 desechable en su propia red
#   2. instala con un tenant y una marca ficticios (+ puente + logins de prueba)
#   3. corre las pruebas de cierre
#   4. instala OTRA VEZ (idempotencia): el esquema no cambia y las pruebas siguen en verde
#   5. compara esquema y roles contra la referencia de producción (referencia/)
#   6. destruye todo: no queda nada escrito en ningún sitio
# Uso:  bash erp/instalacion/prueba-efimera.sh      (npm run erp:prueba)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="$DIR/referencia"
IMAGEN=postgres:17-alpine
ID="erp-efimero-$$"
TMP="$(mktemp -d)"

limpia() { docker rm -f "$ID" >/dev/null 2>&1 || true; docker network rm "$ID" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT

echo "== efímero: $IMAGEN en la red $ID"
docker network create "$ID" >/dev/null
docker run -d --name "$ID" --network "$ID" -e POSTGRES_PASSWORD=efimero "$IMAGEN" >/dev/null
for _ in $(seq 60); do
  docker exec "$ID" psql -U postgres -c 'select 1' >/dev/null 2>&1 && break
  sleep 1
done

# Tenant y marca FICTICIOS; contraseñas de prueba de un solo uso (el contenedor muere al final).
export ERP_DB_URL="postgresql://postgres:efimero@$ID:5432/postgres"
export ERP_DOCKER_RED="$ID" ERP_PSQL=""
export ERP_TENANT_ID="11111111-1111-4111-8111-111111111111"
export ERP_MARCA="Marca Demo"
export ERP_PUENTE_POSTGRES=1
export ERP_LOGIN_EJECUTOR=demo_ejecutor ERP_LOGIN_EJECUTOR_PASSWORD="$(openssl rand -hex 16)"
export ERP_LOGIN_LECTOR=demo_lector     ERP_LOGIN_LECTOR_PASSWORD="$(openssl rand -hex 16)"
# El psql del host no alcanza la red del efímero: siempre el de la imagen.
ERP_PSQL="docker run --rm -i --network $ID -e ERP_DB_URL -e ERP_MARCA -e ERP_TENANT_ID -e ERP_LOGIN_NOMBRE -e ERP_LOGIN_PASSWORD $IMAGEN psql"
export ERP_PSQL

volcado() {
  docker exec "$ID" pg_dump -U postgres --schema-only --schema=erp --no-owner --no-tablespaces
}
roles() { docker exec -i "$ID" psql -U postgres -X -q -At -f - < "$REF/roles.sql"; }
# shellcheck source=lib.sh
. "$DIR/lib.sh"

echo; echo "######## INSTALACIÓN 1 (desde cero)"
bash "$DIR/instalar.sh"
echo; bash "$DIR/pruebas.sh"
volcado | normaliza_volcado > "$TMP/esquema-1.sql"

echo; echo "######## INSTALACIÓN 2 (idempotencia: misma base, otra vez)"
bash "$DIR/instalar.sh"
echo; bash "$DIR/pruebas.sh"
volcado | normaliza_volcado > "$TMP/esquema-2.sql"

echo; echo "######## COMPARACIONES"
fallos=0
if diff -u "$TMP/esquema-1.sql" "$TMP/esquema-2.sql"; then
  echo "OK idempotencia: el esquema tras la 2ª instalación es idéntico al de la 1ª ($(wc -l < "$TMP/esquema-1.sql") líneas)"
else
  echo "FALLO idempotencia: la 2ª instalación cambió el esquema"; fallos=$((fallos + 1))
fi

if [ -s "$REF/esquema-erp.sql" ]; then
  # Única diferencia admitida: el comentario del esquema, que lleva la marca y el tenant
  # de ESTA instalación (parámetro). Todo lo demás debe ser idéntico a producción.
  grep -v "^COMMENT ON SCHEMA erp IS " "$TMP/esquema-2.sql" > "$TMP/esquema-sin-identidad.sql"
  grep -v "^COMMENT ON SCHEMA erp IS " "$REF/esquema-erp.sql" > "$TMP/referencia-sin-identidad.sql"
  if diff -u "$TMP/referencia-sin-identidad.sql" "$TMP/esquema-sin-identidad.sql"; then
    echo "OK esquema ≡ producción: $(wc -l < "$TMP/esquema-sin-identidad.sql") líneas idénticas a referencia/esquema-erp.sql ($(cat "$REF/servidor.txt" 2>/dev/null || echo 'servidor ?'))"
    echo "   (diferencia admitida y documentada: COMMENT ON SCHEMA erp = identidad de la instalación)"
  else
    echo "FALLO esquema ≠ producción (diff arriba: - producción, + instalación)"; fallos=$((fallos + 1))
  fi
else
  echo "AVISO sin referencia de producción (corre captura-referencia.sh): no se comparó"; fallos=$((fallos + 1))
fi

roles | sed 's/[[:space:]]*$//' > "$TMP/roles.txt"
if diff -u "$REF/roles.txt" "$TMP/roles.txt"; then
  echo "OK roles ≡ producción: grupos, logins por función y puente ($(wc -l < "$TMP/roles.txt") líneas)"
else
  echo "FALLO roles ≠ producción (diff arriba)"; fallos=$((fallos + 1))
fi

echo
if [ "$fallos" -eq 0 ]; then
  echo "PRUEBA EFÍMERA EN VERDE: instalación limpia + idempotente + pruebas de cierre + ≡ producción"
else
  echo "PRUEBA EFÍMERA EN ROJO: $fallos comparación(es) fallida(s)"; exit 1
fi
