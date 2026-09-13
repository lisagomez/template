# syntax=docker/dockerfile:1
# =============================================================================
# Servicio OCR del extractor documental — para el VPS del cliente (spec 010).
#
# Base en CPU: Tesseract por zonas (pytesseract + Pillow; Leptonica va dentro de Tesseract).
# La cola de vision NO vive aqui: es otro servicio del compose (`ocr-gpu`, vLLM) al que este
# apunta por EXTRACTOR_RESPALDO_BASE. Asi la imagen arranca en una maquina sin GPU.
#
# PINEADO POR DIGEST: la base es node:22-bookworm-slim por sha256. Cambiar la base es un CDC.
# =============================================================================

# ---- Stage 1: build del paquete (tsc) ---------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS builder
WORKDIR /paquete
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-save --no-audit --no-fund typescript@5.9.3 @types/react@19.3.0 @types/node@22.20.2 \
 && npx tsc -p tsconfig.json

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runner
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng python3 python3-pil python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages pytesseract==0.3.13 \
 && apt-get purge -y python3-pip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /extractor
COPY --from=builder /paquete/dist ./dist
COPY motores-locales ./motores-locales
COPY servicio ./servicio
COPY package.json ./package.json
# Las dependencias del servicio van en /extractor/node_modules, NO en servicio/node_modules: el
# lector de codigos (`dist/lectores/zxing.js`) resuelve `zxing-wasm` hacia ARRIBA desde dist/, y
# en la primera imagen no lo encontraba (medido el 2026-09-13: «Cannot find package 'zxing-wasm'»
# en cada pagina, con el servicio diciendo que si estaba cargado).
RUN npm install --no-save --no-package-lock --omit=dev --no-audit --no-fund undici@8.10.2 zxing-wasm@3.1.4

# Usuario sin privilegios: si alguien escapa del proceso, no es root. El temporal del motor
# (documentos en transito) vive en un tmpfs que el compose monta.
RUN groupadd --system --gid 1001 extractor && useradd --system --uid 1001 --gid extractor --home /extractor extractor \
 && chown -R extractor:extractor /extractor
USER extractor

ENV NODE_ENV=production \
    EXTRACTOR_PUERTO=8080 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata \
    TMPDIR=/tmp/extractor
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "servicio/servidor.mjs"]
