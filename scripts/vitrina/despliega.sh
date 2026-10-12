#!/usr/bin/env bash
# Despliega la vitrina de Soporte SAP a Vercel: se construye AQUÍ, como vitrina (VITRINA_SOPORTE_SAP=1: en ese
# despliegue solo existe la vitrina), y a Vercel sube el resultado. Después comprueba que la URL responda «protegida» a
# quien llega sin sesión; si no, lo dice y sale con error.
# Antes, una vez: vercel login, vercel link (sin conectar el repo de Git: conectado, Vercel construiría cada push con
# la aplicación entera), y en el panel de Vercel la protección en TODOS los despliegues.
# Uso: bash scripts/vitrina/despliega.sh
set -euo pipefail
VERCEL="npx --yes vercel@63.1.2"
if [ -n "${SOPORTE_SAP_LABORATORIO+x}" ]; then echo "✗ SOPORTE_SAP_LABORATORIO está en este entorno: la vitrina no lleva el laboratorio. Sal de este entorno y vuelve a correrlo." >&2; exit 1; fi
$VERCEL pull --yes --environment=production
VITRINA_SOPORTE_SAP=1 $VERCEL build --prod
URL="$($VERCEL deploy --prebuilt --prod)"
echo "✓ desplegada: $URL"
node -e "
import('./src/features/soporte-sap/vitrina/en-vivo/portero.ts').then(async ({ vitrinaProtegida }) => {
  const p = await vitrinaProtegida(process.argv[1])
  console.log(p.protegida ? '✓ sin sesión no abre (' + p.vio + ')' : '✗ RESPONDE A CUALQUIERA (' + p.vio + '): activa la protección de Vercel en todos los despliegues, ya')
  process.exit(p.protegida ? 0 : 1)
})" "$URL"
