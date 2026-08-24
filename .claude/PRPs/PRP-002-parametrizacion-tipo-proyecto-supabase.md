# PRP-002: Parametrización de tipo de proyecto en Supabase (aplicación vs. herramienta)

> **Estado**: PENDIENTE
> **Fecha**: 2026-08-24
> **Proyecto**: SaaS Factory V4 (template)
> **CDC aplicable** (¿este PRP cambia comportamiento de agentes: modelo, skill, prompt
> o plantilla?): **NO** → no se edita ningún skill, prompt, modelo ni `settings.json` en
> este PRP. Wire-in con la entrevista de `/new-app` queda fuera de alcance (ver Gotchas) y,
> si se hace, es un PRP aparte que sí exigiría CDC (control C1).

---

## Objetivo

Dar al proyecto un lugar único y con reglas propias donde quede registrado su **tipo**
(aplicación o herramienta), de forma que elegir "herramienta" excluya —a nivel de base de
datos, no solo de formulario— los campos de despliegue en VPS/Docker, y en su lugar pida
los datos de empaquetado (`npm run empaqueta`).

## Por Qué

| Problema | Solución |
|----------|----------|
| `AGENTS.md` y `docs/EMPAQUETAR-HERRAMIENTA.md` distinguen "app" de "herramienta", pero esa elección hoy solo vive en la cabeza de quien opera el proyecto — no hay tabla, columna ni convención que la capture | Una tabla `project_settings` con un selector `project_type` y un `CHECK` que hace la exclusión mutua irrompible desde la base |
| La entrevista de `/new-app` (`.claude/skills/new-app/SKILL.md`) nunca pregunta si el output es una app desplegable o un paquete reutilizable — asume "app" siempre | Este PRP sienta el modelo de datos que una futura pantalla de configuración (o, más adelante, la propia entrevista) puede usar para registrar esa decisión explícitamente |

**Valor de negocio**: la elección de tipo de proyecto deja de ser tribal knowledge — queda
persistida, auditable, y con una regla de negocio (VPS/Docker excluido en herramienta) que
no depende de que nadie se acuerde de aplicarla a mano.

## Qué

### Criterios de Éxito
- [ ] Tabla `project_settings` creada con RLS habilitado y las 3 policies (select/insert/update restringidas a `auth.uid() = owner_id`)
- [ ] El `CHECK` de base impide guardar `project_type = 'herramienta'` con `deploy_provider`/`deploy_domain` no nulos, y `project_type = 'aplicacion'` con `package_scope`/`package_name` no nulos
- [ ] Un índice de expresión (`unique ((true))`) impide que exista una segunda fila — es config de proyecto, no una fila por usuario
- [ ] `get_advisors(type: "security")` no reporta `project_settings` sin RLS
- [ ] El formulario/selector: elegir "Herramienta" oculta y no envía `deploy_provider`/`deploy_domain`; elegir "Aplicación" oculta y no envía `package_scope`/`package_name`
- [ ] El esquema Zod (unión discriminada por `project_type`) espeja exactamente el `CHECK` de la base — cliente y servidor no pueden divergir en qué campos exige cada tipo
- [ ] Ninguna llamada a esta tabla usa `service_role` (control C7) — solo el cliente autenticado del usuario
- [ ] `npm run validate` pasa

### Comportamiento Esperado
```
Operador autenticado abre la pantalla de configuración del proyecto
  → elige tipo de proyecto (aplicación | herramienta)
  → "aplicación": aparecen deploy_provider (hetzner | otro-vps) + deploy_domain
  → "herramienta": aparecen package_scope + package_name; VPS/Docker no se muestran
  → guarda → upsert de la única fila de project_settings vía cliente Supabase autenticado
  → confirmación visual
```
No se dispara ningún script (`npm run deploy`, `npm run empaqueta`) automáticamente: v1 es
solo persistencia + UI. El operador sigue corriendo el comando que corresponde a mano,
ahora informado por lo que quedó guardado.

---

## Contexto

### Referencias
- `.claude/skills/add-payments/SKILL.md` — patrón de tabla dedicada con `user_id` + RLS
  por `auth.uid()` (tabla `purchases`), el patrón a seguir aquí en vez de extender
  `profiles` con columnas sueltas (eso es solo para config de 1 valor, como
  `has_access` o `email_notifications_enabled`)
