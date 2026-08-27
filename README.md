# SaaS Factory V4

Template production-ready para crear aplicaciones SaaS con desarrollo asistido por IA. Filosofia Agent-First: el usuario dice que quiere, el agente construye todo.

## Que incluye

- Next.js 16 (App Router) + TypeScript
- Supabase (Database + Auth + RLS)
- Tailwind CSS + shadcn/ui
- 23 Skills de Claude Code (V4 Skills 2.0)
- Playwright CLI para QA automatizado
- AI Templates (Vercel AI SDK v5 + OpenRouter)
- 5 Design Systems listos para usar
- Arquitectura Feature-First optimizada para IA
- Auto-Blindaje: el sistema aprende de cada error
- Capa de gobernanza agentica: 7 controles cableados y auto-verificados

## Quick Start

### 1. Instalar

Node **22** (declarado en `.nvmrc` y en `engines`; es el mismo `node:22` del `Dockerfile`, y
`prueba-contabilidad.ts` corre TypeScript directo, que Node 20 no ejecuta).

```bash
nvm use        # o cualquier Node >= 22.18
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
Deploy: Vercel o VPS propio (Docker + Caddy), dimensionado por script
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

## Skills (23 total)

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
| `/cli-audit` | Estado de la imprenta de CLIs y coste en contexto de los MCP |
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
npm run validate     # typecheck + lint + build + gobernanza + regresion + contabilidad (el gate completo)
npm run verify:gobernanza  # solo el cableado de la capa de gobernanza
npm run regresion    # regresion de skills (C2)
npm run audita:secretos  # credenciales en TODA la historia, no solo en el arbol
npm run configura:deploy  # EN EL SERVIDOR: mide la maquina y valida .env.production
npm run empaqueta <nombre>  # empaqueta una herramienta de tools/ y PRUEBA que se integre
npm run mide:contexto  # cuanto cuesta el contexto base, contra presupuesto declarado
npm run vigila:versiones  # deriva de TODO lo pineado (stack + MCP). Usa red: fuera del gate
npm run verifica:routing  # cada clase de tarea con su nivel de modelo y su precio
npm run vigila:hermes  # deriva del pineo del agente (semanal, fuera del gate: usa red)
```

## Portable entre arneses

Las instrucciones de la fabrica viven en **`AGENTS.md`**, que es la fuente unica.
`CLAUDE.md` la importa con `@AGENTS.md` —la via que documenta Claude Code, que lee
`CLAUDE.md` y no `AGENTS.md`— y **opencode lee `AGENTS.md` directamente**: su documentacion
dice que cuando existen los dos, solo usa `AGENTS.md`. Asi el mismo repo se conduce desde
cualquiera de los dos arneses sin que las instrucciones puedan divergir, porque hay una sola
copia.

El verificador lee los archivos de instrucciones **expandiendo los imports**, igual que el
arnes: si alguien rompe el import, 13 comprobaciones se ponen en rojo (probado).

**Y desde el 2026-08-24 esto esta medido, no afirmado**: opencode instalado aqui, **todos los skills** de `.claude/skills/` cargados, y `npm run validate` corrido **entero y en verde
dentro de una PTY del propio opencode**. El orden de resolucion (`AGENTS.md` → `CLAUDE.md` →
`CONTEXT.md`, para en el primero) se verifico contra el binario que se ejecuta, no contra la
doc. Informe completo: **[docs/PORTABILIDAD-ARNESES.md](docs/PORTABILIDAD-ARNESES.md)**.

Lo que ahi **no** se mide es si un agente conducido por opencode *obedece* estas reglas: eso
pide una credencial de proveedor, y **un boilerplate no tiene credenciales** — no por
descuido, por diseño. Lo cierra un proyecto derivado; el informe deja el coste calculado
($0,19 una sesion) para quien lo haga.

Un aviso que sale de ahi: **opencode no expande los imports `@ruta`**. Da igual mientras
`AGENTS.md` sea autocontenido; deja de dar igual el dia que una regla se mueva a un archivo
importado — existiria para un arnes y no para el otro.

## Dos caminos: una app, o una herramienta

Este template sirve para las dos cosas, y el runbook cambia segun cual sea:

| | **Una app** | **Una herramienta** |
|---|---|---|
| Produces | Un sitio que se despliega | Un paquete que se instala |
| Acaba en | Un VPS con Docker y TLS | El `node_modules` de otros proyectos tuyos |
| Runbook | [docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md) | [docs/EMPAQUETAR-HERRAMIENTA.md](docs/EMPAQUETAR-HERRAMIENTA.md) |
| Comando | `npm run configura:deploy` + `npm run deploy` | `npm run empaqueta <nombre>` |

Una herramienta vive en `tools/<nombre>/`, con la regla que decide si es reusable: **el
nucleo no importa React, Next ni Supabase**. Lo que los necesite va en un entry point
aparte, detras de un peerDependency opcional — dos Reacts en el mismo arbol es el bug de
hooks que nadie encuentra.

`npm run empaqueta` no se cree el resultado: valida el contrato del `package.json`,
comprueba que `'use client'` sobrevive al build, y **instala el tarball en un proyecto
limpio para importarlo de verdad**. Ahi "es compatible" deja de ser una opinion.

