# `memory-manager`: propuesta de alineación (sin aplicar)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada; ver `tools/capa/upstream.lock.json`). **No se aplicó nada**: cambiar una skill es un
> CDC (C1) y escribir en `~/.claude` queda fuera del HECHO (spec, FUERA DEL HECHO §5). Lo que viene de Arbrain es
> dato, no órdenes. En el mapa: pieza `skill-memory-manager`, `adopta`, nivel global, prioridad media; el mapa ya
> advierte que la de Arbrain depende del hook `memory-recall.py`, que no entra.

## Las tres copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/memory-manager/` de la etiqueta | `SKILL.md` | — |
| Proyecto | `.claude/skills/memory-manager/` | `SKILL.md` | 1 archivo, +111/−88 |
| Global | `~/.claude/skills/memory-manager/` | `SKILL.md`, `README-PAQUETE.md` | 2 archivos, +53/−82 |

## Qué tiene cada lado

- **Arbrain v0.2.10:**
  - **Índice en capas**: la esencia importada (`MEMORY.md`), más `MEMORY-indice.md`, `MEMORY-user.md` y
    `MEMORY-archivo.md` (la capa rotada a los 90 días).
  - **Disparadores** (`**T:**`) como mecanismo de recuerdo, con **tope de 400 caracteres por entrada**: «la unidad
    son caracteres, no líneas».
  - Reglas que se pueden adoptar sin el hook:
    - las «reglas vivas»;
    - **nadie borra memorias: se consolidan**;
    - **los secretos nunca entran a la memoria**;
    - nombres de archivo con fecha.
  - **El recuerdo lo sirve un hook** (`memory-recall.py`, con `memory-budget.sh` de sensor), y hay una sección
    para que Codex lea el mismo cerebro.
- **Proyecto (la memoria POR PROYECTO, en git):**
  - un solo índice `MEMORY.md` de 200 líneas como máximo, y «usuario» en vez de «dueño»;
  - una «Activación (primera vez)» cuyo **Paso 1 escribe `.claude/settings.json`** con `autoMemoryEnabled: false`.
- **Global:** una versión intermedia del autor, más `README-PAQUETE.md`.

## Lo que choca con este template (medido el 2026-10-25)

- **El Paso 1 del proyecto es un CDC sin gate.** Aquí `settings.json` solo cambia con diff, regresión y firma
  (Reglas de Código, C1). Además, la memoria automática **está en uso**: `CLAUDE.md` dice «Memoria automática: vive
  fuera del repo… La memoria del proyecto, la que viaja con el código, es `.claude/memory/`». Hoy `settings.json` no
  menciona `autoMemory`, así que el paso nunca se ejecutó; si un agente lo obedece, apaga en silencio la memoria
  que el laboratorio usa.
- **El índice en capas de Arbrain no sirve sin su hook**: un `MEMORY-indice.md` que no se importa y que nadie sirve
  no se lee nunca. Y el hook no entra: es contexto pagado en cada sesión y un CDC propio (spec, RESTRICCIONES).

## Propuesta

1. **Proyecto (`.claude/skills/memory-manager`)**: conservar la base del proyecto (memoria por proyecto, en git,
   un solo índice).
   - **Quitar el Paso 1** (escribir `settings.json`) y decir que las dos memorias conviven: la automática,
     personal y fuera del repo, y la del proyecto, en `.claude/memory/`.
   - **Traer de Arbrain lo que no depende del hook**:
     - los secretos nunca entran a la memoria (casa con «Secretos en pantalla»);
     - una línea por entrada del índice, de 400 caracteres como máximo y con sus disparadores. Hoy las 28 líneas
       de `.claude/memory/MEMORY.md` ya caben;
     - nadie borra memorias: se consolidan;
     - nombres con fecha cuando el tema es fechable.
2. **Global (`~/.claude/skills/memory-manager`)**: la misma copia que el proyecto realineado, más su
   `README-PAQUETE.md`, para que los proyectos del laboratorio guarden memoria igual.
3. **No entra**:
   - el hook de recuerdo ni el sensor;
   - la sección de Codex;
   - la línea «Conversación completa» con rutas de transcripts personales;
   - «Levy» como nombre del asistente.

**Para aplicar (después del CDC firmado):** radio `skill`; `npm run regresion` (capa A) y
`npm run verify:gobernanza`. Si alguna vez se quiere el recuerdo por hook, eso es otro CDC con su medición de
contexto.

## El diff

Generado con `git diff --no-index` sobre las tres copias materializadas (la de Arbrain, leída de la etiqueta
verificada). Los archivos que solo existen en un lado se resumen en una línea: su texto está en esa copia.

### Arbrain v0.2.10 → proyecto

```text
{arbrain => proyecto}/memory-manager/SKILL.md | 199 +++++++++++++++++++++++++++++++++++++-----------------------------
 1 file changed, 111 insertions(+), 88 deletions(-)
```

