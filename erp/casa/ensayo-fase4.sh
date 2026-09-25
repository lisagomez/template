#!/usr/bin/env bash
# PRP-004 · Fase 4 · ensayo de la re-ubicación, sin tocar producción.
#   1. copia el catálogo de la casa (act_activo, act_version, act_costo, sis_folio, sis_bitacora)
#      desde producción con un login de SOLO LECTURA (transacción read only)
#   2. instala el ERP en un Postgres efímero con erp/instalacion/instalar.sh y carga la copia
#   3. corre erp/casa/fase4-reubicacion.sql por el puente (rol_exe_fin + tenant), como en producción
#   4. muestra el diff de filas antes/después y los totales (sin montos por activo)
#   5. corre el detector swm-act en seco contra el catálogo re-ubicado
#   6. prueba el reverso (vuelve a la foto de antes)
#   7. destruye el efímero y la copia: el catálogo (con costos) no queda en disco
# Uso:  ERP_LECTOR_DB_URL=… bash erp/casa/ensayo-fase4.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DIR/../.." && pwd)"
[ -n "${ERP_LECTOR_DB_URL:-}" ] || { echo "falta ERP_LECTOR_DB_URL (solo lectura)" >&2; exit 1; }
CASA="$(grep '^ERP_TENANT_ID=' "$DIR/parametros-casa.env" | cut -d= -f2)"
IMAGEN=postgres:17-alpine
ID="erp-ensayo4-$$"
TMP="$(mktemp -d)"
limpia() { docker rm -f "$ID" >/dev/null 2>&1 || true; docker network rm "$ID" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpia EXIT
tapa() { sed -E 's#postgres(ql)?://[^ ]+#<conexión oculta>#g'; }

echo "== 1. copia del catálogo de la casa (solo lectura)"
tablas=(
  "act_activo|select * from erp.act_activo"
  "act_version|select cliente_id, activo_id, version, hash, origen, origen_task_id, created_at from erp.act_version"
  "act_costo|select cliente_id, activo_id, componente, monto, moneda, eje_dei, origen_task_id, origen_encargo_id, tokens_in, tokens_out, fuente, periodo, created_at from erp.act_costo"
  "sis_folio|select * from erp.sis_folio"
  "sis_bitacora|select cliente_id, traza_id, actor, actor_tipo, modulo, verbo, entidad_tipo, entidad_id, payload, resultado, aprobado_por, created_at from erp.sis_bitacora"
)
for t in "${tablas[@]}"; do
  nombre="${t%%|*}"; consulta="${t#*|}"
  printf 'begin read only;\nselect set_config(%s, %s, true);\n\\copy (%s) to stdout\ncommit;\n' \
    "'app.cliente_id'" "'$CASA'" "$consulta" \
    | docker run --rm -i -e ERP_LECTOR_DB_URL "$IMAGEN" sh -c 'psql "$ERP_LECTOR_DB_URL" -X -q -v ON_ERROR_STOP=1 -At' \
    2> >(tapa >&2) | grep -v -E '^(BEGIN|COMMIT|'"$CASA"')$' > "$TMP/$nombre.copy"
  echo "  $nombre: $(wc -l < "$TMP/$nombre.copy") filas"
done

echo "== 2. efímero + instalación + carga"
docker network create "$ID" >/dev/null
docker run -d --name "$ID" --network "$ID" -e POSTGRES_PASSWORD=efimero "$IMAGEN" >/dev/null
for _ in $(seq 60); do docker exec "$ID" psql -U postgres -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export ERP_DB_URL="postgresql://postgres:efimero@$ID:5432/postgres" ERP_TENANT_ID="$CASA" ERP_MARCA="ensayo fase 4"
export ERP_PUENTE_POSTGRES=1 ERP_LOGIN_EJECUTOR="" ERP_LOGIN_LECTOR=""
export ERP_PSQL="docker run --rm -i --network $ID -e ERP_DB_URL -e ERP_MARCA -e ERP_TENANT_ID -e ERP_LOGIN_NOMBRE -e ERP_LOGIN_PASSWORD $IMAGEN psql"
bash "$RAIZ/erp/instalacion/instalar.sh" > "$TMP/instalar.log" || { cat "$TMP/instalar.log"; exit 1; }
echo "  instalado ($(grep -c '^  ok' "$TMP/instalar.log") pasos ok)"
cols() {
  case "$1" in
    act_version) echo "(cliente_id, activo_id, version, hash, origen, origen_task_id, created_at)";;
    act_costo) echo "(cliente_id, activo_id, componente, monto, moneda, eje_dei, origen_task_id, origen_encargo_id, tokens_in, tokens_out, fuente, periodo, created_at)";;
    sis_bitacora) echo "(cliente_id, traza_id, actor, actor_tipo, modulo, verbo, entidad_tipo, entidad_id, payload, resultado, aprobado_por, created_at)";;
    *) echo "";;
  esac
}
for t in act_activo act_version act_costo sis_folio sis_bitacora; do
  docker exec -i "$ID" psql -U postgres -X -q -v ON_ERROR_STOP=1 -c "\\copy erp.$t $(cols "$t") from stdin" < "$TMP/$t.copy"