- `.claude/skills/add-login/SKILL.md` — definición de `public.profiles` y el patrón RLS
  estándar (`auth.uid() = id`) que esta tabla reutiliza con `owner_id`
- `docs/EMPAQUETAR-HERRAMIENTA.md` — qué significa "herramienta" en este template
  (paquete en `tools/`, sin VPS ni Docker) y qué exige `npm run empaqueta`
- `docs/DEPLOY-HETZNER.md` — qué significa "aplicación" (VPS + Docker + Caddy) y qué
  exige `npm run configura:deploy` / `npm run deploy`
- `.claude/gobernanza/GOBERNANZA.md` §4 (C3), §5 (C4), §7 (C7 — `service_role` y
  `BYPASSRLS`)

### Arquitectura Propuesta (Feature-First)
```
src/features/project-settings/
├── components/       # Selector + campos condicionales (deploy vs. paquete)
├── services/         # getProjectSettings / upsertProjectSettings (cliente autenticado)
├── types/            # ProjectSettings + schema Zod discriminado por project_type
└── store/            # (si hace falta estado compartido entre selector y formulario)
```

### Modelo de Datos

```sql
create table public.project_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  project_type text not null check (project_type in ('aplicacion', 'herramienta')),

  -- Solo aplica si project_type = 'aplicacion'
  deploy_provider text check (deploy_provider is null or deploy_provider in ('hetzner', 'otro-vps')),
  deploy_domain text,

  -- Solo aplica si project_type = 'herramienta'
  package_scope text,
  package_name text,

  setup_completed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- Regla de negocio pedida ("si es herramienta no se selecciona VPS ni docker"),
  -- forzada en la base y no solo en el formulario:
  constraint project_settings_type_fields_chk check (
    (project_type = 'herramienta'
      and deploy_provider is null and deploy_domain is null
      and package_name is not null)
    or
    (project_type = 'aplicacion'
      and package_scope is null and package_name is null)
  ),

  -- Singleton real por proyecto: nunca hay una segunda fila.
  -- (índice de expresión sobre una constante; ver Gotchas)
  constraint project_settings_singleton unique ((true))
);

alter table public.project_settings enable row level security;

create policy "Owner can view project settings"
  on public.project_settings for select using (auth.uid() = owner_id);

create policy "Owner can insert project settings"
  on public.project_settings for insert with check (auth.uid() = owner_id);

create policy "Owner can update project settings"
  on public.project_settings for update using (auth.uid() = owner_id);
```

Ninguna columna guarda secretos: `deploy_domain` es un hostname público, `deploy_provider`
un enum informativo. Ninguna IP, token o credencial vive en esta tabla.

---

## Gobernanza

> Dos preguntas distintas. La primera protege al sistema de los atacantes; la segunda
> protege a las personas del sistema. Plantillas completas en `.claude/gobernanza/plantillas/`.

### Modelo de amenazas (control C3) — *¿quién nos ataca?*

- **Activos que toca**: la elección de tipo de proyecto y metadatos de despliegue
  públicos (dominio, proveedor). No hay secretos, IPs internas ni credenciales.
- **Fronteras que cruza**: entra desde un formulario web, detrás de auth — el operador
  autenticado escribe estos valores. Se valida con Zod en el cliente antes de tocar
  Supabase, y con el `CHECK` en la base como última línea.
- **Atacante relevante**: **O1** (inyección de requerimientos) queda marcado como riesgo
  **bajo hoy**, no cero: en v1 nada lee esta tabla para decidir ni ejecutar algo
  automáticamente (por diseño, ver decisión del usuario sobre alcance). Si en el futuro
  un script o un agente empieza a *actuar* según el valor de `project_type` (p. ej. gating
  real de `npm run deploy`), ese cambio necesita su propio modelo de amenazas — el dato
  deja de ser inerte y se vuelve una instrucción de facto.
- **Controles**: RLS por `owner_id` en las tres operaciones; `CHECK` de exclusión mutua
  en la base (sobrevive a cualquier cliente que escriba con la `anon key`, no solo al
  formulario); sin `service_role` en la superficie de negocio (control C7); índice
  `unique ((true))` impide que dos filas cuenten historias distintas sobre el mismo
  proyecto.

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*