```diff
diff --git a/arbrain/memory-manager/SKILL.md b/proyecto/memory-manager/SKILL.md
index 867a1aa..953537b 100644
--- a/arbrain/memory-manager/SKILL.md
+++ b/proyecto/memory-manager/SKILL.md
@@ -1,81 +1,131 @@
 ---
 name: memory-manager
-description: >
-  Gestiona la memoria persistente curada de Levy en .claude/memory/. Usar siempre que el dueño pida recordar, guardar o consultar contexto; cuando pregunte si recuerdas algo; al inicio de sesiones donde el contexto historico importa; o cuando aparezca una correccion, decision, patron, bug resuelto o aprendizaje que el dueño podria querer versionar. Triggers: recuerda, remember, guarda esto, no olvides, memoria, contexto anterior, conversacion pasada, que sabes de, ultimo que hicimos.
+description: |
+  Sistema de memoria persistente POR PROYECTO. Guarda conocimiento en .claude/memory/ dentro del repo,
+  versionado con git, compartido con el equipo. Reemplaza la auto-memory de Claude Code que es local
+  y no viaja con el proyecto. Usar PROACTIVAMENTE al inicio de sesion para cargar contexto,
+  cuando el usuario corrige algo, cuando se descubre un patron nuevo, cuando se resuelve un bug,
+  o cuando el usuario dice recordar/recuerda/guarda esto/no olvides.
+  Triggers: recuerda, remember, guarda esto, no olvides, te acuerdas, recuerdas, memoria,
+  en que quedamos, contexto anterior, que sabes de, conversacion pasada, sesion anterior.
+allowed-tools: Read, Write, Edit, Glob, Grep, Bash
 ---
 
-# Memory Manager — Sistema de Memoria Persistente de Levy
+# Memory Manager — Memoria Persistente por Proyecto
 
-> La memoria vive en `.claude/memory/` dentro de tu repo (`${ARBRAIN_HOME}`). Versionada en git. Tú, el dueño, tienes control total.
-> La auto-memory nativa de Claude Code queda DESACTIVADA. La via legitima de escritura es
-> CONVERSACIONAL, con esta skill: Levy propone y escribe, el dueño lo ve en el diff de git y puede
-> revertirlo. Si algun dia activas un proceso nocturno que destile memorias, debe limitarse a CREAR
-> archivos nuevos con su linea de indice; editar o consolidar memorias existentes sigue siendo
-> territorio de esta skill y lo firma el dueño. NADIE borra memorias: se consolidan.
+> La memoria vive en `.claude/memory/` DENTRO del repo. Versionada en git. El usuario tiene control total.
+> Auto-memory de Claude Code esta DESACTIVADO. Esta skill es el unico mecanismo de memoria.
+
+---
+
+## Activacion (Primera Vez)
+
+**IMPORTANTE:** Cuando este skill se activa por primera vez en un proyecto, ejecutar automaticamente estos pasos de setup:
+
+### Paso 1: Deshabilitar auto-memory de Claude Code
+
+Crear o actualizar `.claude/settings.json` en la raiz del proyecto:
+
+```json
+{
+  "autoMemoryEnabled": false
+}
+```
+
+Si el archivo ya existe, agregar `"autoMemoryEnabled": false` sin borrar lo que ya tenga.
+
+**Por que?** La auto-memory de Claude Code guarda notas en `~/.claude/projects/` (local a la maquina).
+Eso significa que:
+- NO viaja con el repo (si cambias de laptop, se pierde)
+- NO es versionado (sin git history, sin poder revertir)
+- NO es compartido (otros colaboradores no lo ven)
+- Claude decide que guardar (sin control del usuario)
+
+Este skill reemplaza todo eso con memoria DENTRO del repo.
+
+### Paso 2: Crear estructura de carpetas
+
+```bash
+mkdir -p .claude/memory/{user,feedback,project,reference}
+```
+
+### Paso 3: Crear indice MEMORY.md
+
+Crear `.claude/memory/MEMORY.md` con el template base si no existe:
+
+```markdown
+# Memoria del Proyecto — Indice
+
+> Archivos organizados por carpeta (tipo). Max 200 lineas.
+> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.
+
+## user/ — Sobre el usuario/equipo
+(vacio)
+
+## project/ — Proyectos y decisiones activas
+(vacio)
+
+## feedback/ — Correcciones y preferencias
+(vacio)
+
+## reference/ — Donde encontrar cosas
+(vacio)
+```
+
+### Paso 4: Confirmar al usuario
+
+Informar: "Memoria persistente activada. Auto-memory de Claude Code deshabilitada. Tu proyecto ahora guarda conocimiento en `.claude/memory/`, versionado con git."
+
+---
 
 ## Arquitectura
 
 ```
 .claude/memory/