done
q() { docker exec -i "$ID" psql -U postgres -X -q -At -v ON_ERROR_STOP=1 -c "set app.cliente_id = '$CASA'" -c "$1"; }
echo "  el trigger recalculó costo_acumulado desde el ledger: $(q "select case when count(*) filter (where costo_acumulado <> coalesce((select sum(monto) from erp.act_costo c where c.activo_id = a.id), 0)) = 0 then 'igual a lo almacenado en producción' else 'DIFIERE' end from erp.act_activo a")"

foto() {
  q "select folio || ' | ' || estado || ' | ' || ubicacion from erp.act_activo order by folio" > "$TMP/filas-$1.txt"
  q "select 'activos=' || count(*) || ' folios=' || count(distinct folio) || ' costo_total=' || sum(costo_acumulado) || ' versiones=' || (select count(*) from erp.act_version) || ' costos=' || (select count(*) from erp.act_costo) || ' bitacora=' || (select count(*) from erp.sis_bitacora) from erp.act_activo" > "$TMP/totales-$1.txt"
}
foto antes

echo "== 3. fase4-reubicacion.sql por el puente (rol_exe_fin + tenant de la casa)"
# Mismo archivo que se pega en el SQL Editor; aquí los parámetros entran por la sesión.
fase4() {  # $1 = ida | vuelta
  docker exec -i "$ID" psql -U postgres -X -q -v ON_ERROR_STOP=1 \
    -c "set fase4.cliente = '$CASA'" -c "set fase4.aprobado_por = 'ensayo-efimero'" \
    -c "set fase4.sentido = '$1'" -f - < "$DIR/fase4-reubicacion.sql"
}
fase4 ida
foto despues
echo "== 3b. correrlo DOS veces: la guarda debe frenar la segunda sin dejar nada escrito"
if fase4 ida > "$TMP/segunda.txt" 2>&1; then echo "  LA SEGUNDA CORRIDA PASÓ (la guarda no frena)"; exit 1; fi
foto segunda
grep -m1 -o "ACT-0012 no está como se midió[^;]*" "$TMP/segunda.txt" | sed 's/^/  rechazada: /'
if diff -q "$TMP/totales-despues.txt" "$TMP/totales-segunda.txt" >/dev/null; then
  echo "  nada escrito: totales y bitácora iguales a la primera corrida"
else
  echo "  LA CORRIDA FALLIDA DEJÓ RASTRO"; exit 1
fi

echo "== 4. diff de filas (antes → después) y totales"
{ diff "$TMP/filas-antes.txt" "$TMP/filas-despues.txt" || true; } | grep -E '^[<>]' | sed 's/^/  /'
echo "  antes:   $(cat "$TMP/totales-antes.txt")"
echo "  después: $(cat "$TMP/totales-despues.txt")"
echo "  bitácora nueva: $(q "select modulo || '.' || verbo || ' ' || entidad_id || ' ' || (payload->>'de') || ' -> ' || (payload->>'a') || ' aprobado_por=' || aprobado_por || ' traza=' || (traza_id is not null) from erp.sis_bitacora where verbo = 'reubicar'")"

echo "== 5. detector swm-act en seco contra el catálogo re-ubicado"
q "select coalesce(json_object_agg(ubicacion, json_build_object('folio', folio, 'hash', coalesce(hash_vigente, ''), 'estado', estado)), '{}') from erp.act_activo" > "$TMP/catalogo.json"
( cd "$RAIZ" && env -u ERP_DB_URL -u REPO_BUSINESSOS TRIO_REPO_DIR="$TMP/sin-trio" \
    python3 erp/bin/detector-swm-act.py --catalogo-json "$TMP/catalogo.json" ) > "$TMP/detector.txt" 2>&1 || true
grep -E '^(NUEVO|CAMBIADO|HUERFANO|REUBICAR|AVISO|[0-9]+ hallazgo)' "$TMP/detector.txt" | sed 's/^/  /'
echo "  HUERFANO: $(grep -c '^HUERFANO' "$TMP/detector.txt" || true) · REUBICAR: $(grep -c '^REUBICAR' "$TMP/detector.txt" || true)"
echo "== 6. reverso (mismo archivo, set fase4.sentido = 'vuelta'): vuelve exactamente a la foto de antes"
fase4 vuelta
foto revertida
if diff -q "$TMP/filas-antes.txt" "$TMP/filas-revertida.txt" >/dev/null; then
  echo "  filas tras el reverso = filas antes ($(wc -l < "$TMP/filas-antes.txt")); bitácora: $(q "select count(*) from erp.sis_bitacora where verbo = 'reubicar'") asientos de reubicar (ida y vuelta)"
else
  echo "  REVERSO NO RESTAURA las filas"; exit 1
fi
echo "== 7. efímero y copia destruidos al salir"