## Gobernanza

Todo proyecto que nace de este template hereda una capa de gobernanza con **7 controles**
(`.claude/gobernanza/GOBERNANZA.md`). No es papel decorativo: el flujo la obliga a
consultarse y un verificador falla si el papel y el codigo divergen.

| Control | Que exige |
|---------|-----------|
| **C1** CDC | Cambiar modelo, skill, prompt, plantilla o `settings.json` exige diff, regresion y aprobacion. El modelo SIEMPRE pineado: `latest` se rechaza |
| **C2** Regresion de skills | Contratos de skills en cada build + casos-trampa en cada CDC. Verde = promovible |
| **C3** Modelo de amenazas | Seccion fija de todo PRP: *¿quien nos ataca?* |
| **C4** AISIA | Seccion fija de todo PRP: *¿a quien dañamos sin atacante?* |
| **C5** Registro de riesgo | Aceptar un riesgo es una decision firmada, append-only. **Con limite**: el dano a terceros no es firmable |
| **C6** Incidente | Contener → clasificar → cerrar con caso de regresion. Se registra en `INCIDENTES.md` |
| **C7** `service_role` | Tiene BYPASSRLS: las superficies de negocio no lo usan |

```bash
npm run verify:gobernanza   # falla si la capa quedo suelta (107 comprobaciones)
npm run regresion           # C2 capa A: contratos de los 23 skills
npm run regresion -- --trampa   # C2 capa B: casos-trampa, para cada CDC
```

El gate corre solo antes de desplegar (`predeploy`), no solo cuando alguien se acuerda.

### La capa se audita a si misma

Los casos-trampa se ejecutan en sesiones frias y han encontrado mas fallos en la propia
gobernanza que en los agentes: un gate fuera de la ruta de deploy, dos controles escritos
donde nadie los leia, un caso de prueba mal disenado y un incidente de credenciales. Todo
ello esta registrado en `.claude/gobernanza/` — la capa no esconde sus propios fallos, los
versiona.

**El corpus vive en la rama `golden-sets`, y el repo no habla de el.** Sacar los casos del
arbol de trabajo no bastaba: se siguio escribiendo *sobre* ellos en la bitacora y en la
memoria, y eso quemo tres corridas — un agente en sesion fria reconocia el escenario antes
de que se lo dieran. La regla acabo siendo de trazo grueso, que es lo unico verificable:
**fuera de esa rama no aparece ningun identificador de caso, ni uno**; la traza es el commit
del reporte. Dos comprobaciones del verificador lo vigilan (identificador y entrada
verbatim), asi que ya no depende de que alguien corra un `grep` antes de medir.

Si clonas con `--single-branch`, esa rama no viaja y **C2 capa B queda inaccesible**. El
verificador lo dice; no falla en silencio. Un clon normal trae `origin/golden-sets` sin crear
la rama local: el verificador y `npm run regresion -- --trampa` la resuelven igual (local
primero, `origin/` despues); si prefieres tenerla local, `git fetch origin golden-sets:golden-sets`.

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

### Opcion B — Servidor propio (Hetzner Cloud u otro VPS)

Docker + Next.js standalone + Caddy con TLS automatico. **No asume un modelo de
servidor**: `npm run configura:deploy` mide vCPU y RAM reales y deriva de ahi los
limites, el heap del build y el nombre de tu imagen. Minimo duro: 2 GB de RAM y swap.

```bash
# en el servidor
cp .env.production.example .env.production   # rellenar y chmod 600
npm run configura:deploy -- --escribir       # mide la maquina y valida el .env
npm run deploy                                # build + up + ps
npm run deploy:logs
```

Runbook completo (hardening, swap, DNS, TLS, gotchas): **[docs/DEPLOY-HETZNER.md](docs/DEPLOY-HETZNER.md)**

## Agentes e infraestructura (Fase 0)

Los proyectos que corren **agentes Hermes** junto a la app tienen su propio runbook:
dos contenedores (`negocio` y `clientes`), dashboard por tunel SSH y —lo que de verdad
importa— un **contrato de respaldo con restauracion verificada**.

```bash
# en el servidor de agentes
docker compose up -d          # 2 verticales + dashboard
ssh -L 9119:localhost:9119 deploy@IP   # unico canal de acceso en Fase 0
```

Runbook completo: **[docs/FASE0-INFRAESTRUCTURA.md](docs/FASE0-INFRAESTRUCTURA.md)**

### Mantenerlo al dia sin sorpresas

La version del agente va **pineada**, y cambiarla es un CDC. Pero pinear y no mirar tiene su
propio fallo: se descubrio al escribir el diseño de abajo que el tag pineado llevaba **11
releases de rezago**, y nadie lo sabia.

> **Pinear sin vigilar no es estabilidad, es rezago silencioso.**

```bash
npm run vigila:hermes    # capa A: una llamada HTTP, sin LLM y sin credenciales
npm run vigila:hermes -- --capa-b   # ¿lo que el runbook afirma sigue siendo cierto?
# exit 0 = sin novedades (silencio) · 1 = deriva o rojo · 2 = NO pude verificar
```

