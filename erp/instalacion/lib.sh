# shellcheck shell=bash
# Común a instalar.sh y pruebas.sh: cómo se llama a psql y cómo se falla.
# Los datos viajan por entorno (\getenv en el SQL), nunca por argv: una contraseña
# en argv se ve en `ps`. La conexión nunca se imprime: se tapa en toda salida.

falla() { echo "${0##*/}: $*" >&2; exit 1; }

export ERP_DB_URL="${ERP_DB_URL:-}"

# psql: el indicado en ERP_PSQL, el local, o el de la imagen oficial por docker.
if [ -n "${ERP_PSQL:-}" ]; then
  read -r -a PSQL <<< "$ERP_PSQL"
elif command -v psql >/dev/null 2>&1; then
  PSQL=(psql)
else
  PSQL=(docker run --rm -i ${ERP_DOCKER_RED:+--network "$ERP_DOCKER_RED"}
        -e ERP_DB_URL -e ERP_MARCA -e ERP_TENANT_ID -e ERP_LOGIN_NOMBRE -e ERP_LOGIN_PASSWORD
        postgres:17-alpine psql)
fi

sql() {
  [ -n "$ERP_DB_URL" ] || falla "falta ERP_DB_URL (conexión con el dueño del esquema)"
  "${PSQL[@]}" "$ERP_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@" 2>&1 \
    | sed -E 's#postgres(ql)?://[^ ]+#<conexión oculta>#g'
  return "${PIPESTATUS[0]}"
}

# Volcado de esquema comparable: sin comentarios de pg_dump, SET de sesión, líneas
# \restrict (llave aleatoria por volcado, PG 17.6+) ni líneas vacías.
normaliza_volcado() {
  grep -vE '^(--|SET |SELECT pg_catalog\.set_config|\\restrict|\\unrestrict)' | sed '/^$/d'
}
