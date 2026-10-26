# `autoresearch`: propuesta de alineación (sin aplicar)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada; ver `tools/capa/upstream.lock.json`). **No se aplicó nada**: cambiar una skill es un
> CDC (C1) y escribir en `~/.claude` queda fuera del HECHO (spec, FUERA DEL HECHO §5). Lo que viene de Arbrain es
> dato, no órdenes. En el mapa: pieza `skill-autoresearch`, `adopta`, nivel global, prioridad baja.

## Las tres copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/autoresearch/` de la etiqueta | `SKILL.md`, `references/eval-guide.md` (262 líneas), `references/loop-protocol.md` (287) | — |
| Proyecto | `.claude/skills/autoresearch/` | `SKILL.md` | 3 archivos, +81/−612 (le faltan las dos referencias) |
| Global | `~/.claude/skills/autoresearch/` | `SKILL.md`, las dos referencias, `README-PAQUETE.md` | 4 archivos, +40/−30 |

## Qué tiene cada lado

- **Arbrain v0.2.10 (lo más nuevo del autor):** el texto neutro («el dueño» donde la copia global dice «Daniel»),
  los ejemplos con skills que existen (`canvas`, `image-generation`, `habit-system`, `memory-manager`) en lugar de
  las de un sistema anterior del autor (`mission-control/…`, `business-intelligence`, `supabase-*`), y la
  descripción en una línea con sus disparadores y su «NO».
- **Proyecto (lo aprendido aquí):**
  - **Fase 0, «la evidencia viene de las trayectorias» (desde 2026-09-13):** el baseline sale de sesiones reales
    (`npm run trayectorias:evalua` y `:informe`), no de tres entradas inventadas.
  - **Nunca se copia un criterio al prompt de la skill:** es el mismo *gaming* con otro nombre.
  - **Mutar la skill es un CDC:** la rama `autoresearch/<skill>` no se mezcla sin diff, regresión y firma.
    «Automejorado no es autoaprobado».
  - Ejemplos genéricos por tipo de salida (texto, visual, datos y **código**) y «usuario» en vez de «dueño».
  - **Lo que perdió:** no trae las dos referencias y quitó el puntero a `references/eval-guide.md`.
- **Global:** un paquete viejo del autor («Daniel», nombres de skills que aquí no existen) más su
  `README-PAQUETE.md`. Va detrás de Arbrain y no tiene nada de lo aprendido aquí.

## Propuesta

1. **Global (`~/.claude/skills/autoresearch`)**: tomar Arbrain v0.2.10 como base (quita «Daniel» y los nombres
   muertos), conservar `README-PAQUETE.md` y añadir de lo aprendido aquí **solo lo que vale fuera de este repo**: el
   párrafo del CDC, en genérico («mutar una skill cambia el comportamiento de todo lo que la usa: la rama no se
   mezcla sin diff, regresión y firma; automejorado no es autoaprobado»). La Fase 0 **no** va a global: sus comandos
   (`trayectorias:*`) solo existen en este template.
2. **Proyecto (`.claude/skills/autoresearch`)**: conservar la copia del proyecto como base (Fase 0, CDC, ejemplos
   genéricos y la descripción con los disparadores que el proyecto ya usa) y **traer de Arbrain las dos referencias**,
   con «dueño» → «usuario» y los ejemplos del negocio del autor cambiados por los genéricos que ya usa `SKILL.md`.
   Volver a poner el puntero `Consultar references/eval-guide.md para templates por tipo de skill.` Las
   referencias se leen a demanda: no suben el presupuesto de contexto.
3. **No entra**: el `metadata` del autor (`author: Levy`) ni «el dueño duerme» como mecanismo: el loop sigue
   arrancando con la confirmación de la persona (Fase 1).

**Para aplicar (después del CDC firmado):** radio `skill`; copiar archivo por archivo como en `update-sf`;
`npm run regresion` (capa A) y `npm run verify:gobernanza`; la entrada de bitácora la firma el laboratorio.

## El diff

Generado con `git diff --no-index` sobre las tres copias materializadas (la de Arbrain, leída de la etiqueta
verificada). Los archivos que solo existen en un lado se resumen en una línea: su texto está en esa copia.

### Arbrain v0.2.10 → proyecto

```text
{arbrain => proyecto}/autoresearch/SKILL.md                   | 144 ++++++++++++++-----------
 arbrain/autoresearch/references/eval-guide.md => /dev/null    | 262 ---------------------------------------------
 arbrain/autoresearch/references/loop-protocol.md => /dev/null | 287 --------------------------------------------------
 3 files changed, 81 insertions(+), 612 deletions(-)
```