La imagen va **pineada por digest**, no solo por tag: un tag se puede re-publicar, un digest
no. La primera corrida de la capa B encontro **cuatro afirmaciones falsas** en el runbook —
entre ellas tres variables de entorno que la imagen ignoraba en silencio, asi que el
documento creia configurar una autenticacion que no configuraba.

El mecanismo que cierra ese lazo esta en
**[docs/SDD-hermes-verificacion.md](docs/SDD-hermes-verificacion.md)** — capa A
**implementada**; falta la capa B (descarga la imagen) y el cron semanal, que es del
entorno. Lo que lo hace distinto de un "comprueba actualizaciones":

| Decision | Por que |
|----------|---------|
| El job **nunca** actualiza | Uno que lo hiciera solo seria el anti-patron de C1 automatizado, y por tanto peor |
| Vigila el **digest**, no solo el tag | Un tag no es inmutable: se puede re-publicar. Si cambia no es deriva, es cadena de suministro (O5) |
| Reporta el **cambio**, no el estado | Un informe semanal repitiendo lo mismo deja de leerse. Eso es fatiga de aprobacion (O3) |
| Exit `2` para "no pude verificar" | Sin red **no** es "todo bien". Un control que parece funcionar y no mide nada es el peor modo de falla |

| Decision | Como queda |
|----------|-----------|
| Dos verticales, no una | `negocio` (datos propios) y `clientes` (datos de terceros). La separacion es de **radio de dano**, no organizativa: una fuga en una no expone a la otra |
| Canales de chat | **Fuera de Fase 0.** Telegram y Slack son superficie de entrada no autenticada: entran con su modelo de amenazas (C3) y su AISIA (C4), no antes |
| Donde viven los agentes | **Servidor aparte** del de la app. El box de la app es desechable; la memoria del agente es irrecuperable — no se mezclan |
| Que se respalda | Lo define el **inventario por proyecto** (§9.1 del runbook), con regla explicita de criticidad. Lo que no esta en la tabla, no existe cuando el servidor arda |
| Que hace real el respaldo | **GATE 1** (el append-only falla de verdad al borrar) y **GATE 3** (restauracion verificada, RTO medido). Sin ellos el respaldo es una creencia |

El tag de la imagen del agente va **pineado**, igual que el modelo: cambiarlo es un CDC
(C1) con diff, regresion y aprobacion.

### La tercera palanca: lo que cuestan los MCP

**[docs/SDD-imprenta-de-clis.md](docs/SDD-imprenta-de-clis.md)** — hermana del routing y del
cache de prefijo, y la unica que atacaba un coste que **ningun gate veia**: un servidor MCP
inyecta los esquemas de sus herramientas en **cada sesion, se usen o no**.

Medido el 2026-08-25 (`node scripts/mide-mcp.mjs`): cinco servidores cuestan **20 363
tokens** por sesion — casi el **doble** que todas las instrucciones de la fabrica juntas
(11 083). Otros cuatro no se pudieron medir sin credenciales, asi que el total real es mayor
y se declara como tal.

El material de origen afirmaba "~100x menos tokens" con un CLI. **Refutado**: el rango
medido va de **2.8x** (releer el catalogo entero cada sesion) a **55.8x** (consultar un
subcomando). La aportacion propia es otra: el coste del MCP es **incondicional** y el del
CLI **condicional** — quien use una herramienta en 1 de cada 20 sesiones ahorra ~49x, y mas
cuanto menos la use.

### Instalar de la libreria publica es adoptar un CLI no medido

El escalon 2 de la escalera dice que instalar es mas barato que imprimir, y es cierto. Lo
que no se veia: **esa libreria no publica grados.** Verificado el 2026-08-26 sobre su
registro — 465 entradas, y sus campos son `name, category, api, description, search_terms,
path, release, printer, printer_name, creator, mcp, contributors`. Ni grade, ni scorecard,
ni dogfood; el directorio del skill upstream trae solo `SKILL.md`.

Chocaba con la cuarta regla de los CLIs —*sin grado no es aprobado*— y en una colision
silenciosa gana el atajo: el escalon 2 era la unica via por la que un CLI entraba sin medir
**y sin que nada lo dijera**. Desde el 2026-08-26 la regla lo nombra, y el verificador la
vigila en los dos archivos de instrucciones: instalar de ahi es adoptar un CLI **no
medido**, y el CDC lo puntua en local (`/printing-press-import` + `/printing-press-score`)
o lo declara no medido y fuera de produccion.

## Estructura .claude/

```
.claude/
├── skills/              # 23 Skills (V4 Skills 2.0)
├── gobernanza/          # Capa de gobernanza (7 controles, plantillas y registros)
├── PRPs/                # Product Requirements Proposals
│   │   └── references/  # AI Templates (11 bloques)
├── design-systems/      # 5 sistemas de diseno
├── memory/              # Memoria persistente del proyecto
├── hooks/               # Scripts en eventos
└── example.mcp.json     # Config de MCPs
```

---

**SaaS Factory V4** | Agent-First. Todo es un Skill.
