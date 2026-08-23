# SaaS Factory V4 - Template Documentation

> **Fuente de verdad del template.** Guardada en `.claude/` para preservarla durante el desarrollo de proyectos.

---

## Que es SaaS Factory?

Template **production-ready** para crear aplicaciones SaaS modernas con desarrollo asistido por IA. Filosofia Henry Ford: un solo stack perfeccionado.

### Lo que incluye

- Next.js 16 (App Router) + TypeScript
- Supabase (Database + Auth)
- Tailwind CSS + shadcn/ui
- 22 Skills de Claude Code (V4 Skills 2.0)
- Arquitectura Feature-First optimizada para IA
- Auto port detection (3000-3006)
- Capa de gobernanza agentica: 7 controles cableados y auto-verificados
- Testing, linting y type checking configurados
- 5 Design Systems listos para usar
- AI Templates (Vercel AI SDK v5 + OpenRouter)

---

## Tech Stack (Golden Path)

```yaml
Runtime: Node.js + TypeScript
Framework: Next.js 16 (App Router)
Database: PostgreSQL/Supabase
Styling: Tailwind CSS 3.4
Components: shadcn/ui
State: Zustand
Validation: Zod
Testing: Playwright CLI + MCP
AI Engine: Vercel AI SDK v5 + OpenRouter
Deploy: Vercel o Hetzner cx33 (Docker + Caddy)
```

**Por que Email/Password y no OAuth?**
Para evitar bloqueos de bots durante testing. Google OAuth requiere verificacion.

---

## Arquitectura Feature-First

```
src/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Rutas auth (grupo)
│   ├── (main)/              # Rutas principales
│   ├── layout.tsx
│   └── page.tsx
│
├── features/                 # Organizadas por funcionalidad
│   ├── auth/
│   │   ├── components/      # LoginForm, SignupForm
│   │   ├── hooks/           # useAuth, useSession
│   │   ├── services/        # authService.ts
│   │   ├── types/           # User, Session
│   │   └── store/           # authStore.ts
│   │
│   └── [tu-feature]/        # Misma estructura
│
└── shared/                   # Codigo reutilizable
    ├── components/          # Button, Card, Input
    ├── hooks/               # useDebounce, useLocalStorage
    ├── lib/                 # supabase.ts
    ├── types/               # Tipos compartidos
    └── utils/               # helpers
```

> **Por que Feature-First?** Cada feature tiene TODO lo necesario en un solo lugar. Perfecto para que la IA entienda contexto completo sin navegar multiples carpetas.

---

## Quick Start

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

```bash
cp .env.example .env.local

# Editar con tus credenciales de Supabase
NEXT_PUBLIC_SUPABASE_URL=tu_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

### 3. Configurar MCPs (Opcional)

```bash
cp .claude/example.mcp.json .mcp.json
# Editar con tu project ref de Supabase
```

### 4. Iniciar Desarrollo

```bash
npm run dev
# Auto-detecta puerto disponible (3000-3006)
```

---

## Comandos npm

### Development
```bash
npm run dev          # Servidor desarrollo (auto-port 3000-3006)
npm run build        # Build para produccion
npm run start        # Servidor produccion
```

### Quality Assurance
```bash
npm run lint         # ESLint
npm run lint:fix     # Fix automatico
npm run typecheck    # TypeScript check
npm run verify:gobernanza  # Cableado de la capa de gobernanza
npm run validate     # typecheck + build + gobernanza (el gate completo)
```

---

## Skills (V4 Skills 2.0)

> V4 migra TODO a Skills 2.0. Hot reload, auto-discovery, zero config.
> Cada skill es una carpeta con `SKILL.md` (frontmatter YAML + instrucciones).

Los 22 skills son invocables con `/nombre` y activables por Claude segun
el `description` de su frontmatter.

| Skill | Comando | Descripcion |
|-------|---------|-------------|
| `new-app` | `/new-app` | Entrevista de negocio → BUSINESS_LOGIC.md |
| `add-login` | `/add-login` | Auth completo Supabase: login, signup, password reset, profiles, RLS |
| `add-payments` | `/add-payments` | Pagos con Polar (MoR): checkout, webhooks, suscripciones |
| `add-emails` | `/add-emails` | Emails transaccionales: Resend + React Email |
| `add-mobile` | `/add-mobile` | PWA instalable + push notifications (iOS compatible) |
| `website-3d` | `/website-3d` | Landing cinematica: scroll-driven video + copy AIDA/PAS |
| `prp` | `/prp` | Generar Product Requirements Proposal |
| `bucle-agentico` | `/bucle-agentico` | Features complejas por fases (DB + API + UI) |
| `ai` | `/ai` | AI Templates: chat, RAG, vision, tools, web search |
| `supabase` | `/supabase` | Todo BD: tablas, RLS, migraciones, queries, metricas |
| `playwright-cli` | `/playwright-cli` | Testing automatizado con browser real |
| `primer` | `/primer` | Inicializar contexto del proyecto |
| `goal-compiler` | `/goal-compiler` | Intencion vaga → prompt soberano para /goal |
| `memory-manager` | `/memory-manager` | Memoria persistente por proyecto |
| `image-generation` | `/image-generation` | Generar y editar imagenes con OpenRouter + Gemini |
| `video-visuals` | `/video-visuals` | Paquete visual sketchnote para videos |
| `autoresearch` | `/autoresearch` | Auto-optimizar skills con loop autonomo |
| `skill-creator` | `/skill-creator` | Crear nuevos skills |
| `knowledge-search` | `/knowledge-search` | Buscar en el knowledge base compilado de conversaciones |
| `google-workspace` | `/google-workspace` | Gmail + Calendar via gog CLI |
| `update-sf` | `/update-sf` | Actualizar a ultima version |
| `eject-sf` | `/eject-sf` | Remover SaaS Factory del proyecto (DESTRUCTIVO) |

### Crear un Nuevo Skill

```bash
# Opcion 1: Usar skill-creator
/skill-creator