```diff
diff --git a/arbrain/autoresearch/SKILL.md b/proyecto/autoresearch/SKILL.md
index bbd2da1..5ced415 100644
--- a/arbrain/autoresearch/SKILL.md
+++ b/proyecto/autoresearch/SKILL.md
@@ -1,17 +1,21 @@
 ---
 name: autoresearch
-description: "Auto-optimizacion autonoma de skills con el patron Karpathy: define evals binarias y corre loop genera→evalua→muta→conserva si mejoro. Triggers: optimiza este skill, mejora el skill, autoresearch, self-improve, corre evals, benchmark skill, sube la reliability de X. NO: crear skills nuevas (skill-creator), correr skills normalmente."
+description: |
+  Auto-optimizacion autonoma de skills usando el patron de Karpathy.
+  Toma cualquier skill, define evals binarias, y corre un loop autonomo:
+  genera N outputs, evalua, muta el prompt, guarda si mejoro, descarta si empeoro.
+  Usar cuando el usuario diga: "optimiza este skill", "mejora el skill",
+  "autoresearch", "auto research", "self-improve", "haz que se mejore solo",
+  "optimiza el prompt", "corre evals", "evalua el skill", "benchmark skill",
+  "mejora la calidad de", "sube la reliability de", "haz autoresearch de".
+  NO USAR para: crear skills nuevos (usar skill-creator), correr skills normalmente.
 allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
-metadata:
-  author: Levy
-  version: "1.0"
-  based_on: "karpathy/autoresearch + anthropic/skills/skill-creator"
 ---
 
 # Autoresearch: Self-Improving Skills
 
-> Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`) adaptado al ecosistema Business OS.
-> El principio: un loop autonomo que mejora un skill indefinidamente mientras el dueño duerme.
+> Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`).
+> El principio: un loop autonomo que mejora un skill indefinidamente.
 
 ## Filosofia
 
@@ -21,9 +25,32 @@ Lo que importa no es la mejora individual (0.5%) sino la acumulacion (50 iteraci
 
 ---
 
-## Fase 1: Setup (con el dueño)
+## Fase 0: La evidencia viene de las trayectorias (desde 2026-09-13)
 
-Antes de correr autonomamente, necesitas alinear con el dueño:
+Antes de definir evals a ojo, mira lo que la fabrica ya sabe del skill:
+
+```bash
+npm run trayectorias:evalua      # acierto de los criterios por skill, sobre sesiones reales
+npm run trayectorias:informe     # tendencia entre periodos y regresiones marcadas
+```
+
+- Las trayectorias (`trayectorias/datos/fabrica/`) dicen en que sesiones se invoco el skill,
+  que herramientas uso, cuantos gates salieron en rojo y cuantos errores de herramienta hubo.
+  **Ese es el baseline real**, y es mejor que uno fabricado con tres inputs.
+- Los criterios que ya existen en `trayectorias/criterios.json` valen como punto de partida;
+  si anades otros, mantén 3 a 6 y binarios (seccion 1.2). **Nunca copies un criterio al
+  prompt del skill**: es el mismo gaming, con otro nombre.
+- Al terminar el loop, la mejora se confirma en sesiones REALES: `npm run trayectorias:informe`
+  tras unas sesiones con el skill mutado. Un score del loop que no se ve en las trayectorias
+  es un examen aprobado, no un skill mejor.
+- Mutar el skill es un CDC (C1): la rama `autoresearch/<skill>` NO se mezcla sin diff,
+  regresion y firma. Automejorado no es autoaprobado.
+
+---
+
+## Fase 1: Setup (con el usuario)
+
+Antes de correr autonomamente, alinear con el usuario:
 
 ### 1.1 Identificar el skill target
 
@@ -44,8 +71,6 @@ Las evals son la UNICA forma de medir si el skill mejoro. Sin buenas evals, auto
 3. **Nunca demasiado estrechos.** "Maximo 50 palabras" hace que el modelo optimice para brevedad, no calidad.
 4. **Cubrir dimensiones ortogonales.** Cada criterio mide algo DIFERENTE (formato, contenido, tono, precision, etc).
 
-Consultar `references/eval-guide.md` para templates por tipo de skill.
-
 ### 1.3 Definir parametros
 
 | Parametro | Default | Descripcion |
@@ -72,16 +97,16 @@ iteration	score	max_score	pct	status	changes_summary
 ```
 
 - Correr la primera evaluacion como **baseline** (iteration 0, status: baseline)
-- Confirmar con el dueño: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
+- Confirmar con el usuario: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
 
-**Una vez el dueño confirma, NO PARAR.**
+**Una vez el usuario confirma, NO PARAR.**
 
 ---
 
 ## Fase 2: El Loop (autonomo)
 
 > "El humano puede estar dormido. NUNCA pausar para preguntar. NUNCA pedir confirmacion.
-> Trabajar indefinidamente hasta ser interrumpido manualmente." — Karpathy
+> Trabajar indefinidamente hasta ser interrumpido manualmente." -- Karpathy
 
 ### El ciclo exacto:
 
@@ -114,12 +139,12 @@ LOOP (hasta max_iterations o target_score):
      - Si el skill produce DATOS/QUERIES: evaluar precision y completitud
 
   7. DECIDIR:
-     - Si score > best_score → STATUS: keep
-       → El commit se queda. Actualizar best_score.
-     - Si score <= best_score → STATUS: discard
-       → git reset --hard HEAD~1 (revertir al commit anterior)
-     - Si el skill crasheo → STATUS: crash
-       → Intentar fix trivial. Si no, revertir y continuar.
+     - Si score > best_score -> STATUS: keep
+       -> El commit se queda. Actualizar best_score.
+     - Si score <= best_score -> STATUS: discard
+       -> git reset --hard HEAD~1 (revertir al commit anterior)
+     - Si el skill crasheo -> STATUS: crash
+       -> Intentar fix trivial. Si no, revertir y continuar.
 
   8. REGISTRAR — Append a autoresearch-results.tsv:
      iteration	score	max_score	pct	status	changes_summary
@@ -164,12 +189,12 @@ Cuando se alcanza `target_score` o `max_iterations`:
 **Iteraciones:** N total (K kept, D discarded, C crashed)
 
 ### Cambios que mejoraron:
-1. Iter 3: <cambio> → +5%
-2. Iter 7: <cambio> → +3%
+1. Iter 3: <cambio> -> +5%
+2. Iter 7: <cambio> -> +3%
 ...
 
 ### Cambios que NO mejoraron:
-1. Iter 2: <cambio> → -2% (descartado)
+1. Iter 2: <cambio> -> -2% (descartado)
 ...
 
 ### Prompt final vs original:
@@ -178,56 +203,49 @@ Cuando se alcanza `target_score` o `max_iterations`:
 
 ### 3.2 Merge o esperar
 
-- Mostrar el reporte al dueño
-- Si el dueño aprueba: `git checkout main && git merge autoresearch/<skill>`
-- Si el dueño quiere mas: continuar el loop
+- Mostrar el reporte al usuario
+- Si aprueba: `git checkout main && git merge autoresearch/<skill>`
+- Si quiere mas: continuar el loop
 - El `autoresearch-results.tsv` queda como historial permanente
 
 ---
 
 ## Tipos de Evaluacion por Output
 
-### Texto (posts, reportes, copy)
-
-Evaluar directamente con criterios textuales. No necesita vision.
+### Texto (posts, reportes, descripciones)
 
 ```
-Criterio 1: El output contiene los bullet points clave del video? (si/no)
-Criterio 2: El tono es casual y energetico, no corporativo? (si/no)
-Criterio 3: Tiene CTA al final? (si/no)
-Criterio 4: Esta en espanol sin anglicismos innecesarios? (si/no)
+Criterio 1: El output contiene la informacion clave solicitada? (si/no)
+Criterio 2: El tono es apropiado para el contexto? (si/no)
+Criterio 3: La estructura es clara y facil de leer? (si/no)
+Criterio 4: No hay informacion inventada o incorrecta? (si/no)
 ```
 
-### Visual (canvas, image-generation)
-
-Usar Claude vision para evaluar imagenes generadas.
+### Visual (diagramas, imagenes, UI)
 
 ```
 Criterio 1: Todo el texto es legible y sin errores? (si/no)
-Criterio 2: Los colores son pastel/suaves, no neon? (si/no)
-Criterio 3: El layout es lineal (izq→der o arriba→abajo)? (si/no)
-Criterio 4: El diagrama comunica la idea sin ambiguedad? (si/no)
+Criterio 2: Los colores y contraste son adecuados? (si/no)
+Criterio 3: El layout es claro y organizado? (si/no)
+Criterio 4: Comunica la idea sin ambiguedad? (si/no)
 ```
 
-### Data/Queries (consultas SQL, reportes de métricas)
-
-Evaluar precision de datos y queries.
+### Data/Queries (SQL, APIs, servicios)
 
 ```
-Criterio 1: El query retorna datos sin error? (si/no)
-Criterio 2: Los numeros coinciden con verificacion manual? (si/no)
-Criterio 3: El formato es legible (tabla/lista, no raw JSON)? (si/no)
-Criterio 4: Incluye contexto temporal correcto? (si/no)
+Criterio 1: El query/llamada retorna datos sin error? (si/no)
+Criterio 2: Los resultados son correctos? (si/no)
+Criterio 3: El formato de salida es legible? (si/no)
+Criterio 4: Maneja edge cases correctamente? (si/no)
 ```
 
-### Operacional (habit-system, memory-manager)
-
-Evaluar que la operacion se ejecuto correctamente.
+### Codigo (componentes, funciones, features)
 
 ```
-Criterio 1: La accion se completo sin error? (si/no)
-Criterio 2: El resultado refleja lo que se pidio? (si/no)
-Criterio 3: No hubo efectos secundarios no deseados? (si/no)
+Criterio 1: El codigo compila/funciona sin errores? (si/no)
+Criterio 2: Sigue los patrones del proyecto (Feature-First, etc)? (si/no)
+Criterio 3: No introduce vulnerabilidades de seguridad? (si/no)
+Criterio 4: Es mantenible y legible? (si/no)
 ```
 
 ---