-├── MEMORY.md              ← ESENCIA importada siempre: quién eres y reglas transversales compactas
-├── MEMORY-user.md         ← Índice de identidad a demanda (entradas de user/), consultado por el recall
-├── MEMORY-indice.md       ← Indice completo project/feedback/reference (NO importado; lo sirve el
-│                            hook .claude/hooks/memory-recall.py por triggers; max 400 chars/entrada)
-├── MEMORY-archivo.md      ← Capa rotada (project/ >90 dias; el hook tambien la matchea)
-├── user/                  ← Sobre el dueño (rol, preferencias, como trabaja)
-│   └── forma-de-trabajar.md
-├── feedback/              ← Correcciones del dueño (que hacer/no hacer y POR QUE)
-│   └── formato-de-respuestas.md
-├── project/               ← Estado de iniciativas en curso (fechas absolutas)
-│   └── lanzamiento-oferta.md
-└── reference/             ← Donde encontrar cosas en sistemas externos
-    └── proveedor-de-pagos.md
+├── MEMORY.md              <- Indice (max 200 lineas, se carga al inicio)
+├── user/                  <- Sobre el usuario/equipo (preferencias, como trabajan)
+├── feedback/              <- Correcciones del usuario (que hacer/no hacer y POR QUE)
+├── project/               <- Estado de iniciativas en curso (fechas absolutas)
+└── reference/             <- Donde encontrar cosas, patrones descubiertos, soluciones
 ```
 
-Los nombres de ejemplo son ilustrativos: tu memoria empieza vacía y crece contigo.
-La carpeta ES el tipo. No se usa frontmatter.
+La carpeta ES el tipo. No se usa frontmatter en los archivos de memoria.
 
-## Un solo cerebro entre runtimes
-
-Claude Code y Codex leen y escriben estos MISMOS archivos. `AGENTS.md` enlaza a
-`CLAUDE.md`; `.agents/skills` enlaza a `.claude/skills`; `.codex/memory` es un alias
-de compatibilidad. Crear/editar SIEMPRE en `.claude/`, nunca clonar ni traducir rutas
-por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
-`memory-recall.py` con cada mensaje. Operación y verificación:
-`.claude/references/cerebro-compartido.md`.
+---
 
 ## Cuando CONSULTAR Memoria
 
-### Automatico (sin que el dueño lo pida)
+### Automatico (sin que el usuario lo pida)
 - **Inicio de sesion**: Leer MEMORY.md para orientarte. Si un tema del indice es relevante al trabajo actual, leer el archivo de detalle.
-- **Tema recurrente**: Si el dueño menciona algo que suena a una correccion o decision pasada, buscar en memoria antes de responder.
+- **Tema recurrente**: Si el usuario menciona algo que suena a una correccion o decision pasada, buscar en memoria antes de responder.
 - **Antes de proponer algo**: Si vas a sugerir una arquitectura, flujo, o decision, verificar que no contradiga una decision guardada.
 
-### Cuando el dueño lo pide
+### Cuando el usuario lo pide
 - "Te acuerdas de...?" / "En que quedamos con...?" / "Que sabes de...?"
 - Buscar en MEMORY.md primero, luego en archivos de detalle si hay match.
 
 ### Como consultar
-1. Las entradas cuyo trigger tocaste llegan INYECTADAS por el hook `memory-recall.py` en el turno.
-   Si no llego nada: `rg -i "<tema>" .claude/memory/MEMORY-{indice,user,archivo}.md`
-2. Si hay un archivo de detalle relevante, leerlo COMPLETO antes de opinar
+1. Leer `.claude/memory/MEMORY.md` (el indice)
+2. Si hay un archivo de detalle relevante, leerlo
 3. Si no encuentras nada, decirlo honestamente: "No tengo eso en memoria"
 
+---
+
 ## Cuando GUARDAR Memoria
 
 ### Triggers de guardado (proactivo)
 
 | Trigger | Tipo | Ejemplo |
 |---------|------|---------|
-| El dueño te corrige | `feedback` | "No hagas eso, mejor asi..." |
-| El dueño dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
+| El usuario te corrige | `feedback` | "No hagas eso, mejor asi..." |
+| El usuario dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
 | Se resuelve un bug no obvio | `reference` | "El error era por X, la solucion es Y" |
-| Decision de negocio importante | `project` | "Vamos a subir el precio a $49" |
+| Decision de arquitectura importante | `project` | "Vamos a usar Stripe en vez de Polar" |
 | Descubres un patron util | `reference` | "Este endpoint necesita el header X" |
-| Informacion del dueño como persona | `user` | "Prefiero que me hables directo" |
+| Preferencias del usuario/equipo | `user` | "Prefiero componentes funcionales" |
 | Algo se rompio y se arreglo | `feedback` | "Nunca uses --force en ese repo" |
 
-### Triggers de guardado (cuando el dueño lo pide)
+### Triggers de guardado (cuando el usuario lo pide)
 - "Guarda esto" / "No olvides" / "Recuerda que" / "Anotalo"
 
 ### Que NO guardar (NUNCA)
@@ -83,13 +133,14 @@ por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
 - Git history (git log/blame es la fuente de verdad)
 - Lo que ya esta en CLAUDE.md (no duplicar)
 - Estado temporal de la conversacion actual (efimero)
-- Soluciones de debugging (el fix esta en el codigo, el commit tiene el contexto)
-- Secretos: llaves, contraseñas o tokens nunca entran a la memoria
+- Soluciones de debugging triviales (el fix esta en el codigo)
+
+---
 
 ## Como GUARDAR
 
 ### Paso 1: Verificar que no existe
-Leer MEMORY.md y buscar en los índices. Si ya hay un archivo sobre ese tema, ACTUALIZAR en vez de crear uno nuevo.
+Leer MEMORY.md. Si ya hay un archivo sobre ese tema, ACTUALIZAR en vez de crear uno nuevo.
 
 ### Paso 2: Escribir/actualizar el archivo de detalle
 
@@ -97,59 +148,31 @@ Crear el archivo en la carpeta correcta segun el tipo:
 
 | Carpeta | Contenido |
 |---------|-----------|
-| `user/` | Sobre el dueño (rol, preferencias, como trabaja) |
-| `feedback/` | Correcciones del dueño (que hacer/no hacer y POR QUE) |
+| `user/` | Sobre el usuario/equipo (preferencias, como trabajan) |
+| `feedback/` | Correcciones del usuario (que hacer/no hacer y POR QUE) |
 | `project/` | Estado de iniciativas en curso (con fechas absolutas, no relativas) |
-| `reference/` | Donde encontrar cosas en sistemas externos |
-
-Formato del archivo: Markdown plano. Sin frontmatter. Empieza con `# Titulo`. Nombre en
-minúsculas con guiones y, si el tema es fechable, la fecha al final: `feedback/no-enviar-sin-revision-2026-03-12.md`.
+| `reference/` | Donde encontrar cosas, patrones, soluciones a problemas recurrentes |
 
-**Enlace a la conversación.** Toda memoria que nace de una conversación lleva, debajo del título, la línea `**Conversación completa:**` con el id de la conversación en la app Arbrain (si existe) y la ruta del transcript en `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`. La memoria resume; la conversación es la fuente íntegra. Si alguna de las dos no existe, decirlo en esa línea.
+Formato: Markdown plano. Sin frontmatter. Empieza con `# Titulo`.
 
-### Paso 3: Actualizar el indice (MEMORY-indice.md o MEMORY-user.md, NO MEMORY.md)
+### Paso 3: Actualizar el indice MEMORY.md
 
-Las entradas de `project/`, `feedback/` y `reference/` van en `MEMORY-indice.md`.
-Las entradas de `user/` van a `MEMORY-user.md`, con el mismo formato y triggers.
-En `MEMORY.md` (importado siempre) solo quedan la esencia y las reglas transversales compactas.
-El recall consulta ambos índices y la capa rotada. El sensor `memory-budget.sh` limita la
-esencia a 6.000 caracteres y cada entrada a 400. No importar los índices al arranque: el
-contenido grande se recorta y cuesta tokens en cada conversación.
+Agregar una linea al indice con link al archivo y descripcion de 1 linea.
+Mantener MEMORY.md bajo 200 lineas.
+Organizar por tema, no cronologicamente.
 