# Opcion 2: Manual
mkdir .claude/skills/mi-skill
# Crear SKILL.md con frontmatter + instrucciones
```

---

## MCPs Configurados

- **Next.js DevTools** - Conectado a `/_next/mcp` para debug en tiempo real
- **Playwright** - Validacion visual y testing automatizado (CLI preferido sobre MCP)
- **Supabase** - Integracion directa con DB y auth

---

## Sistema PRP (Product Requirements Proposals)

> Contrato humano-IA antes de escribir codigo.

```
1. Humano: "Necesito [feature]"
2. /prp [feature] → IA investiga y genera PRP
3. Humano revisa y aprueba
4. /bucle-agentico → Ejecuta fase por fase
```

| Seccion | Proposito |
|---------|-----------|
| **Objetivo** | Que se construye (estado final) |
| **Por Que** | Valor de negocio |
| **Que** | Comportamiento + criterios de exito |
| **Contexto** | Docs, referencias, gotchas |
| **Blueprint** | Fases de implementacion |
| **Gobernanza** | Modelo de amenazas (C3) + evaluacion de impacto (C4) |
| **Validacion** | Tests, linting, verificacion |

---

## Capa de Gobernanza

> Siete controles que todo proyecto hereda. Documento nucleo:
> `.claude/gobernanza/GOBERNANZA.md`.

Cierra tres huecos que son invisibles porque no rompen nada el dia que se descuidan:
**(1)** ningun gate para cambios de comportamiento — el codigo generado pasa por
typecheck y revision, el prompt que lo genera no pasaba por nada; **(2)** nadie verifica
a los skills, solo a los artefactos; **(3)** `service_role` tiene BYPASSRLS y anulaba la
regla de RLS.

| Control | Disparador | Donde vive |
|---------|-----------|------------|
| **C1** Cambio de Comportamiento (CDC) | Tocas modelo, skill, prompt o plantilla | `BITACORA-CDC.md` |
| **C2** Regresion de skills | Cualquier CDC de radio ≥ skill | Declarado, PRP propio pendiente |
| **C3** Modelo de amenazas | Cada PRP nuevo | `plantillas/modelo-amenazas.md` |
| **C4** Evaluacion de impacto (AISIA) | Cada PRP y cada BUSINESS_LOGIC.md | `plantillas/aisia.md` |
| **C5** Registro de decisiones de riesgo | Aceptas un riesgo en vez de mitigarlo | `REGISTRO-RIESGO.md` |
| **C6** Procedimiento de incidente | Fuga, rotura o intento de inyeccion | `plantillas/incidente.md` |
| **C7** Regla `service_role` / RLS | Cualquier acceso a dato de negocio | `GOBERNANZA.md` §8 |

### Se verifica sola

```bash
npm run verify:gobernanza
```

Falla si falta un control, si `CLAUDE.md` o `GEMINI.md` dejan de referenciar la capa, si
`prp-base.md` pierde sus secciones, o si una plantilla referenciada no existe. Probado
con control negativo: se rompio un cable a proposito y se confirmo que falla. Un
verificador que siempre pasa porque no verifica nada aprobaria igual.

### Principios que arrastra

- Verificar antes de confiar: las salidas del LLM no se confian por diseno.
- Un control no probado no cuenta como control.
- Si la garantia depende de que nadie se equivoque, es una costumbre, no una garantia.
- El documento y el codigo son un solo cambio.

Alineada a ISO/IEC 42001 en etapa **AIMS-lite**: sostenible por una persona sola. La
certificacion se activa por disparador comercial (cliente enterprise, marca blanca,
sector regulado), nunca por calendario.

---

## AI Templates - Sistema de Bloques LEGO

Templates copy-paste para construir agentes IA con **Vercel AI SDK v5 + OpenRouter**.

| # | Bloque | Descripcion |
|---|--------|-------------|
| 00 | Setup Base | Configuracion inicial |
| 01 | Chat Streaming | Chat con useChat |
| 01-ALT | Action Stream | Agente transparente paso a paso |
| 02 | Web Search | Busqueda con :online |
| 03 | Historial | Persistencia en Supabase |
| 04 | Vision | Analisis de imagenes |
| 05 | Tools | Funciones/herramientas |
| 06 | RAG | pgvector + embeddings |

Standalone: `single-call`, `structured-outputs`, `generative-ui`

Usa `/ai [template]` para implementar cualquier bloque.

---

## Design Systems

Sistemas de diseno visuales en `.claude/design-systems/`.

| Sistema | Estilo |
|---------|--------|
| **Liquid Glass** | iOS-like, transparencias |
| **Gradient Mesh** | Degradados fluidos |
| **Neumorphism** | Soft UI, sombras suaves |
| **Bento Grid** | Grids asimetricos |
| **Neobrutalism** | Bold, bordes duros |

---

## Estructura de .claude/

```
.claude/
├── skills/                    # Skills 2.0 (V4) - 22 skills
│   ├── new-app/                 # Entrevista de negocio → BUSINESS_LOGIC.md
│   ├── add-login/               # Auth completo Supabase: login, signup, password reset, profiles, RLS
│   ├── add-payments/            # Pagos con Polar (MoR): checkout, webhooks, suscripciones
│   ├── add-emails/              # Emails transaccionales: Resend + React Email
│   ├── add-mobile/              # PWA instalable + push notifications (iOS compatible)
│   ├── website-3d/              # Landing cinematica: scroll-driven video + copy AIDA/PAS
│   ├── prp/                     # Generar Product Requirements Proposal
│   ├── bucle-agentico/          # Features complejas por fases (DB + API + UI)
│   ├── ai/                      # AI Templates: chat, RAG, vision, tools, web search
│   ├── supabase/                # Todo BD: tablas, RLS, migraciones, queries, metricas
│   ├── playwright-cli/          # Testing automatizado con browser real
│   ├── primer/                  # Inicializar contexto del proyecto
│   ├── goal-compiler/           # Intencion vaga → prompt soberano para /goal
│   ├── memory-manager/          # Memoria persistente por proyecto
│   ├── image-generation/        # Generar y editar imagenes con OpenRouter + Gemini
│   ├── video-visuals/           # Paquete visual sketchnote para videos
│   ├── autoresearch/            # Auto-optimizar skills con loop autonomo
│   ├── skill-creator/           # Crear nuevos skills
│   ├── update-sf/               # Actualizar a ultima version
│   └── eject-sf/                # Remover SaaS Factory del proyecto (DESTRUCTIVO)
│
├── gobernanza/                # Capa de gobernanza agentica (C1-C7)
│   ├── GOBERNANZA.md         # Documento nucleo: los 7 controles y los principios
│   ├── REGISTRO-RIESGO.md    # Decisiones de riesgo firmadas (append-only)
│   ├── BITACORA-CDC.md       # Cambios de comportamiento + modelo pineado (append-only)
│   └── plantillas/           # AISIA, modelo de amenazas, procedimiento de incidente
│
├── PRPs/                      # Product Requirements Proposals
│   ├── prp-base.md           # Template base (incluye modelo de amenazas + AISIA)
│   └── specs/                # Specs compiladas para /goal
│
│   │   └── references/       # AI Templates (11 bloques)
│   ├── agents/               # Templates secuenciales
│   └── [standalone]          # Templates independientes
│
├── design-systems/            # Sistemas de diseno
│   ├── neobrutalism/
│   ├── liquid-glass/
│   ├── gradient-mesh/
│   ├── bento-grid/
│   └── neumorphism/
│
├── hooks/                     # Scripts en eventos
├── example.mcp.json           # Config de MCPs
└── README.md                  # Este archivo
```

---

## Supabase Setup

### 1. Crear Proyecto

Visita `supabase.com/dashboard`, crea nuevo proyecto, copia URL y Anon Key.

### 2. Cliente Configurado

```typescript
// src/shared/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