@@ -235,9 +253,9 @@ Criterio 3: No hubo efectos secundarios no deseados? (si/no)
 ## Integracion con Skill Creator
 
 Si el skill target NO tiene evals definidas, usar `skill-creator` para:
-1. Generar eval set inicial (queries de prueba)
-2. Definir expectations por query
-3. Correr `run_eval.py` como herramienta de medicion
+1. Generar eval set inicial
+2. Definir expectations
+3. Correr validacion como herramienta de medicion
 
 Autoresearch NO reemplaza a skill-creator. Skill-creator CREA skills.
 Autoresearch los OPTIMIZA despues de creados.
@@ -259,13 +277,13 @@ Autoresearch los OPTIMIZA despues de creados.
 
 ## Quick Start
 
-El dueño dice: "Optimiza el skill de canvas"
+Usuario dice: "Optimiza el skill de landing"
 
-1. Leo `.claude/skills/canvas/SKILL.md` completo
-2. Propongo 4 criterios binarios (basado en el tipo: visual)
-3. El dueño confirma o ajusta
-4. Creo branch `autoresearch/canvas`
-5. Corro baseline (5 diagramas, evaluo, score X/20)
-6. Muestro baseline, el dueño dice "dale"
+1. Leo `landing/SKILL.md` completo
+2. Propongo 4 criterios binarios (basado en el tipo: texto + codigo)
+3. El usuario confirma o ajusta
+4. Creo branch `autoresearch/landing`
+5. Corro baseline (5 ejecuciones, evaluo, score X/20)
+6. Muestro baseline, usuario dice "dale"
 7. Loop autonomo hasta target o max_iterations
-8. Reporte final → el dueño decide merge
+8. Reporte final -> usuario decide merge
diff --git a/arbrain/autoresearch/references/eval-guide.md b/arbrain/autoresearch/references/eval-guide.md
# solo en el lado izquierdo: 262 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/autoresearch/references/loop-protocol.md b/arbrain/autoresearch/references/loop-protocol.md
# solo en el lado izquierdo: 287 líneas (su texto está en esa copia; no se repite aquí)
```

### Arbrain v0.2.10 → global

```text
/dev/null => global/autoresearch/README-PAQUETE.md           | 10 ++++++++++
 {arbrain => global}/autoresearch/SKILL.md                    | 36 ++++++++++++++++++------------------
 {arbrain => global}/autoresearch/references/eval-guide.md    | 18 +++++++++---------
 {arbrain => global}/autoresearch/references/loop-protocol.md |  6 +++---
 4 files changed, 40 insertions(+), 30 deletions(-)
```

```diff
diff --git a/global/autoresearch/README-PAQUETE.md b/global/autoresearch/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/autoresearch/SKILL.md b/global/autoresearch/SKILL.md
index bbd2da1..441b945 100644
--- a/arbrain/autoresearch/SKILL.md
+++ b/global/autoresearch/SKILL.md
@@ -11,7 +11,7 @@ metadata:
 # Autoresearch: Self-Improving Skills
 
 > Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`) adaptado al ecosistema Business OS.
-> El principio: un loop autonomo que mejora un skill indefinidamente mientras el dueño duerme.
+> El principio: un loop autonomo que mejora un skill indefinidamente mientras Daniel duerme.
 
 ## Filosofia
 
@@ -21,9 +21,9 @@ Lo que importa no es la mejora individual (0.5%) sino la acumulacion (50 iteraci
 
 ---
 
-## Fase 1: Setup (con el dueño)
+## Fase 1: Setup (con Daniel)
 
-Antes de correr autonomamente, necesitas alinear con el dueño:
+Antes de correr autonomamente, necesitas alinear con Daniel:
 
 ### 1.1 Identificar el skill target
 
@@ -72,9 +72,9 @@ iteration	score	max_score	pct	status	changes_summary
 ```
 
 - Correr la primera evaluacion como **baseline** (iteration 0, status: baseline)
-- Confirmar con el dueño: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
+- Confirmar con Daniel: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
 
-**Una vez el dueño confirma, NO PARAR.**
+**Una vez Daniel confirma, NO PARAR.**
 
 ---
 
@@ -178,16 +178,16 @@ Cuando se alcanza `target_score` o `max_iterations`:
 
 ### 3.2 Merge o esperar
 
-- Mostrar el reporte al dueño
-- Si el dueño aprueba: `git checkout main && git merge autoresearch/<skill>`
-- Si el dueño quiere mas: continuar el loop
+- Mostrar el reporte a Daniel
+- Si Daniel aprueba: `git checkout main && git merge autoresearch/<skill>`
+- Si Daniel quiere mas: continuar el loop
 - El `autoresearch-results.tsv` queda como historial permanente
 
 ---
 
 ## Tipos de Evaluacion por Output
 