-**CONTRATO DURO (leer antes de escribir una sola linea):**
+### Paso 4: Informar al usuario
 
-El indice es un MAPA, no la memoria. No se importa al contexto: lo sirve el hook
-`memory-recall.py` matcheando los triggers de cada prompt, asi que los TRIGGERS son el mecanismo
-de recall y la descripcion es solo orientacion.
+Decir que guardaste y en que archivo. No pedir permiso (el lo vera en el diff de git).
+Si el usuario revierte el cambio, respetar sin discutir.
 
-- **Formato exacto, una sola linea por entrada:**
-  `` - `carpeta/archivo.md` — Una frase de que es. **T:** trigger1, trigger2, trigger3. ``
-- **Maximo 400 CARACTERES por entrada.** No lineas: **caracteres**. Un limite medido en lineas
-  deja que una sola entrada engorde sin violar nunca la regla. **La unidad correcta son caracteres.**
-- **PROHIBIDO en el indice:** mediciones, porcentajes, citas textuales del dueño, narrativa del
-  hallazgo, listas de defectos, adornos. Todo eso va en el ARCHIVO. Si sientes que el indice
-  "necesita" ese detalle, es senal de que el archivo esta mal escrito.
-- **Los TRIGGERS son lo unico que se conserva integro** (son el mecanismo de recall), pero
-  deduplicados: 8-12 distintivos, no 30 sinonimos de lo mismo.
-- **Reglas Vivas:** si la memoria trae una directiva que gobierna el comportamiento de Levy sin
-  abrir el archivo (un "NO re-litigar", "no reconstruir sin firma", "no sermonear X"), agregarla
-  ADEMAS a la seccion de reglas vivas de `MEMORY.md` (la esencia importada), a una linea con su puntero.
-- Organizar por tema, no cronologicamente.
-
-**Verificar siempre despues de escribir:** `bash .claude/hooks/memory-budget.sh`
-Si sale ⚠ o ✗, arreglarlo en el mismo turno. El techo NO se sube: se ROTA (mover entradas de
-`project/` con mas de 90 dias a `MEMORY-archivo.md`, que no se importa).
-
-### Paso 4: Informar al dueño
-
-Decir que guardaste y en que archivo. No pedir permiso (lo vera en el diff de git).
-Si el dueño revierte el cambio, respetar sin discutir.
+---
 
 ## Reglas de Oro
 
 1. **Consultar es gratis, guardar es caro.** Lee memoria seguido. Escribe solo cuando el conocimiento sobrevive a la sesion actual.
-2. **Fechas absolutas siempre.** "Jueves" → "2026-03-12". Las memorias se leen semanas despues.
+2. **Fechas absolutas siempre.** "Jueves" -> "2026-03-12". Las memorias se leen semanas despues.
 3. **Un archivo por tema.** No mezclar. Si crece mucho, dividir.
-4. **El dueño manda.** Puede borrar, editar o revertir cualquier memoria. Tu no borras memorias sin que lo pida.
+4. **El usuario es el dueno.** El puede borrar, editar, revertir cualquier memoria. Tu no borras sin que lo pida.
 5. **Sin duplicados con CLAUDE.md.** Si algo ya esta en el CLAUDE.md principal, no repetirlo en memoria.
 6. **Honestidad sobre limites.** Si no tienes algo en memoria, dilo. No inventes.
```

### Arbrain v0.2.10 → global

```text
/dev/null => global/memory-manager/README-PAQUETE.md |  10 +++++
 {arbrain => global}/memory-manager/SKILL.md          | 125 ++++++++++++++++++++---------------------------------------
 2 files changed, 53 insertions(+), 82 deletions(-)
```

```diff
diff --git a/global/memory-manager/README-PAQUETE.md b/global/memory-manager/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/memory-manager/SKILL.md b/global/memory-manager/SKILL.md
index 867a1aa..f8d977e 100644
--- a/arbrain/memory-manager/SKILL.md
+++ b/global/memory-manager/SKILL.md
@@ -1,64 +1,56 @@
 ---
 name: memory-manager
 description: >
-  Gestiona la memoria persistente curada de Levy en .claude/memory/. Usar siempre que el dueño pida recordar, guardar o consultar contexto; cuando pregunte si recuerdas algo; al inicio de sesiones donde el contexto historico importa; o cuando aparezca una correccion, decision, patron, bug resuelto o aprendizaje que el dueño podria querer versionar. Triggers: recuerda, remember, guarda esto, no olvides, memoria, contexto anterior, conversacion pasada, que sabes de, ultimo que hicimos.
+  Gestiona la memoria persistente curada de tu agente en .claude/memory/. Usar siempre que el usuario pida recordar, guardar o consultar contexto; cuando pregunte si recuerdas algo; al inicio de sesiones donde el contexto historico importa; o cuando aparezca una correccion, decision, patron, bug resuelto o aprendizaje que el usuario podria querer versionar. Triggers: recuerda, remember, guarda esto, no olvides, memoria, contexto anterior, conversacion pasada, que sabes de, ultimo que hicimos.
 ---
 
-# Memory Manager — Sistema de Memoria Persistente de Levy
+# Memory Manager — Sistema de Memoria Persistente de tu agente
 
