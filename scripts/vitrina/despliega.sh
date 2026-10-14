#!/usr/bin/env bash
# Despliega la vitrina de Soporte SAP a Vercel: se construye AQUÍ, como vitrina (VITRINA_SOPORTE_SAP=1: en ese
# despliegue solo existe la vitrina), y a Vercel sube el resultado. Después comprueba que la URL del despliegue y la de
# producción respondan «protegida» a quien llega sin sesión; si no, o si no responden, lo dice y sale con error.
# Antes, una vez: vercel login, vercel link (sin conectar el repo de Git: conectado, Vercel construiría cada push con
# la aplicación entera), y en el panel de Vercel la protección en TODOS los despliegues.
# Uso: bash scripts/vitrina/despliega.sh
set -euo pipefail
VERCEL="npx --yes vercel@63.1.2"
if [ -n "${SOPORTE_SAP_LABORATORIO+x}" ]; then echo "✗ SOPORTE_SAP_LABORATORIO está en este entorno: la vitrina no lleva el laboratorio. Sal de este entorno y vuelve a correrlo." >&2; exit 1; fi
$VERCEL pull --yes --environment=production
VITRINA_SOPORTE_SAP=1 $VERCEL build --prod
# Lo que no está en Git no sube: @vercel/next mete todo `.env*` de la raíz en cada función (incidente del 2026-10-12).
node scripts/vitrina/sin-env.mjs
SALIDA="$($VERCEL deploy --prebuilt --prod)"
# vercel@63 escribe JSON a stdout cuando no hay terminal, y la URL sola cuando la hay: se aceptan las dos.
URLS="$(node -e '
const s = process.argv[1].trim()
if (!s.startsWith("{")) { const u = s.split("\n").pop().trim(); console.log(u, u); process.exit(0) }
const d = JSON.parse(s).deployment ?? {}
if (!d.url) { console.error("✗ vercel deploy no devolvió la URL del despliegue"); process.exit(1) }
console.log(d.url, d.productionUrl ?? d.url)' "$SALIDA")"
read -r URL PRODUCCION <<< "$URLS"
echo "✓ desplegada: $URL (producción: $PRODUCCION)"
node -e "
import('./src/features/soporte-sap/vitrina/en-vivo/portero.ts').then(async ({ vitrinaProtegida }) => {
  let bien = true
  for (const url of new Set(process.argv.slice(1))) {
    const p = await vitrinaProtegida(url)
    if (p.protegida) { console.log('✓ sin sesión no abre: ' + url + ' (' + p.vio + ')'); continue }
    bien = false
    console.log(p.vio.startsWith('sin respuesta')
      ? '✗ NO PUDE COMPROBARLO: ' + url + ' (' + p.vio + '): ábrela en una ventana privada antes de compartirla'
      : '✗ RESPONDE A CUALQUIERA: ' + url + ' (' + p.vio + '): activa la protección de Vercel en todos los despliegues, ya')
  }
  process.exit(bien ? 0 : 1)
})" "$URL" "$PRODUCCION"