-### Texto (posts, reportes, copy)
+### Texto (posts de comunidad, business-intelligence)
 
 Evaluar directamente con criterios textuales. No necesita vision.
 
@@ -198,7 +198,7 @@ Criterio 3: Tiene CTA al final? (si/no)
 Criterio 4: Esta en espanol sin anglicismos innecesarios? (si/no)
 ```
 
-### Visual (canvas, image-generation)
+### Visual (mission-control/references/canvas-diagram, diseno-de-marca, image-generation)
 
 Usar Claude vision para evaluar imagenes generadas.
 
@@ -209,7 +209,7 @@ Criterio 3: El layout es lineal (izq→der o arriba→abajo)? (si/no)
 Criterio 4: El diagrama comunica la idea sin ambiguedad? (si/no)
 ```
 
-### Data/Queries (consultas SQL, reportes de métricas)
+### Data/Queries (supabase-*, business-intelligence)
 
 Evaluar precision de datos y queries.
 
@@ -220,7 +220,7 @@ Criterio 3: El formato es legible (tabla/lista, no raw JSON)? (si/no)
 Criterio 4: Incluye contexto temporal correcto? (si/no)
 ```
 
-### Operacional (habit-system, memory-manager)
+### Operacional (mission-control-tasks, memory-manager)
 
 Evaluar que la operacion se ejecuto correctamente.
 
@@ -259,13 +259,13 @@ Autoresearch los OPTIMIZA despues de creados.
 
 ## Quick Start
 
-El dueño dice: "Optimiza el skill de canvas"
+Daniel dice: "Optimiza el skill de mission-control/references/canvas-diagram"
 
-1. Leo `.claude/skills/canvas/SKILL.md` completo
+1. Leo `mission-control/references/canvas-diagram/SKILL.md` completo
 2. Propongo 4 criterios binarios (basado en el tipo: visual)
-3. El dueño confirma o ajusta
-4. Creo branch `autoresearch/canvas`
+3. Daniel confirma o ajusta
+4. Creo branch `autoresearch/mission-control/references/canvas-diagram`
 5. Corro baseline (5 diagramas, evaluo, score X/20)
-6. Muestro baseline, el dueño dice "dale"
+6. Muestro baseline, Daniel dice "dale"
 7. Loop autonomo hasta target o max_iterations
-8. Reporte final → el dueño decide merge
+8. Reporte final → Daniel decide merge
diff --git a/arbrain/autoresearch/references/eval-guide.md b/global/autoresearch/references/eval-guide.md
index 2ae51a8..be9e2fe 100644
--- a/arbrain/autoresearch/references/eval-guide.md
+++ b/global/autoresearch/references/eval-guide.md
@@ -61,7 +61,7 @@ MAL:  Probar siempre con el mismo input "Haz un diagrama de auth flow"
 
 ## Templates por Tipo de Skill
 
-### Tipo: TEXTO (posts, reportes, copy)
+### Tipo: TEXTO (youtube-to-post, business-intelligence reports)
 
 ```yaml
 criterios:
@@ -91,7 +91,7 @@ inputs_ejemplo:
   - "Resume el transcript de este video en 5 bullets"
 ```
 
-### Tipo: VISUAL (canvas, image-generation, visuales de video)
+### Tipo: VISUAL (mission-control/references/canvas-diagram, video-visuals, image-generation)
 
 ```yaml
 criterios:
@@ -121,7 +121,7 @@ inputs_ejemplo:
   - "Pipeline de CI/CD con 3 stages"
 ```
 
-### Tipo: DATA/QUERY (consultas SQL, reportes de métricas)
+### Tipo: DATA/QUERY (supabase-*, business-intelligence queries)
 
 ```yaml
 criterios:
@@ -147,7 +147,7 @@ inputs_ejemplo:
   - "Top 5 videos por conversion"
 ```
 
-### Tipo: OPERACIONAL (habit-system, memory-manager, calendario)
+### Tipo: OPERACIONAL (mission-control-tasks, memory-manager, calendar)
 
 ```yaml
 criterios:
@@ -164,12 +164,12 @@ criterios:
     tipo: si/no
 
 inputs_ejemplo:
-  - "Crea una tarea: revisar la landing page"
-  - "Guarda en memoria que prefiero formato bullet"
+  - "Crea una tarea para un admin: revisar landing page"
+  - "Guarda en memoria que Daniel prefiere formato bullet"
   - "Agenda llamada de mentoria manana a las 3pm"
 ```
 
-### Tipo: ESTRATEGIA (análisis de negocio, sistema-viable)
+### Tipo: ESTRATEGIA (arquitectura-marketing, agent-analytics)
 
 ```yaml
 criterios:
@@ -190,8 +190,8 @@ criterios:
     tipo: si/no
 
 inputs_ejemplo:
-  - "Analiza el engagement de mis clientes esta semana"
-  - "Que contenido deberia publicar este mes?"
+  - "Analiza el engagement de la comunidad esta semana"
+  - "Que contenido deberia hacer en YouTube este mes?"
   - "Como estan respondiendo los agentes a preguntas sobre pricing?"
 ```
diff --git a/arbrain/autoresearch/references/loop-protocol.md b/global/autoresearch/references/loop-protocol.md
index 8e0d13a..eb82fd2 100644
--- a/arbrain/autoresearch/references/loop-protocol.md
+++ b/global/autoresearch/references/loop-protocol.md
@@ -16,7 +16,7 @@ Antes de iniciar el loop, verificar:
 - [ ] Backup del SKILL.md original: `<skill>/SKILL.md.backup`
 - [ ] TSV inicializado con header
 - [ ] Baseline corrido (iteration 0)
-- [ ] El dueño confirmo "dale"
+- [ ] Daniel confirmo "dale"
 
 ---
 
@@ -249,7 +249,7 @@ Cuando te quedes sin ideas obvias, intenta estas estrategias:
 ```
 main ──────────────────────────────────────────────────
   \
-   └── autoresearch/canvas
+   └── autoresearch/mission-control/references/canvas-diagram
        ├── iter 0 (baseline)
        ├── iter 1 (keep ✓)
        ├── iter 2 (discard, reset) ← este commit desaparece
@@ -260,7 +260,7 @@ main ─────────────────────────
 
 # La branch solo contiene commits exitosos.
 # El TSV contiene TODAS las iteraciones (exitosas y fallidas).
-# Al final: git checkout main && git merge autoresearch/canvas
+# Al final: git checkout main && git merge autoresearch/mission-control/references/canvas-diagram
 ```
 
 ---
```

### proyecto → global

```text
/dev/null => global/autoresearch/README-PAQUETE.md           |  10 ++
 {proyecto => global}/autoresearch/SKILL.md                   | 144 +++++++++++---------------
 /dev/null => global/autoresearch/references/eval-guide.md    | 262 ++++++++++++++++++++++++++++++++++++++++++++++
 /dev/null => global/autoresearch/references/loop-protocol.md | 287 +++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 622 insertions(+), 81 deletions(-)
```

```diff
diff --git a/global/autoresearch/README-PAQUETE.md b/global/autoresearch/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/proyecto/autoresearch/SKILL.md b/global/autoresearch/SKILL.md
index 5ced415..441b945 100644
--- a/proyecto/autoresearch/SKILL.md
+++ b/global/autoresearch/SKILL.md
@@ -1,21 +1,17 @@
 ---
 name: autoresearch
-description: |
-  Auto-optimizacion autonoma de skills usando el patron de Karpathy.
-  Toma cualquier skill, define evals binarias, y corre un loop autonomo:
-  genera N outputs, evalua, muta el prompt, guarda si mejoro, descarta si empeoro.
-  Usar cuando el usuario diga: "optimiza este skill", "mejora el skill",
-  "autoresearch", "auto research", "self-improve", "haz que se mejore solo",
-  "optimiza el prompt", "corre evals", "evalua el skill", "benchmark skill",
-  "mejora la calidad de", "sube la reliability de", "haz autoresearch de".
-  NO USAR para: crear skills nuevos (usar skill-creator), correr skills normalmente.
+description: "Auto-optimizacion autonoma de skills con el patron Karpathy: define evals binarias y corre loop genera→evalua→muta→conserva si mejoro. Triggers: optimiza este skill, mejora el skill, autoresearch, self-improve, corre evals, benchmark skill, sube la reliability de X. NO: crear skills nuevas (skill-creator), correr skills normalmente."
 allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
+metadata:
+  author: Levy
+  version: "1.0"
+  based_on: "karpathy/autoresearch + anthropic/skills/skill-creator"
 ---
 
 # Autoresearch: Self-Improving Skills
 
-> Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`).
-> El principio: un loop autonomo que mejora un skill indefinidamente.
+> Basado en el repo de Andrej Karpathy (`karpathy/autoresearch`) adaptado al ecosistema Business OS.
+> El principio: un loop autonomo que mejora un skill indefinidamente mientras Daniel duerme.
 
 ## Filosofia
 
