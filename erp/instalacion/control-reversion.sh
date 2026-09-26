#!/usr/bin/env bash
# ERP · la prueba de las pruebas. Rompe las migraciones de seis maneras y exige
# que prueba-efimera.sh caiga en ROJO en cada una. Un verde que nunca se ha visto
# en rojo no informa: si una mutación pasa en verde, la prueba no la vigila.
# Uso:  bash erp/instalacion/control-reversion.sh      (npm run erp:control)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG="$(cd "$DIR/../migrations" && pwd)"

# nombre | archivo | expresión sed | qué debería cazarla
MUTACIONES=(
  "sin FORCE RLS|004_seguridad.sql|s/force  row level security/no force row level security/|(h) + ≡ producción"
  "política abierta|004_seguridad.sql|s/using      (cliente_id = nullif(current_setting('app.cliente_id', true), '')::uuid)/using (true)/|(d) aislamiento"
  "ejecutor puede borrar|004_seguridad.sql|s/grant select, insert, update on all tables    in schema erp to rol_exe_fin;/grant select, insert, update, delete on all tables in schema erp to rol_exe_fin;/|(e) DELETE"
  "ledger de costo editable|004_seguridad.sql|s/array\['act_version','act_costo'\]/array['act_version']/|(f) append-only"
  "sin cuadre de cabecera|001_nucleo.sql|s/check (total = subtotal + impuestos_trasladados - impuestos_retenidos)/check (true)/|(b) rechazos"
  "índice que producción no tiene|002_pack_retail.sql|\$a create index if not exists inv_articulo_nombre_idx on erp.inv_articulo (nombre);|≡ producción"
)

cazadas=0
for m in "${MUTACIONES[@]}"; do
  IFS='|' read -r nombre archivo expr caza <<< "$m"
  tmp="$(mktemp -d)"; cp "$ORIG"/*.sql "$tmp"/
  # la mutación de 004 que quita act_costo también debe quitarse de 005 (el revoke vive en los dos)
  sed -i "$expr" "$tmp/$archivo"
  if [ "$archivo" = 004_seguridad.sql ] && [[ "$nombre" == "ledger de costo editable" ]]; then
    sed -i "s/revoke update on erp.act_costo   from rol_exe_fin;/-- (mutación) sin revoke/" "$tmp/005_activos.sql"
  fi
  if cmp -s "$ORIG/$archivo" "$tmp/$archivo"; then
    echo "ERROR  $nombre: la mutación no cambió $archivo (expresión desfasada)"; rm -rf "$tmp"; continue
  fi
  if ERP_MIGRACIONES="$tmp" bash "$DIR/prueba-efimera.sh" > "$tmp/salida.txt" 2>&1; then
    echo "VIVA   $nombre — pasó en VERDE (nadie vigila: $caza)"
  else
    motivo="$(grep -m1 -E '^(ERROR|FALLO|psql:.*ERROR)' "$tmp/salida.txt" | cut -c1-110)"
    echo "CAZADA $nombre — ${motivo:-rojo}"
    cazadas=$((cazadas + 1))
  fi
  rm -rf "$tmp"
done
echo
echo "control de reversión: $cazadas de ${#MUTACIONES[@]} mutaciones cazadas"
[ "$cazadas" -eq "${#MUTACIONES[@]}" ]