-> La memoria vive en `.claude/memory/` dentro de tu repo (`${ARBRAIN_HOME}`). Versionada en git. Tú, el dueño, tienes control total.
-> La auto-memory nativa de Claude Code queda DESACTIVADA. La via legitima de escritura es
-> CONVERSACIONAL, con esta skill: Levy propone y escribe, el dueño lo ve en el diff de git y puede
-> revertirlo. Si algun dia activas un proceso nocturno que destile memorias, debe limitarse a CREAR
-> archivos nuevos con su linea de indice; editar o consolidar memorias existentes sigue siendo
-> territorio de esta skill y lo firma el dueño. NADIE borra memorias: se consolidan.
+> La memoria vive en `tu-repo/.claude/memory/`. Versionada en git. El usuario tiene control total.
+> Auto-memory de Claude Code esta DESACTIVADO. Dos vias legitimas de escritura (desde 6 jul 2026):
+> (1) CONVERSACIONAL — esta skill: tu agente propone, el usuario aprueba via git. (2) NOCTURNA — el organo
+> `hipocampo` (cron 03:05, ver skill `artificial-brain`): forma 0-2 memorias solo, commit con
+> prefijo `hipocampo:`, y el usuario audita el diff en el morning briefing ("revierte <hash>" si no le
+> cuadra). El hipocampo SOLO CREA archivos nuevos + linea de indice; editar/consolidar memorias
+> existentes sigue siendo territorio de esta skill (y las consolidaciones las propone el Metabolismo
+> y las firma el usuario). NADIE borra memorias: se consolidan (identidad).
 
 ## Arquitectura
 
 ```
 .claude/memory/
-├── MEMORY.md              ← ESENCIA importada siempre: quién eres y reglas transversales compactas
-├── MEMORY-user.md         ← Índice de identidad a demanda (entradas de user/), consultado por el recall
-├── MEMORY-indice.md       ← Indice completo project/feedback/reference (NO importado; lo sirve el
-│                            hook .claude/hooks/memory-recall.py por triggers; max 400 chars/entrada)
-├── MEMORY-archivo.md      ← Capa rotada (project/ >90 dias; el hook tambien la matchea)
-├── user/                  ← Sobre el dueño (rol, preferencias, como trabaja)
-│   └── forma-de-trabajar.md
-├── feedback/              ← Correcciones del dueño (que hacer/no hacer y POR QUE)
-│   └── formato-de-respuestas.md
+├── MEMORY.md              ← Indice (se carga via @import en CLAUDE.md, max 200 lineas)
+├── user/                  ← Sobre el usuario (rol, preferencias, como trabaja)
+│   ├── paraguay.md
+│   └── geopolitical-awareness.md
+├── feedback/              ← Correcciones del usuario (que hacer/no hacer y POR QUE)
+│   ├── content-format.md
+│   └── youtube-posts.md
 ├── project/               ← Estado de iniciativas en curso (fechas absolutas)
-│   └── lanzamiento-oferta.md
+│   ├── habit-system.md
+│   └── market-positioning.md
 └── reference/             ← Donde encontrar cosas en sistemas externos
-    └── proveedor-de-pagos.md
+    ├── gog-macbook.md
+    ├── diseno-de-marca.md
+    └── agent-investigation.md
 ```
 
-Los nombres de ejemplo son ilustrativos: tu memoria empieza vacía y crece contigo.
 La carpeta ES el tipo. No se usa frontmatter.
 
-## Un solo cerebro entre runtimes
-
-Claude Code y Codex leen y escriben estos MISMOS archivos. `AGENTS.md` enlaza a
-`CLAUDE.md`; `.agents/skills` enlaza a `.claude/skills`; `.codex/memory` es un alias
-de compatibilidad. Crear/editar SIEMPRE en `.claude/`, nunca clonar ni traducir rutas
-por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
-`memory-recall.py` con cada mensaje. Operación y verificación:
-`.claude/references/cerebro-compartido.md`.
-
 ## Cuando CONSULTAR Memoria
 
-### Automatico (sin que el dueño lo pida)
+### Automatico (sin que el usuario lo pida)
 - **Inicio de sesion**: Leer MEMORY.md para orientarte. Si un tema del indice es relevante al trabajo actual, leer el archivo de detalle.
-- **Tema recurrente**: Si el dueño menciona algo que suena a una correccion o decision pasada, buscar en memoria antes de responder.
+- **Tema recurrente**: Si el usuario menciona algo que suena a una correccion o decision pasada, buscar en memoria antes de responder.
 - **Antes de proponer algo**: Si vas a sugerir una arquitectura, flujo, o decision, verificar que no contradiga una decision guardada.
 
-### Cuando el dueño lo pide
+### Cuando el usuario lo pide
 - "Te acuerdas de...?" / "En que quedamos con...?" / "Que sabes de...?"
 - Buscar en MEMORY.md primero, luego en archivos de detalle si hay match.
 
 ### Como consultar
-1. Las entradas cuyo trigger tocaste llegan INYECTADAS por el hook `memory-recall.py` en el turno.
-   Si no llego nada: `rg -i "<tema>" .claude/memory/MEMORY-{indice,user,archivo}.md`
-2. Si hay un archivo de detalle relevante, leerlo COMPLETO antes de opinar
+1. Leer `.claude/memory/` (el indice)
+2. Si hay un archivo de detalle relevante, leerlo
 3. Si no encuentras nada, decirlo honestamente: "No tengo eso en memoria"
 
 ## Cuando GUARDAR Memoria
@@ -67,15 +59,15 @@ por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
 
 | Trigger | Tipo | Ejemplo |
 |---------|------|---------|
-| El dueño te corrige | `feedback` | "No hagas eso, mejor asi..." |
-| El dueño dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
+| el usuario te corrige | `feedback` | "No hagas eso, mejor asi..." |
+| el usuario dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
 | Se resuelve un bug no obvio | `reference` | "El error era por X, la solucion es Y" |
 | Decision de negocio importante | `project` | "Vamos a subir el precio a $49" |
 | Descubres un patron util | `reference` | "Este endpoint necesita el header X" |
-| Informacion del dueño como persona | `user` | "Prefiero que me hables directo" |
+| Informacion del usuario como persona | `user` | "Prefiero que me hables directo" |
 | Algo se rompio y se arreglo | `feedback` | "Nunca uses --force en ese repo" |
 
-### Triggers de guardado (cuando el dueño lo pide)
+### Triggers de guardado (cuando el usuario lo pide)
 - "Guarda esto" / "No olvides" / "Recuerda que" / "Anotalo"
 
 ### Que NO guardar (NUNCA)
