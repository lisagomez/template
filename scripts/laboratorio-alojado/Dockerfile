# syntax=docker/dockerfile:1
# =============================================================================
# La imagen del LABORATORIO ALOJADO de Soporte SAP: la mesa del experto (docs/goals/soporte-sap-experto.md).
#
# Una sola imagen Docker portable: corre igual con `docker run` en la máquina del laboratorio y en Cloudflare
# Containers, donde el Worker y Access solo ponen la puerta. Se construye sobre lo que ya existe:
#   · las guardas del Dockerfile de la app (ningún `.env*` en el contexto, standalone sin código fuente, usuario sin
#     privilegios, `NUNCA_EN_LA_IMAGEN` en next.config.ts);
#   · Tesseract como lo instala la imagen OCR del extractor, sobre la MISMA base pineada por digest. Cambiar la base es
#     un CDC: aquí no entra una base nueva.
#
# Se construye desde la raíz del repo (la usa su `.dockerignore`):
#   docker build -f scripts/laboratorio-alojado/Dockerfile -t soporte-sap-laboratorio:<commit> .
# Sin las variables de Access y del almacén, la mesa no existe: la imagen sola no abre nada.
# =============================================================================

# ---- Stage 1: dependencias -------------------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2: build --------------------------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ningun `.env*` entra al build: Next standalone los copiaria a la imagen final y los cargaria al arrancar (PRP-010
# H-29). Si alguien afloja `.dockerignore`, el build cae aqui en vez de subir los secretos.
RUN if find . -path ./node_modules -prune -o -name '.env*' -print | grep -q .; then \
      echo 'ERROR: hay un .env* en el contexto del build (revisa .dockerignore)' >&2; exit 1; fi
# La imagen sirve SOLO la mesa (next.config.ts · reglasDelAlojado): otra pagina lleva a ella y otra API da 404.
ENV NEXT_TELEMETRY_DISABLED=1 LABORATORIO_ALOJADO=1
ARG NODE_HEAP_MB=3072
ENV NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}
# `prebuild` (prepara-gate) compila tools/*/dist desde el clon limpio (PRP-010 H-30).
RUN npm run build

# ---- Stage 3: runtime ------------------------------------------------------
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS runner
ENV DEBIAN_FRONTEND=noninteractive
# El OCR local, igual que la imagen del extractor: Tesseract por zonas (pytesseract + Pillow), español e inglés.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng python3 python3-pil python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages pytesseract==0.3.13 \
 && apt-get purge -y python3-pip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG MESA_VERSION=local
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 \
    SOPORTE_SAP_LABORATORIO=1 SOPORTE_SAP_ALOJADO=1 MESA_VERSION=${MESA_VERSION} \
    TESSERACT_CMD=/usr/bin/tesseract TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
# Usuario sin privilegios: si alguien escapa del proceso, no es root.
RUN groupadd --system --gid 1001 laboratorio && useradd --system --uid 1001 --gid laboratorio --home /app laboratorio
COPY --from=builder /app/public ./public
COPY --from=builder --chown=laboratorio:laboratorio /app/.next/standalone ./
COPY --from=builder --chown=laboratorio:laboratorio /app/.next/static ./.next/static
# Lo que el runtime lee del disco: el lector de Tesseract (lo lanza como proceso) y SOLO las tres muestras sintéticas.
COPY --from=builder /app/tools/extractor-documental/motores-locales ./tools/extractor-documental/motores-locales
COPY --from=builder /app/tools/soporte-sap/documentos/captura-migo.png /app/tools/soporte-sap/documentos/cfdi-rechazado.xml /app/tools/soporte-sap/documentos/spool-job.pdf ./tools/soporte-sap/documentos/
USER laboratorio
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/mesa/soporte-sap',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
