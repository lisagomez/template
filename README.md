# SaaS Factory V4

Template production-ready para crear aplicaciones SaaS con desarrollo asistido por IA. Filosofia Agent-First: el usuario dice que quiere, el agente construye todo.

## Que incluye

- Next.js 16 (App Router) + TypeScript
- Supabase (Database + Auth + RLS)
- Tailwind CSS + shadcn/ui
- 22 Skills de Claude Code (V4 Skills 2.0)
- Playwright CLI para QA automatizado
- AI Templates (Vercel AI SDK v5 + OpenRouter)
- 5 Design Systems listos para usar
- Arquitectura Feature-First optimizada para IA
- Auto-Blindaje: el sistema aprende de cada error
- Capa de gobernanza agentica: 7 controles cableados y auto-verificados

## Quick Start

### 1. Instalar

```bash
npm install
```

### 2. Variables de Entorno

```bash
cp .env.example .env.local
# Editar con credenciales de Supabase
```

### 3. MCPs (Opcional)

```bash
cp .claude/example.mcp.json .mcp.json
# Editar con project ref de Supabase
```

### 4. Desarrollar

```bash
npm run dev
# Auto-detecta puerto disponible (3000-3006)
```

## Tech Stack

```yaml
Runtime: Node.js + TypeScript
Framework: Next.js 16 (App Router)
Database: PostgreSQL/Supabase
Styling: Tailwind CSS 3.4
Components: shadcn/ui
State: Zustand
Validation: Zod
AI Engine: Vercel AI SDK v5 + OpenRouter
Testing: Playwright CLI + MCP
Deploy: Vercel o Hetzner cx33 (Docker + Caddy)
```

## Arquitectura Feature-First

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Rutas auth
│   ├── (main)/              # Rutas principales
│   └── layout.tsx
│
├── features/                 # Organizadas por funcionalidad
│   └── [feature]/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── types/
│       └── store/
│
└── shared/                   # Codigo reutilizable
    ├── components/
    ├── hooks/
    ├── lib/
    └── types/
```

## Skills (22 total)

Invocables con `/nombre`; Claude tambien los activa solo segun la tarea.

| Skill | Que hace |
|-------|----------|
| `/new-app` | Entrevista de negocio → BUSINESS_LOGIC.md |
| `/add-login` | Auth completo (Email + Google OAuth + profiles + RLS) |
| `/add-payments` | Pagos con Polar (MoR): checkout, webhooks, suscripciones |
| `/add-emails` | Emails transaccionales con Resend + React Email |
| `/add-mobile` | PWA instalable + push notifications |
| `/website-3d` | Landing cinematica: scroll-driven video + copy AIDA/PAS |
| `/prp` | Planificar features complejas antes de implementar |
| `/bucle-agentico` | Implementar features complejas por fases |
| `/ai` | Agregar IA: chat, RAG, vision, tools, web search |
| `/supabase` | Todo BD: tablas, RLS, migraciones, queries, metricas |
| `/playwright-cli` | QA automatizado con browser real |
| `/primer` | Inicializar contexto del proyecto |
| `/goal-compiler` | Intencion vaga → prompt soberano para /goal |
| `/memory-manager` | Memoria persistente por proyecto |
| `/image-generation` | Generar y editar imagenes (OpenRouter + Gemini) |
| `/video-visuals` | Paquete visual sketchnote para videos |
| `/autoresearch` | Auto-optimizar skills con loop autonomo |
| `/skill-creator` | Crear nuevos skills |
| `/knowledge-search` | Buscar en el knowledge base compilado de conversaciones |
| `/google-workspace` | Gmail + Calendar via gog CLI |
| `/update-sf` | Actualizar a ultima version |
| `/eject-sf` | Remover SaaS Factory (destructivo) |

## AI Templates

Bloques LEGO para construir features de IA con Vercel AI SDK v5 + OpenRouter:

| Template | Que hace |
|----------|----------|
| setup-base | Configuracion inicial |
| chat | Chat streaming con useChat |
| web-search | Busqueda con :online |
| historial | Persistencia en Supabase |
| vision | Analisis de imagenes |
| tools | Funciones/herramientas |
| rag | pgvector + embeddings |
| single-call | generateText() puntual |
| structured-outputs | generateObject() con Zod |
| generative-ui | LLM decide que componente renderizar |

## Design Systems

5 sistemas visuales listos en `.claude/design-systems/`:

- **Liquid Glass** - iOS-like, transparencias
- **Gradient Mesh** - Degradados fluidos
- **Neumorphism** - Soft UI, sombras suaves
- **Bento Grid** - Grids asimetricos
- **Neobrutalism** - Bold, bordes duros

## Comandos

```bash
npm run dev          # Desarrollo (auto-port 3000-3006)
npm run build        # Build produccion
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run validate     # typecheck + build + gobernanza + regresion (el gate completo)
npm run verify:gobernanza  # solo el cableado de la capa de gobernanza
npm run regresion    # regresion de skills (C2)
```

## Gobernanza

Todo proyecto que nace de este template hereda una capa de gobernanza con **7 controles**
(`.claude/gobernanza/GOBERNANZA.md`). No es papel decorativo: el flujo la obliga a
consultarse y un verificador falla si el papel y el codigo divergen.

| Control | Que exige |
|---------|-----------|
| **C1** CDC | Cambiar modelo, skill, prompt o plantilla exige diff, regresion y aprobacion. El modelo SIEMPRE pineado |
| **C2** Regresion de skills | Contratos de skills en cada build + casos-trampa en cada CDC. Verde = promovible |
| **C3** Modelo de amenazas | Seccion fija de todo PRP: *¿quien nos ataca?* |
| **C4** AISIA | Seccion fija de todo PRP: *¿a quien dañamos sin atacante?* |
| **C5** Registro de riesgo | Aceptar un riesgo es una decision firmada, append-only |
| **C6** Incidente | Contener → clasificar → cerrar con caso de regresion |
| **C7** `service_role` | Tiene BYPASSRLS: las superficies de negocio no lo usan |

```bash
npm run verify:gobernanza   # falla si la capa quedo suelta
```

Alineada a ISO/IEC 42001 en su etapa AIMS-lite: sostenible por una persona sola, sin
equipo de compliance. La certificacion se activa por disparador comercial, no por
calendario (ver §10 del documento).

---

## Deploy

### Opcion A — Vercel

```bash
npm install -g vercel
vercel
```

Variables en Vercel Dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

### Opcion B — Servidor propio (Hetzner Cloud cx33)

Docker + Next.js standalone + Caddy con TLS automatico. Pensado para un
**cx33 (4 vCPU / 8 GB)**, pero sirve en cualquier VPS con Docker.

```bash
# en el servidor
cp .env.production.example .env.production   # rellenar y chmod 600
npm run deploy                                # build + up + ps
npm run deploy:logs
```

Runbook completo (hardening, swap, DNS, TLS, gotchas): **[docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md)**

## Estructura .claude/

```
.claude/
├── skills/              # 22 Skills (V4 Skills 2.0)
├── gobernanza/          # Capa de gobernanza (7 controles + plantillas)
├── PRPs/                # Product Requirements Proposals
│   │   └── references/  # AI Templates (11 bloques)
├── design-systems/      # 5 sistemas de diseno
├── memory/              # Memoria persistente del proyecto
├── hooks/               # Scripts en eventos
└── example.mcp.json     # Config de MCPs
```

---

**SaaS Factory V4** | Agent-First. Todo es un Skill.