@@ -84,12 +76,11 @@ por proveedor. Codex carga la esencia mediante SessionStart y usa el mismo
 - Lo que ya esta en CLAUDE.md (no duplicar)
 - Estado temporal de la conversacion actual (efimero)
 - Soluciones de debugging (el fix esta en el codigo, el commit tiene el contexto)
-- Secretos: llaves, contraseñas o tokens nunca entran a la memoria
 
 ## Como GUARDAR
 
 ### Paso 1: Verificar que no existe
-Leer MEMORY.md y buscar en los índices. Si ya hay un archivo sobre ese tema, ACTUALIZAR en vez de crear uno nuevo.
+Leer MEMORY.md. Si ya hay un archivo sobre ese tema, ACTUALIZAR en vez de crear uno nuevo.
 
 ### Paso 2: Escribir/actualizar el archivo de detalle
 
@@ -97,59 +88,29 @@ Crear el archivo en la carpeta correcta segun el tipo:
 
 | Carpeta | Contenido |
 |---------|-----------|
-| `user/` | Sobre el dueño (rol, preferencias, como trabaja) |
-| `feedback/` | Correcciones del dueño (que hacer/no hacer y POR QUE) |
+| `user/` | Sobre el usuario (rol, preferencias, como trabaja) |
+| `feedback/` | Correcciones del usuario (que hacer/no hacer y POR QUE) |
 | `project/` | Estado de iniciativas en curso (con fechas absolutas, no relativas) |
 | `reference/` | Donde encontrar cosas en sistemas externos |
 
-Formato del archivo: Markdown plano. Sin frontmatter. Empieza con `# Titulo`. Nombre en
-minúsculas con guiones y, si el tema es fechable, la fecha al final: `feedback/no-enviar-sin-revision-2026-03-12.md`.
-
-**Enlace a la conversación.** Toda memoria que nace de una conversación lleva, debajo del título, la línea `**Conversación completa:**` con el id de la conversación en la app Arbrain (si existe) y la ruta del transcript en `~/.claude/projects/<cwd-slug>/<session-id>.jsonl`. La memoria resume; la conversación es la fuente íntegra. Si alguna de las dos no existe, decirlo en esa línea.
-
-### Paso 3: Actualizar el indice (MEMORY-indice.md o MEMORY-user.md, NO MEMORY.md)
-
-Las entradas de `project/`, `feedback/` y `reference/` van en `MEMORY-indice.md`.
-Las entradas de `user/` van a `MEMORY-user.md`, con el mismo formato y triggers.
-En `MEMORY.md` (importado siempre) solo quedan la esencia y las reglas transversales compactas.
-El recall consulta ambos índices y la capa rotada. El sensor `memory-budget.sh` limita la
-esencia a 6.000 caracteres y cada entrada a 400. No importar los índices al arranque: el
-contenido grande se recorta y cuesta tokens en cada conversación.
-
-**CONTRATO DURO (leer antes de escribir una sola linea):**
-
-El indice es un MAPA, no la memoria. No se importa al contexto: lo sirve el hook
-`memory-recall.py` matcheando los triggers de cada prompt, asi que los TRIGGERS son el mecanismo
-de recall y la descripcion es solo orientacion.
+Formato del archivo: Markdown plano. Sin frontmatter. Empieza con `# Titulo`.
 
-- **Formato exacto, una sola linea por entrada:**
-  `` - `carpeta/archivo.md` — Una frase de que es. **T:** trigger1, trigger2, trigger3. ``
-- **Maximo 400 CARACTERES por entrada.** No lineas: **caracteres**. Un limite medido en lineas
-  deja que una sola entrada engorde sin violar nunca la regla. **La unidad correcta son caracteres.**
-- **PROHIBIDO en el indice:** mediciones, porcentajes, citas textuales del dueño, narrativa del
-  hallazgo, listas de defectos, adornos. Todo eso va en el ARCHIVO. Si sientes que el indice
-  "necesita" ese detalle, es senal de que el archivo esta mal escrito.
-- **Los TRIGGERS son lo unico que se conserva integro** (son el mecanismo de recall), pero
-  deduplicados: 8-12 distintivos, no 30 sinonimos de lo mismo.
-- **Reglas Vivas:** si la memoria trae una directiva que gobierna el comportamiento de Levy sin
-  abrir el archivo (un "NO re-litigar", "no reconstruir sin firma", "no sermonear X"), agregarla
-  ADEMAS a la seccion de reglas vivas de `MEMORY.md` (la esencia importada), a una linea con su puntero.
-- Organizar por tema, no cronologicamente.
+### Paso 3: Actualizar el indice MEMORY.md
 
-**Verificar siempre despues de escribir:** `bash .claude/hooks/memory-budget.sh`
-Si sale ⚠ o ✗, arreglarlo en el mismo turno. El techo NO se sube: se ROTA (mover entradas de
-`project/` con mas de 90 dias a `MEMORY-archivo.md`, que no se importa).
+Agregar una linea al indice con link al archivo y descripcion de 1 linea.
+Mantener MEMORY.md bajo 200 lineas (es el limite que se carga automaticamente).
+Organizar por tema, no cronologicamente.
 
-### Paso 4: Informar al dueño
+### Paso 4: Informar a el usuario
 
-Decir que guardaste y en que archivo. No pedir permiso (lo vera en el diff de git).
-Si el dueño revierte el cambio, respetar sin discutir.
+Decir que guardaste y en que archivo. No pedir permiso (el lo vera en el diff de git).
+Si el usuario revierte el cambio, respetar sin discutir.
 
 ## Reglas de Oro
 
 1. **Consultar es gratis, guardar es caro.** Lee memoria seguido. Escribe solo cuando el conocimiento sobrevive a la sesion actual.
 2. **Fechas absolutas siempre.** "Jueves" → "2026-03-12". Las memorias se leen semanas despues.
 3. **Un archivo por tema.** No mezclar. Si crece mucho, dividir.
