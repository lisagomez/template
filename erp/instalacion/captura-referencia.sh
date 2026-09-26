#!/usr/bin/env bash
# ERP · captura la REFERENCIA de producción (esquema + roles), en SOLO LECTURA.
# Deja en referencia/ lo que prueba-efimera.sh compara contra una instalación
# desde cero: así "idéntico a producción" se comprueba sin volver a producción.
#
# Credencial: un login de SOLO LECTURA miembro de rol_swm (nunca service_role,
# nunca el dueño). pg_dump abre su transacción READ ONLY; psql se fuerza igual.
# Uso:  ERP_LECTOR_DB_URL=… bash erp/instalacion/captura-referencia.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="$DIR/referencia"
[ -n "${ERP_LECTOR_DB_URL:-}" ] || { echo "captura-referencia.sh: falta ERP_LECTOR_DB_URL" >&2; exit 1; }
export ERP_DB_URL="$ERP_LECTOR_DB_URL"
# shellcheck source=lib.sh
. "$DIR/lib.sh"

tapa() { sed -E 's#postgres(ql)?://[^ ]+#<conexión oculta>#g'; }

docker run --rm -e ERP_DB_URL postgres:17-alpine \
  sh -c 'pg_dump "$ERP_DB_URL" --schema-only --schema=erp --no-owner --no-tablespaces' 2> >(tapa >&2) \
  | normaliza_volcado > "$REF/esquema-erp.sql"
{ echo "set default_transaction_read_only = on;"; cat "$REF/roles.sql"; } \
  | sql -At -f - > "$REF/roles.txt"
sql -At -c "select 'PostgreSQL ' || current_setting('server_version')" > "$REF/servidor.txt"

echo "referencia capturada: $(wc -l < "$REF/esquema-erp.sql") líneas de esquema, $(wc -l < "$REF/roles.txt") de roles, $(cat "$REF/servidor.txt")"
