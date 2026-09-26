#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# ERP · instalador de marca blanca
# ═══════════════════════════════════════════════════════════════════
# Instala el esquema `erp` (migraciones NNN_*.sql en orden + 004 como cierre de
# seguridad) en la base que se le indique. La identidad del tenant es un
# PARÁMETRO: nada de quien opera el ERP va escrito en los archivos.
#
# Idempotente: correrlo dos veces deja la base igual. No borra nada.
#
# Parámetros (variables de entorno):
#   ERP_DB_URL                    obligatoria. Conexión con el dueño del esquema
#                                 (en Supabase: el usuario postgres). Nunca se imprime.
#   ERP_MARCA                     obligatoria. Nombre comercial de la instalación.
#   ERP_TENANT_ID                 uuid del tenant inicial. Si falta, se genera uno.
#   ERP_PUENTE_POSTGRES=1         otorga los roles del ERP al usuario de ERP_DB_URL para que
#                                 pueda hacer SET ROLE (operación manual mientras no haya un
#                                 login dedicado; lo necesitan también las pruebas de cierre).
#   ERP_LOGIN_EJECUTOR            nombre del login del ejecutor (rol_exe_fin + rol_swm).
#   ERP_LOGIN_EJECUTOR_PASSWORD   su contraseña (solo al crearlo; si ya existe no se toca).
#   ERP_LOGIN_LECTOR              nombre del login de solo lectura (rol_swm).
#   ERP_LOGIN_LECTOR_PASSWORD     su contraseña (ídem).
#   ERP_PSQL                      comando psql a usar. Por defecto: psql local si existe,
#                                 si no el de la imagen postgres:17-alpine por docker.
#   ERP_DOCKER_RED                red de docker para ese psql (p. ej. la del efímero).
#
# Uso:  ERP_DB_URL=… ERP_MARCA="Mi Marca" bash erp/instalacion/instalar.sh
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRACIONES="$(cd "${ERP_MIGRACIONES:-$DIR/../migrations}" && pwd)"  # ERP_MIGRACIONES: solo para el control de reversión

[ -n "${ERP_MARCA:-}" ] || { echo "instalar.sh: falta ERP_MARCA (nombre comercial de la instalación)" >&2; exit 1; }
if [ -z "${ERP_TENANT_ID:-}" ]; then
  ERP_TENANT_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"
  echo "instalar: ERP_TENANT_ID no venía; generado uno nuevo"
