# Skills System - SaaS Factory V4

> Todo es un Skill. Hot reload. Auto-discovery. Zero config.

---

## Inventario de Skills (20 total)

> Esta tabla se valida contra el disco. Si anades o quitas un skill,
> actualizala aqui **y** en `CLAUDE.md`. Comprobacion rapida:
> `ls -d .claude/skills/*/ | xargs -n1 basename`

Todos son invocables por el usuario con `/nombre` y activables por Claude
segun el `description` de su frontmatter.

| Skill | Comando | Descripcion |
|-------|---------|-------------|
| `new-app` | `/new-app` | Entrevista de negocio → BUSINESS_LOGIC.md |
| `add-login` | `/add-login` | Auth completo Supabase: login, signup, password reset, profiles, RLS |
| `add-payments` | `/add-payments` | Pagos con Polar (MoR): checkout, webhooks, suscripciones, acceso |
| `add-emails` | `/add-emails` | Emails transaccionales: Resend + React Email + batch + unsubscribe |
| `add-mobile` | `/add-mobile` | PWA instalable + push notifications (iOS compatible) |
| `website-3d` | `/website-3d` | Landing cinematica: scroll-driven video + copy AIDA/PAS + glass-morphism |
| `prp` | `/prp` | Generar Product Requirements Proposal |
| `bucle-agentico` | `/bucle-agentico` | Features complejas por fases (DB + API + UI coordinados) |
| `ai` | `/ai` | AI Templates: chat, RAG, vision, tools, web search |
| `supabase` | `/supabase` | Todo BD: tablas, RLS, migraciones, queries, metricas, storage |
| `playwright-cli` | `/playwright-cli` | Testing automatizado con browser real |
| `primer` | `/primer` | Inicializar contexto del proyecto |
| `goal-compiler` | `/goal-compiler` | Intencion vaga → prompt soberano para /goal (diagnostico loop vs grafo) |
| `memory-manager` | `/memory-manager` | Memoria persistente por proyecto en .claude/memory/ |
| `image-generation` | `/image-generation` | Generar y editar imagenes con OpenRouter + Gemini |
| `video-visuals` | `/video-visuals` | Paquete visual narrativo estilo sketchnote para videos |
| `autoresearch` | `/autoresearch` | Auto-optimizar skills con loop autonomo (patron Karpathy) |
| `skill-creator` | `/skill-creator` | Crear nuevos skills |
| `update-sf` | `/update-sf` | Actualizar SaaS Factory a la ultima version |
| `eject-sf` | `/eject-sf` | Remover SaaS Factory del proyecto (DESTRUCTIVO) |

---

## Estructura de un Skill

```
skill-name/
├── SKILL.md              # Requerido: frontmatter YAML + instrucciones
├── scripts/              # Opcional: codigo ejecutable (.py, .sh, .js)
├── references/           # Opcional: docs de referencia (>5k palabras)
└── assets/               # Opcional: templates, imagenes, fonts
```

### Frontmatter YAML

```yaml
---
name: skill-name                    # Identificador (lowercase, hyphens, max 64 chars)
description: Que hace               # Claude usa esto para decidir cuando activarlo
argument-hint: "[argumento]"        # Hint en autocomplete (opcional)
user-invocable: false               # Solo Claude puede invocarlo (opcional)
disable-model-invocation: true      # Solo el usuario puede invocarlo (opcional)
allowed-tools: Read, Write, Bash    # Tools permitidos sin pedir permiso (opcional)
model: claude-sonnet-4-6            # Modelo especifico (opcional)
context: fork                       # Ejecuta en subagent aislado (opcional)
agent: Explore                      # Tipo de agente (opcional)
---
```

### Variables de Sustitucion

| Variable | Descripcion |
|----------|-------------|
| `$ARGUMENTS` | Todos los argumentos del usuario |
| `$ARGUMENTS[N]` o `$N` | Argumento por indice (0-based) |
| `${CLAUDE_SESSION_ID}` | ID de sesion actual |
| `${CLAUDE_SKILL_DIR}` | Directorio del skill |
| `` !`comando` `` | Inyeccion de contexto dinamico (ejecuta shell) |

### Progressive Disclosure

1. **Metadata** (~100 palabras) - Siempre en contexto (frontmatter)
2. **SKILL.md** (<5k palabras) - Cuando se activa
3. **Resources** (unlimited) - Bajo demanda (scripts/, references/, assets/)

---

## Memoria Persistente (.claude/memory/)

SaaS Factory incluye un sistema de memoria persistente POR PROYECTO que reemplaza la auto-memory de Claude Code.

**Por que?** La auto-memory de Claude Code guarda notas en `~/.claude/projects/` (local a tu maquina). Eso significa que no viaja con el repo, no es versionado, no es compartido con tu equipo, y Claude decide que guardar sin tu control.

**Como funciona:**
- `.claude/memory/MEMORY.md` es el indice (max 200 lineas, se carga automaticamente)
- Carpetas por tipo: `user/`, `feedback/`, `project/`, `reference/`
- Git-versioned: cada cambio es un commit que puedes revertir
- El skill `memory-manager` gestiona cuando consultar y cuando guardar

**Activacion:** La primera vez que se usa el skill `memory-manager`, automaticamente deshabilita la auto-memory de Claude Code en `.claude/settings.json` y crea la estructura de carpetas.

---

## Recursos Compartidos

Los skills referencian estos directorios (NO se mueven):

| Recurso | Path | Usado por |
|---------|------|-----------|
| PRP Template | `.claude/PRPs/prp-base.md` | Skill `prp` |
| AI Templates | `.claude/skills/ai/references/` | Skill `ai` |
| Design Systems | `.claude/design-systems/` | Directo (5 sistemas) |

---

## Crear un Nuevo Skill

```bash
# Opcion 1: Usar skill-creator
/skill-creator

# Opcion 2: Manual
mkdir .claude/skills/mi-skill
# Crear SKILL.md con frontmatter + instrucciones
```

### Checklist

- [ ] SKILL.md con YAML frontmatter valido (name + description)
- [ ] Contenido <5k palabras, forma imperativa
- [ ] Scripts con --help y manejo de errores
- [ ] References para docs >5k palabras
- [ ] Descripcion clara de cuando usarlo

---

## Migracion V3 → V4

| V3 | V4 |
|----|-----|
| `.claude/commands/*.md` | `.claude/skills/*/SKILL.md` |
| `.claude/agents/*.md` | `.claude/skills/*/SKILL.md` (user-invocable: false, context: fork) |
| `.claude/prompts/*.md` | `.claude/skills/*/SKILL.md` |
| Agentes como archivos sueltos | Frontmatter `agent:` y `context: fork` en skills |
| AI Templates como docs | Skill `/ai` con `references/` colocalizados |
| PRPs como template suelto | Skill `/prp` que genera PRPs con context: fork |

---

*SaaS Factory V4: Todo es un Skill.*
*Basado en Claude Code Skills 2.0 (CC 2.1.0+)*
