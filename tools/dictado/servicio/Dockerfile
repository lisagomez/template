# syntax=docker/dockerfile:1
# =============================================================================
# Servicio de transcripcion de @tu-scope/dictado — perfil CPU (el que arranca en cualquier VPS).
#
# Motor por defecto: Parakeet TDT 0.6B v3 int8 por sherpa-onnx (el que gano la medicion en CPU,
# ver README). Tambien lleva faster-whisper por si DICTADO_MOTOR=faster-whisper:<modelo>.
# Los PESOS no van en la imagen: se montan en /modelos (volumen), descargados con `npm run mide`
# o con las URLs pineadas de medicion/mide.mjs.
#
# PINEADO POR DIGEST: la base es node:22-bookworm-slim por sha256 (la misma que el extractor).
# Cambiar la base, el runtime o el modelo es un CDC (C1).
# =============================================================================

# ---- Stage 1: build del paquete (tsc) ---------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS builder
WORKDIR /paquete
COPY package.json tsconfig.json ./
COPY src ./src
COPY voz.tgz ./voz.tgz
RUN npm install --no-save --no-audit --no-fund typescript@5.9.3 @types/node@22.20.2 ./voz.tgz \
 && npx tsc -p tsconfig.json

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runner
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /dictado
COPY --from=builder /paquete/dist ./dist
COPY --from=builder /paquete/node_modules/@tu-scope ./node_modules/@tu-scope
COPY motores-locales ./motores-locales
COPY servicio/servidor.mjs servicio/configuracion.mjs ./servicio/
COPY package.json ./package.json
# Runtimes pineados (los peers opcionales del paquete). faster-whisper en su venv, tambien pineado.
RUN npm install --no-save --no-package-lock --omit=dev --no-audit --no-fund sherpa-onnx-node@1.13.8 onnxruntime-node@1.30.0 \
 && python3 -m venv /venv && /venv/bin/pip install --no-cache-dir faster-whisper==1.2.1

# Usuario sin privilegios; el audio nunca toca el disco, asi que no hay temporal que montar.
RUN groupadd --system --gid 1002 dictado && useradd --system --uid 1002 --gid dictado --home /dictado dictado \
 && chown -R dictado:dictado /dictado
USER dictado

ENV NODE_ENV=production \
    DICTADO_PUERTO=8090 \
    DICTADO_MODELOS=/modelos \
    DICTADO_RUNTIME=/dictado \
    DICTADO_PYTHON=/venv/bin/python \
    DICTADO_DISPOSITIVO=cpu \
    DICTADO_MOTOR=parakeet
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8090/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "servicio/servidor.mjs"]
