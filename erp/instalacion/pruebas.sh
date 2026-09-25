#!/usr/bin/env bash
# ERP · pruebas de cierre contra una instalación (efímera o real).
# Todo corre en una transacción que se deshace: no deja filas.
# Uso:  ERP_DB_URL=… ERP_TENANT_ID=<uuid del tenant> bash erp/instalacion/pruebas.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -n "${ERP_TENANT_ID:-}" ] || { echo "pruebas.sh: falta ERP_TENANT_ID" >&2; exit 1; }
export ERP_TENANT_ID
# shellcheck source=lib.sh
. "$DIR/lib.sh"

echo "== pruebas de cierre"
sql -f - < "$DIR/pruebas.sql" || falla "UNA PRUEBA FALLÓ (arriba el detalle); la transacción se deshizo"