fi
export ERP_MARCA ERP_TENANT_ID ERP_LOGIN_NOMBRE="" ERP_LOGIN_PASSWORD=""
# shellcheck source=lib.sh
. "$DIR/lib.sh"
[[ "$ERP_TENANT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
  || falla "ERP_TENANT_ID no es un uuid"

# ── 1. Pre-vuelo ────────────────────────────────────────────────────
echo "== pre-vuelo"
sql -At <<'SQL' || falla "no se pudo conectar"
select 'servidor: PostgreSQL ' || current_setting('server_version');
select case when current_setting('server_version_num')::int >= 130000
            then 'version: ok (gen_random_uuid nativo)'
            else 'version: INSUFICIENTE (se requiere PostgreSQL 13+)' end;
select 'esquema erp: ' || case when to_regnamespace('erp') is null then 'no existe (instalación nueva)'
                              else 'ya existe (re-instalación idempotente)' end;
SQL

# ── 2. Migraciones en orden + cierre de seguridad ───────────────────
echo "== migraciones"
shopt -s nullglob
archivos=("$MIGRACIONES"/[0-9][0-9][0-9]_*.sql)
[ "${#archivos[@]}" -gt 0 ] || falla "no hay migraciones en $MIGRACIONES"
aplica() { sql -c "set client_min_messages = warning" -f - < "$1" >/dev/null; }
for f in "${archivos[@]}"; do
  aplica "$f" || falla "falló $(basename "$f")"
  echo "  ok $(basename "$f")"
done
# 004 otra vez al final: grants + RLS sobre TODAS las tablas que dejaron los módulos.
aplica "$MIGRACIONES/004_seguridad.sql" || falla "falló el cierre de seguridad (004)"
echo "  ok cierre de seguridad (004 sobre todo el esquema)"

# ── 3. Identidad de la instalación (lo único del tenant que toca la BD) ──
ultima="$(basename "${archivos[-1]}" | cut -c1-3)"
sql -At <<SQL >/dev/null || falla "no se pudo registrar la identidad"
\\getenv marca ERP_MARCA
\\getenv tenant ERP_TENANT_ID
select format('comment on schema erp is %L',
              format('ERP marca blanca · marca: %s · tenant inicial: %s · migraciones: 001-%s',
                     :'marca', :'tenant', '$ultima')) \\gexec
SQL
echo "== identidad: marca y tenant inicial en el comentario del esquema"

# ── 4. Accesos opcionales (logins y puente) ─────────────────────────
existe_rol() { sql -At -c "select count(*) from pg_roles where rolname = '$1'"; }
crea_login() {  # $1 nombre, $2 nombre de la variable con la contraseña, $3 roles
  local nombre="$1" var_pw="$2" roles="$3"
  [ -n "$nombre" ] || return 0
  [[ "$nombre" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || falla "nombre de login inválido: $nombre"
  if [ "$(existe_rol "$nombre")" = 1 ]; then
    echo "  login $nombre: ya existía (contraseña sin tocar)"
  else
    [ -n "${!var_pw:-}" ] || falla "falta $var_pw para crear el login $nombre"
    ERP_LOGIN_NOMBRE="$nombre" ERP_LOGIN_PASSWORD="${!var_pw}" sql -At <<'SQL' >/dev/null \
      || falla "no se pudo crear el login $nombre"
\getenv nombre ERP_LOGIN_NOMBRE
\getenv pw ERP_LOGIN_PASSWORD
select format('create role %I login password %L', :'nombre', :'pw') \gexec
SQL
    echo "  login $nombre: creado"
  fi
  sql -c "grant $roles to \"$nombre\"" >/dev/null || falla "no se pudieron otorgar roles a $nombre"
  echo "  login $nombre: miembro de $roles"
}
if [ -n "${ERP_LOGIN_EJECUTOR:-}${ERP_LOGIN_LECTOR:-}" ]; then echo "== accesos"; fi
crea_login "${ERP_LOGIN_EJECUTOR:-}" ERP_LOGIN_EJECUTOR_PASSWORD "rol_exe_fin, rol_swm"
crea_login "${ERP_LOGIN_LECTOR:-}"   ERP_LOGIN_LECTOR_PASSWORD   "rol_swm"

if [ "${ERP_PUENTE_POSTGRES:-0}" = 1 ]; then
  # psql -c no admite SQL + \gexec en la misma cadena: va por stdin.
  sql -At <<'SQL' >/dev/null || falla "no se pudo otorgar el puente"
select format('grant rol_exe_fin, rol_swm, rol_admin to %I', current_user) \gexec
SQL
  echo "== puente: roles del ERP otorgados al usuario de instalación (SET ROLE habilitado)"
fi

# ── 5. Verificación estructural de lo instalado ─────────────────────
echo "== verificación"
sql -At <<'SQL'
select 'tablas en erp: ' || count(*) from pg_tables where schemaname = 'erp';
select 'tablas con RLS FORCE: ' || count(*) filter (where c.relrowsecurity and c.relforcerowsecurity)
       || ' de ' || count(*)
  from pg_class c where c.relnamespace = 'erp'::regnamespace and c.relkind = 'r';
select 'tablas con política tenant_aislamiento: ' || count(distinct tablename)
  from pg_policies where schemaname = 'erp' and policyname = 'tenant_aislamiento';
select 'append-only (sin UPDATE para rol_exe_fin): '
       || string_agg(t || '=' || case when has_table_privilege('rol_exe_fin', 'erp.' || t, 'update')
                                      then 'ABIERTA' else 'ok' end, ' ' order by t)
  from unnest(array['sis_bitacora','act_version','act_costo']) t;
select 'DELETE para rol_exe_fin en alguna tabla: '
       || case when bool_or(has_table_privilege('rol_exe_fin', c.oid, 'delete')) then 'SÍ (MAL)' else 'no' end
  from pg_class c where c.relnamespace = 'erp'::regnamespace and c.relkind = 'r';
SQL
cat <<EOF
== listo
Para los CLIs y agentes del tenant:
  ERP_TENANT_ID=$ERP_TENANT_ID
  (cada sesión: set local role rol_exe_fin; set local app.cliente_id = '<ERP_TENANT_ID>';)
Pruebas de cierre (requieren ERP_PUENTE_POSTGRES=1 o un superusuario; no dejan filas):
  ERP_DB_URL=… ERP_TENANT_ID=… bash erp/instalacion/pruebas.sh
EOF