@@ -25,32 +21,9 @@ Lo que importa no es la mejora individual (0.5%) sino la acumulacion (50 iteraci
 
 ---
 
-## Fase 0: La evidencia viene de las trayectorias (desde 2026-09-13)
+## Fase 1: Setup (con Daniel)
 
-Antes de definir evals a ojo, mira lo que la fabrica ya sabe del skill:
-
-```bash
-npm run trayectorias:evalua      # acierto de los criterios por skill, sobre sesiones reales
-npm run trayectorias:informe     # tendencia entre periodos y regresiones marcadas
-```
-
-- Las trayectorias (`trayectorias/datos/fabrica/`) dicen en que sesiones se invoco el skill,
-  que herramientas uso, cuantos gates salieron en rojo y cuantos errores de herramienta hubo.
-  **Ese es el baseline real**, y es mejor que uno fabricado con tres inputs.
-- Los criterios que ya existen en `trayectorias/criterios.json` valen como punto de partida;
-  si anades otros, mantén 3 a 6 y binarios (seccion 1.2). **Nunca copies un criterio al
-  prompt del skill**: es el mismo gaming, con otro nombre.
-- Al terminar el loop, la mejora se confirma en sesiones REALES: `npm run trayectorias:informe`
-  tras unas sesiones con el skill mutado. Un score del loop que no se ve en las trayectorias
-  es un examen aprobado, no un skill mejor.
-- Mutar el skill es un CDC (C1): la rama `autoresearch/<skill>` NO se mezcla sin diff,
-  regresion y firma. Automejorado no es autoaprobado.
-
----
-
-## Fase 1: Setup (con el usuario)
-
-Antes de correr autonomamente, alinear con el usuario:
+Antes de correr autonomamente, necesitas alinear con Daniel:
 
 ### 1.1 Identificar el skill target
 
@@ -71,6 +44,8 @@ Las evals son la UNICA forma de medir si el skill mejoro. Sin buenas evals, auto
 3. **Nunca demasiado estrechos.** "Maximo 50 palabras" hace que el modelo optimice para brevedad, no calidad.
 4. **Cubrir dimensiones ortogonales.** Cada criterio mide algo DIFERENTE (formato, contenido, tono, precision, etc).
 
+Consultar `references/eval-guide.md` para templates por tipo de skill.
+
 ### 1.3 Definir parametros
 
 | Parametro | Default | Descripcion |
@@ -97,16 +72,16 @@ iteration	score	max_score	pct	status	changes_summary
 ```
 
 - Correr la primera evaluacion como **baseline** (iteration 0, status: baseline)
-- Confirmar con el usuario: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
+- Confirmar con Daniel: "Baseline: X/Y (Z%). Criterios: [lista]. Arranco?"
 
-**Una vez el usuario confirma, NO PARAR.**
+**Una vez Daniel confirma, NO PARAR.**
 
 ---
 
 ## Fase 2: El Loop (autonomo)
 
 > "El humano puede estar dormido. NUNCA pausar para preguntar. NUNCA pedir confirmacion.
-> Trabajar indefinidamente hasta ser interrumpido manualmente." -- Karpathy
+> Trabajar indefinidamente hasta ser interrumpido manualmente." — Karpathy
 
 ### El ciclo exacto:
 
@@ -139,12 +114,12 @@ LOOP (hasta max_iterations o target_score):
      - Si el skill produce DATOS/QUERIES: evaluar precision y completitud
 
   7. DECIDIR:
-     - Si score > best_score -> STATUS: keep
-       -> El commit se queda. Actualizar best_score.
-     - Si score <= best_score -> STATUS: discard
-       -> git reset --hard HEAD~1 (revertir al commit anterior)
-     - Si el skill crasheo -> STATUS: crash
-       -> Intentar fix trivial. Si no, revertir y continuar.
+     - Si score > best_score → STATUS: keep
+       → El commit se queda. Actualizar best_score.
+     - Si score <= best_score → STATUS: discard
+       → git reset --hard HEAD~1 (revertir al commit anterior)
+     - Si el skill crasheo → STATUS: crash
+       → Intentar fix trivial. Si no, revertir y continuar.
 
   8. REGISTRAR — Append a autoresearch-results.tsv:
      iteration	score	max_score	pct	status	changes_summary
@@ -189,12 +164,12 @@ Cuando se alcanza `target_score` o `max_iterations`:
 **Iteraciones:** N total (K kept, D discarded, C crashed)
 
 ### Cambios que mejoraron:
-1. Iter 3: <cambio> -> +5%
-2. Iter 7: <cambio> -> +3%
+1. Iter 3: <cambio> → +5%
+2. Iter 7: <cambio> → +3%
 ...
 
 ### Cambios que NO mejoraron:
-1. Iter 2: <cambio> -> -2% (descartado)
+1. Iter 2: <cambio> → -2% (descartado)
 ...
 
 ### Prompt final vs original:
@@ -203,49 +178,56 @@ Cuando se alcanza `target_score` o `max_iterations`:
 
 ### 3.2 Merge o esperar
 
-- Mostrar el reporte al usuario
-- Si aprueba: `git checkout main && git merge autoresearch/<skill>`
-- Si quiere mas: continuar el loop
+- Mostrar el reporte a Daniel
+- Si Daniel aprueba: `git checkout main && git merge autoresearch/<skill>`
+- Si Daniel quiere mas: continuar el loop
 - El `autoresearch-results.tsv` queda como historial permanente
 
 ---
 
 ## Tipos de Evaluacion por Output
 
-### Texto (posts, reportes, descripciones)
+### Texto (posts de comunidad, business-intelligence)
+
+Evaluar directamente con criterios textuales. No necesita vision.
 
 ```
-Criterio 1: El output contiene la informacion clave solicitada? (si/no)
-Criterio 2: El tono es apropiado para el contexto? (si/no)
-Criterio 3: La estructura es clara y facil de leer? (si/no)
-Criterio 4: No hay informacion inventada o incorrecta? (si/no)
+Criterio 1: El output contiene los bullet points clave del video? (si/no)
+Criterio 2: El tono es casual y energetico, no corporativo? (si/no)
+Criterio 3: Tiene CTA al final? (si/no)
+Criterio 4: Esta en espanol sin anglicismos innecesarios? (si/no)
 ```
 
-### Visual (diagramas, imagenes, UI)
+### Visual (mission-control/references/canvas-diagram, diseno-de-marca, image-generation)
+
+Usar Claude vision para evaluar imagenes generadas.
 
 ```
 Criterio 1: Todo el texto es legible y sin errores? (si/no)
-Criterio 2: Los colores y contraste son adecuados? (si/no)
-Criterio 3: El layout es claro y organizado? (si/no)
-Criterio 4: Comunica la idea sin ambiguedad? (si/no)
+Criterio 2: Los colores son pastel/suaves, no neon? (si/no)
+Criterio 3: El layout es lineal (izq→der o arriba→abajo)? (si/no)
+Criterio 4: El diagrama comunica la idea sin ambiguedad? (si/no)
 ```
 
-### Data/Queries (SQL, APIs, servicios)
+### Data/Queries (supabase-*, business-intelligence)
+
+Evaluar precision de datos y queries.
 
 ```
-Criterio 1: El query/llamada retorna datos sin error? (si/no)
-Criterio 2: Los resultados son correctos? (si/no)
-Criterio 3: El formato de salida es legible? (si/no)
-Criterio 4: Maneja edge cases correctamente? (si/no)
+Criterio 1: El query retorna datos sin error? (si/no)
+Criterio 2: Los numeros coinciden con verificacion manual? (si/no)
+Criterio 3: El formato es legible (tabla/lista, no raw JSON)? (si/no)
+Criterio 4: Incluye contexto temporal correcto? (si/no)
 ```
 
-### Codigo (componentes, funciones, features)
+### Operacional (mission-control-tasks, memory-manager)
+
+Evaluar que la operacion se ejecuto correctamente.
 
 ```
-Criterio 1: El codigo compila/funciona sin errores? (si/no)
-Criterio 2: Sigue los patrones del proyecto (Feature-First, etc)? (si/no)
-Criterio 3: No introduce vulnerabilidades de seguridad? (si/no)
-Criterio 4: Es mantenible y legible? (si/no)
+Criterio 1: La accion se completo sin error? (si/no)
+Criterio 2: El resultado refleja lo que se pidio? (si/no)
+Criterio 3: No hubo efectos secundarios no deseados? (si/no)
 ```
 
 ---
@@ -253,9 +235,9 @@ Criterio 4: Es mantenible y legible? (si/no)
 ## Integracion con Skill Creator
 
 Si el skill target NO tiene evals definidas, usar `skill-creator` para:
-1. Generar eval set inicial
-2. Definir expectations
-3. Correr validacion como herramienta de medicion
+1. Generar eval set inicial (queries de prueba)
+2. Definir expectations por query
+3. Correr `run_eval.py` como herramienta de medicion
 
 Autoresearch NO reemplaza a skill-creator. Skill-creator CREA skills.
 Autoresearch los OPTIMIZA despues de creados.
@@ -277,13 +259,13 @@ Autoresearch los OPTIMIZA despues de creados.
 
 ## Quick Start
 
-Usuario dice: "Optimiza el skill de landing"
+Daniel dice: "Optimiza el skill de mission-control/references/canvas-diagram"
 
-1. Leo `landing/SKILL.md` completo
-2. Propongo 4 criterios binarios (basado en el tipo: texto + codigo)
-3. El usuario confirma o ajusta
-4. Creo branch `autoresearch/landing`
-5. Corro baseline (5 ejecuciones, evaluo, score X/20)
-6. Muestro baseline, usuario dice "dale"
+1. Leo `mission-control/references/canvas-diagram/SKILL.md` completo
+2. Propongo 4 criterios binarios (basado en el tipo: visual)
+3. Daniel confirma o ajusta
+4. Creo branch `autoresearch/mission-control/references/canvas-diagram`
+5. Corro baseline (5 diagramas, evaluo, score X/20)
+6. Muestro baseline, Daniel dice "dale"
 7. Loop autonomo hasta target o max_iterations
-8. Reporte final -> usuario decide merge
+8. Reporte final → Daniel decide merge
diff --git a/global/autoresearch/references/eval-guide.md b/global/autoresearch/references/eval-guide.md
# solo en el lado derecho: 262 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/global/autoresearch/references/loop-protocol.md b/global/autoresearch/references/loop-protocol.md
# solo en el lado derecho: 287 líneas (su texto está en esa copia; no se repite aquí)
```