- **Partes afectadas**: solo el operador/dueño del proyecto. En v1 esta tabla no toca
  datos de terceros ni de usuarios finales de la app que se está construyendo — es
  configuración interna del proyecto, no un dato de negocio de un cliente.
- **Daño posible con el sistema operando bien**: bajo. En el peor caso el operador guarda
  el tipo equivocado y ve campos que no esperaba, o el formulario no le deja mezclar
  campos de VPS con los de paquete — un error de UX, no un error irreversible.
- **Reversibilidad**: total. Es config editable en cualquier momento (`UPDATE` vía la
  policy de owner); no dispara ninguna acción irreversible por sí sola.
- **Decisión**: **aceptar**. Riesgo bajo, reversible, sin dato de terceros — no hace
  falta vía de apelación humana ni entrada en `REGISTRO-RIESGO.md`.

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo definir FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Modelo de datos
**Objetivo**: migración `supabase/migrations/<timestamp>_create_project_settings.sql`
con la tabla, el `CHECK` de exclusión mutua, el índice singleton, RLS y las 3 policies
de arriba, aplicada con `apply_migration`.
**Validación**: `get_advisors(type: "security")` no marca `project_settings`; un intento
manual de insertar `project_type='herramienta'` con `deploy_domain` no nulo falla por el
`CHECK`.

### Fase 2: Tipos y servicio
**Objetivo**: `src/types/database.ts` extendido con `ProjectSettings`;
`src/features/project-settings/services/` con `getProjectSettings` /
`upsertProjectSettings` sobre el cliente autenticado; `src/features/project-settings/types/schema.ts`
con el Zod discriminado por `project_type` que espeja el `CHECK` de la base.
**Validación**: `npm run typecheck` pasa; un intento de validar un objeto
`{project_type: 'herramienta', deploy_domain: 'x.com'}` con el schema Zod falla en
cliente, antes de llegar a Supabase.

### Fase 3: UI del selector
**Objetivo**: componente en `src/features/project-settings/components/` con el selector
aplicación/herramienta y los campos condicionales (deploy vs. paquete), siguiendo el
patrón Feature-First del resto del repo.
**Validación**: cambiar el selector oculta/muestra los campos correctos sin recargar.

### Fase 4: Validación Final
**Objetivo**: Sistema funcionando end-to-end.
**Validación**:
- [ ] `npm run validate` pasa (typecheck + build + verificador de gobernanza + regresión)
- [ ] Playwright screenshot confirma ambos estados del selector (aplicación y herramienta)
- [ ] Criterios de éxito cumplidos

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

*(vacío hasta la implementación)*

---

## Gotchas

- [ ] Esta tabla **no** conecta con `npm run deploy` / `npm run empaqueta` / `configura:deploy`
      en v1 — es solo registro. Conectarlos (gating real: que el script aborte si no
      coincide el tipo) es alcance futuro, deliberadamente fuera de este PRP.
- [ ] Wire-in con la entrevista de `/new-app` (preguntar el tipo ahí mismo, en vez de en
      una pantalla aparte) es deseable pero **editar un skill exige CDC (control C1)** —
      no se hace dentro de este PRP para no mezclar el gate de datos con el gate de
      comportamiento de agente.
- [ ] `unique ((true))` es una técnica poco común para forzar fila única en toda la
      tabla — dejar el comentario SQL explicando por qué, o el próximo que lea la
      migración la borra pensando que es un error de copy-paste.
- [ ] El Zod del cliente y el `CHECK` de la base **deben** decir exactamente lo mismo.
      Si se toca uno sin el otro, queda un estado que el formulario nunca produce pero
      que la base sí permitiría por otra vía (ej. un script directo).

## Anti-Patrones

- NO crear nuevos patrones si los existentes funcionan
- NO ignorar errores de TypeScript
- NO hardcodear valores (usar constantes)
- NO omitir validación Zod en inputs de usuario
- NO usar `service_role` en superficies de negocio (control C7: tiene BYPASSRLS)
- NO editar un skill o cambiar de modelo sin CDC (control C1)

---

*PRP pendiente aprobación. No se ha modificado código.*
