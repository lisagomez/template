#!/usr/bin/env bash
# Valida la PROPUESTA del pack de etiquetas encima del ERP, en un Postgres 17 DESECHABLE.
# No toca ninguna base compartida: el contenedor nace y muere aquí.
#   1. aplica erp/migrations/001..005 (de main, leídas con git) y el pack
#   2. pruebas (a)…(f)
#   3. re-corre 004 TAL CUAL y comprueba el hallazgo: reabre el UPDATE de los ledgers del pack
#   4. aplica 004 con los ledgers del pack en su lista + el pack otra vez (idempotencia) → verde
# Uso: bash tools/etiquetas-gs1/migraciones/prueba-efimera.sh [ref-de-git]   (por defecto origin/main)
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(git -C "$DIR" rev-parse --show-toplevel)"
REF="${1:-origin/main}"
IMAGEN=postgres:17-alpine
ID="eti-efimero-$$"
TMP="$(mktemp -d)"
limpia() { docker rm -f "$ID" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT

for f in $(git -C "$RAIZ" ls-tree --name-only "$REF" erp/migrations/ | grep -E '/00[1-5]_.*\.sql$'); do
  git -C "$RAIZ" show "$REF:$f" > "$TMP/$(basename "$f")"
done
ls "$TMP"/*.sql >/dev/null 2>&1 || { echo "no encontré erp/migrations/00[1-5] en $REF"; exit 2; }
echo "== ERP de $REF: $(cd "$TMP" && ls *.sql | tr '\n' ' ')"

docker run -d --name "$ID" -e POSTGRES_PASSWORD="$(openssl rand -hex 12)" "$IMAGEN" >/dev/null
for _ in $(seq 60); do docker exec "$ID" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
sql() { docker exec -e PGOPTIONS='-c client_min_messages=warning' -i "$ID" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
prueba() { docker exec -i "$ID" psql -U postgres -X -q -v ON_ERROR_STOP=1 < "$DIR/pruebas.sql" 2>&1 | sed -n 's/^.*NOTICE:  \(([a-f])\)/  \1/p'; }

echo "== 1. ERP 001..005 + pack"
for f in "$TMP"/00[1-5]_*.sql; do sql < "$f" >/dev/null; done
sql < "$DIR/propuesta-pack-etiquetas.sql" >/dev/null
# 004 cierra la instalación (RLS por tenant en toda tabla de erp, incluidas las del pack)
sql < "$TMP/004_seguridad.sql" >/dev/null
# y el pack vuelve a poner sus revokes (como hace 005 con los suyos)
sql < "$DIR/propuesta-pack-etiquetas.sql" >/dev/null
echo "== 2. pruebas"
prueba

echo "== 3. re-correr 004 TAL CUAL (lo que hace quien añade otro pack)"
sql < "$TMP/004_seguridad.sql" >/dev/null
if sql -c "set role rol_exe_fin; set app.cliente_id='11111111-1111-4111-8111-111111111111'; update erp.eti_emitido set tipo = tipo;" >/dev/null 2>&1; then
  echo "  HALLAZGO confirmado: con 004 tal cual, rol_exe_fin vuelve a poder hacer UPDATE en eti_emitido"
else
  echo "  004 ya no reabre el UPDATE de los ledgers del pack"
fi

echo "== 4. 004 con los ledgers del pack en su lista + pack otra vez (idempotencia)"
sed "s/array\['act_version','act_costo'\]/array['act_version','act_costo','eti_asignacion','eti_emitido','eti_importacion']/" "$TMP/004_seguridad.sql" > "$TMP/004_parcheado.sql"
grep -q "eti_emitido" "$TMP/004_parcheado.sql" || { echo "no pude parchear 004"; exit 3; }
sed -i "s/revoke update on erp.%I from rol_exe_fin;/revoke update, delete on erp.%I from rol_exe_fin;/" "$TMP/004_parcheado.sql"
sql < "$DIR/propuesta-pack-etiquetas.sql" >/dev/null
sql < "$TMP/004_parcheado.sql" >/dev/null
sql -c "delete from erp.eti_existencia; delete from erp.eti_asignacion; delete from erp.eti_emitido; delete from erp.eti_articulo; delete from erp.eti_sitio; delete from erp.inv_articulo;" >/dev/null
prueba
echo "== OK: la propuesta se instala dos veces, cierra con 004 y pasa (a)…(f). No se aplicó a ninguna base real."