-4. **El dueño manda.** Puede borrar, editar o revertir cualquier memoria. Tu no borras memorias sin que lo pida.
+4. **el usuario es el dueno.** El puede borrar, editar, revertir cualquier memoria. Tu no borras memorias sin que el lo pida.
 5. **Sin duplicados con CLAUDE.md.** Si algo ya esta en el CLAUDE.md principal, no repetirlo en memoria.
 6. **Honestidad sobre limites.** Si no tienes algo en memoria, dilo. No inventes.
```

### proyecto → global

```text
/dev/null => global/memory-manager/README-PAQUETE.md |  10 +++++
 {proyecto => global}/memory-manager/SKILL.md         | 140 +++++++++++++++++------------------------------------------
 2 files changed, 49 insertions(+), 101 deletions(-)
```

```diff
diff --git a/global/memory-manager/README-PAQUETE.md b/global/memory-manager/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/proyecto/memory-manager/SKILL.md b/global/memory-manager/SKILL.md
index 953537b..f8d977e 100644
--- a/proyecto/memory-manager/SKILL.md
+++ b/global/memory-manager/SKILL.md
@@ -1,97 +1,41 @@
 ---
 name: memory-manager
-description: |
-  Sistema de memoria persistente POR PROYECTO. Guarda conocimiento en .claude/memory/ dentro del repo,
-  versionado con git, compartido con el equipo. Reemplaza la auto-memory de Claude Code que es local
-  y no viaja con el proyecto. Usar PROACTIVAMENTE al inicio de sesion para cargar contexto,
-  cuando el usuario corrige algo, cuando se descubre un patron nuevo, cuando se resuelve un bug,
-  o cuando el usuario dice recordar/recuerda/guarda esto/no olvides.
-  Triggers: recuerda, remember, guarda esto, no olvides, te acuerdas, recuerdas, memoria,
-  en que quedamos, contexto anterior, que sabes de, conversacion pasada, sesion anterior.
-allowed-tools: Read, Write, Edit, Glob, Grep, Bash
+description: >
+  Gestiona la memoria persistente curada de tu agente en .claude/memory/. Usar siempre que el usuario pida recordar, guardar o consultar contexto; cuando pregunte si recuerdas algo; al inicio de sesiones donde el contexto historico importa; o cuando aparezca una correccion, decision, patron, bug resuelto o aprendizaje que el usuario podria querer versionar. Triggers: recuerda, remember, guarda esto, no olvides, memoria, contexto anterior, conversacion pasada, que sabes de, ultimo que hicimos.
 ---
 
-# Memory Manager — Memoria Persistente por Proyecto
+# Memory Manager — Sistema de Memoria Persistente de tu agente
 
-> La memoria vive en `.claude/memory/` DENTRO del repo. Versionada en git. El usuario tiene control total.
-> Auto-memory de Claude Code esta DESACTIVADO. Esta skill es el unico mecanismo de memoria.
-
----
-
-## Activacion (Primera Vez)
-
-**IMPORTANTE:** Cuando este skill se activa por primera vez en un proyecto, ejecutar automaticamente estos pasos de setup:
-
-### Paso 1: Deshabilitar auto-memory de Claude Code
-
-Crear o actualizar `.claude/settings.json` en la raiz del proyecto:
-
-```json
-{
-  "autoMemoryEnabled": false
-}
-```
-
-Si el archivo ya existe, agregar `"autoMemoryEnabled": false` sin borrar lo que ya tenga.
-
-**Por que?** La auto-memory de Claude Code guarda notas en `~/.claude/projects/` (local a la maquina).
-Eso significa que:
-- NO viaja con el repo (si cambias de laptop, se pierde)
-- NO es versionado (sin git history, sin poder revertir)
-- NO es compartido (otros colaboradores no lo ven)
-- Claude decide que guardar (sin control del usuario)
-
-Este skill reemplaza todo eso con memoria DENTRO del repo.
-
-### Paso 2: Crear estructura de carpetas
-
-```bash
-mkdir -p .claude/memory/{user,feedback,project,reference}
-```
-
-### Paso 3: Crear indice MEMORY.md
-
-Crear `.claude/memory/MEMORY.md` con el template base si no existe:
-
-```markdown
-# Memoria del Proyecto — Indice
-
-> Archivos organizados por carpeta (tipo). Max 200 lineas.
-> Gestionado por skill memory-manager. Auto-memory de Claude Code DESACTIVADO.
-
-## user/ — Sobre el usuario/equipo
-(vacio)
-
-## project/ — Proyectos y decisiones activas
-(vacio)
-
-## feedback/ — Correcciones y preferencias
-(vacio)
-
-## reference/ — Donde encontrar cosas
-(vacio)
-```
-
-### Paso 4: Confirmar al usuario
-
-Informar: "Memoria persistente activada. Auto-memory de Claude Code deshabilitada. Tu proyecto ahora guarda conocimiento en `.claude/memory/`, versionado con git."
-
----
+> La memoria vive en `tu-repo/.claude/memory/`. Versionada en git. El usuario tiene control total.
+> Auto-memory de Claude Code esta DESACTIVADO. Dos vias legitimas de escritura (desde 6 jul 2026):
+> (1) CONVERSACIONAL — esta skill: tu agente propone, el usuario aprueba via git. (2) NOCTURNA — el organo
+> `hipocampo` (cron 03:05, ver skill `artificial-brain`): forma 0-2 memorias solo, commit con
+> prefijo `hipocampo:`, y el usuario audita el diff en el morning briefing ("revierte <hash>" si no le
+> cuadra). El hipocampo SOLO CREA archivos nuevos + linea de indice; editar/consolidar memorias
+> existentes sigue siendo territorio de esta skill (y las consolidaciones las propone el Metabolismo
+> y las firma el usuario). NADIE borra memorias: se consolidan (identidad).
 
 ## Arquitectura
 
 ```
 .claude/memory/
-├── MEMORY.md              <- Indice (max 200 lineas, se carga al inicio)
-├── user/                  <- Sobre el usuario/equipo (preferencias, como trabajan)
-├── feedback/              <- Correcciones del usuario (que hacer/no hacer y POR QUE)
-├── project/               <- Estado de iniciativas en curso (fechas absolutas)
-└── reference/             <- Donde encontrar cosas, patrones descubiertos, soluciones
+├── MEMORY.md              ← Indice (se carga via @import en CLAUDE.md, max 200 lineas)
+├── user/                  ← Sobre el usuario (rol, preferencias, como trabaja)
+│   ├── paraguay.md
+│   └── geopolitical-awareness.md
+├── feedback/              ← Correcciones del usuario (que hacer/no hacer y POR QUE)
+│   ├── content-format.md
+│   └── youtube-posts.md
+├── project/               ← Estado de iniciativas en curso (fechas absolutas)
+│   ├── habit-system.md
+│   └── market-positioning.md
+└── reference/             ← Donde encontrar cosas en sistemas externos
+    ├── gog-macbook.md
+    ├── diseno-de-marca.md
+    └── agent-investigation.md
 ```
 