### 3. Migraciones

```bash
# Guardar en supabase/migrations/
# Ejemplo: supabase/migrations/001_create_users.sql
```

---

## Troubleshooting

### Puerto Ocupado (EADDRINUSE)

```bash
# El auto-port detection deberia resolver esto
# Si persiste, usa el alias kill-ports o:
lsof -i :3000
kill -9 <PID>
```

### TypeScript Errors

```bash
npm run typecheck
rm -rf .next
npm install
```

---

## Deploy

### Opcion A — Vercel

```bash
npm install -g vercel
vercel
```

Variables en el dashboard de Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

### Opcion B — Servidor propio (Hetzner Cloud cx33)

Docker + Next.js standalone + Caddy con TLS automatico. Dimensionado para un
**cx33 (4 vCPU / 8 GB)**; sirve en cualquier VPS con Docker.

```bash
# en el servidor
cp .env.production.example .env.production   # rellenar y chmod 600
npm run deploy                                # build + up + ps
```

Runbook completo: **`docs/DEPLOY-HETZNER.md`**

> Las `NEXT_PUBLIC_*` se inlinean en **build**, no en runtime: viajan como
> build args. Solo los secretos server-side van en `environment:`.

---

**Template Version:** 4.0.0
**Last Updated:** 2026-08-23

---

*SaaS Factory V4: Todo es un Skill. Hot reload. Auto-discovery. Zero config.*
