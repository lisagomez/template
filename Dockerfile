# syntax=docker/dockerfile:1
# =============================================================================
# SaaS Factory — imagen de produccion para Hetzner Cloud cx33 (4 vCPU / 8 GB)
# Multi-stage: la imagen final NO contiene codigo fuente ni devDependencies.
# =============================================================================

# ---- Stage 1: dependencias -------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# libc6-compat: Next.js/SWC lo necesita en Alpine (musl)
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci


# ---- Stage 2: build --------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# GOTCHA CRITICO: las variables NEXT_PUBLIC_* se INLINEAN en el bundle
# durante el build, no se leen en runtime. Si las pasas solo por
# docker-compose environment:, el navegador recibe `undefined` y Supabase
# revienta con "supabaseUrl is required". Por eso viajan como build args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

ENV NEXT_TELEMETRY_DISABLED=1
# cx33 tiene 8 GB; 3 GB de heap deja aire para Caddy y el SO durante el build
ENV NODE_OPTIONS=--max-old-space-size=3072

RUN npm run build


# ---- Stage 3: runtime ------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuario sin privilegios: si alguien escapa del proceso, no es root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# public/ siempre existe en este boilerplate (lleva .gitkeep). COPY plano:
# el glob `publi[c]` solo funciona con BuildKit y rompe en el builder legacy.
COPY --from=builder /app/public ./public

# standalone ya trae server.js + las deps minimas resueltas
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Healthcheck: Caddy y compose lo usan para no enrutar a un contenedor muerto
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