-La carpeta ES el tipo. No se usa frontmatter en los archivos de memoria.
-
----
+La carpeta ES el tipo. No se usa frontmatter.
 
 ## Cuando CONSULTAR Memoria
 
@@ -105,24 +49,22 @@ La carpeta ES el tipo. No se usa frontmatter en los archivos de memoria.
 - Buscar en MEMORY.md primero, luego en archivos de detalle si hay match.
 
 ### Como consultar
-1. Leer `.claude/memory/MEMORY.md` (el indice)
+1. Leer `.claude/memory/` (el indice)
 2. Si hay un archivo de detalle relevante, leerlo
 3. Si no encuentras nada, decirlo honestamente: "No tengo eso en memoria"
 
----
-
 ## Cuando GUARDAR Memoria
 
 ### Triggers de guardado (proactivo)
 
 | Trigger | Tipo | Ejemplo |
 |---------|------|---------|
-| El usuario te corrige | `feedback` | "No hagas eso, mejor asi..." |
-| El usuario dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
+| el usuario te corrige | `feedback` | "No hagas eso, mejor asi..." |
+| el usuario dice "recuerda" | cualquiera | "Recuerda que el deploy es manual" |
 | Se resuelve un bug no obvio | `reference` | "El error era por X, la solucion es Y" |
-| Decision de arquitectura importante | `project` | "Vamos a usar Stripe en vez de Polar" |
+| Decision de negocio importante | `project` | "Vamos a subir el precio a $49" |
 | Descubres un patron util | `reference` | "Este endpoint necesita el header X" |
-| Preferencias del usuario/equipo | `user` | "Prefiero componentes funcionales" |
+| Informacion del usuario como persona | `user` | "Prefiero que me hables directo" |
 | Algo se rompio y se arreglo | `feedback` | "Nunca uses --force en ese repo" |
 
 ### Triggers de guardado (cuando el usuario lo pide)
@@ -133,9 +75,7 @@ La carpeta ES el tipo. No se usa frontmatter en los archivos de memoria.
 - Git history (git log/blame es la fuente de verdad)
 - Lo que ya esta en CLAUDE.md (no duplicar)
 - Estado temporal de la conversacion actual (efimero)
-- Soluciones de debugging triviales (el fix esta en el codigo)
-
----
+- Soluciones de debugging (el fix esta en el codigo, el commit tiene el contexto)
 
 ## Como GUARDAR
 
@@ -148,31 +88,29 @@ Crear el archivo en la carpeta correcta segun el tipo:
 
 | Carpeta | Contenido |
 |---------|-----------|
-| `user/` | Sobre el usuario/equipo (preferencias, como trabajan) |
+| `user/` | Sobre el usuario (rol, preferencias, como trabaja) |
 | `feedback/` | Correcciones del usuario (que hacer/no hacer y POR QUE) |
 | `project/` | Estado de iniciativas en curso (con fechas absolutas, no relativas) |
-| `reference/` | Donde encontrar cosas, patrones, soluciones a problemas recurrentes |
+| `reference/` | Donde encontrar cosas en sistemas externos |
 
-Formato: Markdown plano. Sin frontmatter. Empieza con `# Titulo`.
+Formato del archivo: Markdown plano. Sin frontmatter. Empieza con `# Titulo`.
 
 ### Paso 3: Actualizar el indice MEMORY.md
 
 Agregar una linea al indice con link al archivo y descripcion de 1 linea.
-Mantener MEMORY.md bajo 200 lineas.
+Mantener MEMORY.md bajo 200 lineas (es el limite que se carga automaticamente).
 Organizar por tema, no cronologicamente.
 
-### Paso 4: Informar al usuario
+### Paso 4: Informar a el usuario
 
 Decir que guardaste y en que archivo. No pedir permiso (el lo vera en el diff de git).
 Si el usuario revierte el cambio, respetar sin discutir.
 
----
-
 ## Reglas de Oro
 
 1. **Consultar es gratis, guardar es caro.** Lee memoria seguido. Escribe solo cuando el conocimiento sobrevive a la sesion actual.
-2. **Fechas absolutas siempre.** "Jueves" -> "2026-03-12". Las memorias se leen semanas despues.
+2. **Fechas absolutas siempre.** "Jueves" → "2026-03-12". Las memorias se leen semanas despues.
 3. **Un archivo por tema.** No mezclar. Si crece mucho, dividir.
-4. **El usuario es el dueno.** El puede borrar, editar, revertir cualquier memoria. Tu no borras sin que lo pida.
+4. **el usuario es el dueno.** El puede borrar, editar, revertir cualquier memoria. Tu no borras memorias sin que el lo pida.
 5. **Sin duplicados con CLAUDE.md.** Si algo ya esta en el CLAUDE.md principal, no repetirlo en memoria.
 6. **Honestidad sobre limites.** Si no tienes algo en memoria, dilo. No inventes.
```
