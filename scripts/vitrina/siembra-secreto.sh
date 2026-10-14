#!/usr/bin/env bash
# Configura la sección en vivo de la vitrina de Soporte SAP, sin imprimir nunca el secreto:
#   · genera el secreto aquí (64 caracteres hexadecimales);
#   · lo guarda en ~/.soporte-sap-en-vivo.env (solo legible por ti), con la URL de la vitrina, para el portero;
#   · y le da a Vercel, por la entrada estándar y como variables de producción del proyecto enlazado, el secreto
#     (sensible), la URL del túnel y VITRINA_SOPORTE_SAP=1.
# Uso: bash scripts/vitrina/siembra-secreto.sh https://<tu-vitrina>.vercel.app https://<tu-tunel>
# Volver a correrlo ROTA el secreto: redespliega (scripts/vitrina/despliega.sh) y reinicia el portero.
set -euo pipefail
VERCEL="npx --yes vercel@63.1.2"
VITRINA="${1:?falta la URL de la vitrina (https://<tu-vitrina>.vercel.app)}"
TUNEL="${2:?falta la URL del túnel (https://..., sin ruta)}"
ARCHIVO="$HOME/.soporte-sap-en-vivo.env"
umask 077
SECRETO="$(openssl rand -hex 32)"
printf 'EN_VIVO_SECRETO=%s\nEN_VIVO_VITRINA=%s\nEN_VIVO_LABORATORIO=http://localhost:3011\nEN_VIVO_PUERTO=8787\n' "$SECRETO" "$VITRINA" > "$ARCHIVO"
printf '%s' "$SECRETO" | $VERCEL env add EN_VIVO_SECRETO production --sensitive --force >/dev/null
unset SECRETO
printf '%s' "$TUNEL" | $VERCEL env add EN_VIVO_URL production --no-sensitive --force >/dev/null
printf '1' | $VERCEL env add VITRINA_SOPORTE_SAP production --no-sensitive --force >/dev/null
echo "✓ en $ARCHIVO (permisos 600) y en Vercel (producción): el secreto (sensible, no se imprimió), la URL del túnel y VITRINA_SOPORTE_SAP=1."
echo "  Redespliega para que Vercel los use: bash scripts/vitrina/despliega.sh"
