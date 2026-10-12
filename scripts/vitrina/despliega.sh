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
# @vercel/next mete en CADA función todo `.env` y `.env.*` de la raíz, sin mirar outputFileTracingExcludes: su nube
# construye desde Git y no los ve, pero este build se hace aquí. Lo que no está en Git no sube (`vercel link` deja un
# `.env.local` con un token, y viajó en los dos primeros despliegues).
node -e "
const { readdirSync, readFileSync, statSync } = require('node:fs'), { join, basename } = require('node:path')
const enGit = new Set(require('node:child_process').execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n'))
const fuera = new Set()
const recorre = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) recorre(p); else if (n === '.vc-config.json') for (const v of Object.values(JSON.parse(readFileSync(p, 'utf8')).filePathMap ?? {})) if (/^\.env/.test(basename(v)) && !enGit.has(v)) fuera.add(v) } }
recorre('.vercel/output/functions')
if (fuera.size) { console.error('✗ no se sube: ' + [...fuera].join(', ') + ' iría dentro de cada función. Sácalo de la raíz del worktree y vuelve a correrlo.'); process.exit(1) }
console.log('✓ ningún .env fuera de Git va en las funciones')"
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
