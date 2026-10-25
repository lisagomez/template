# `goal-compiler`: propuesta de alineación (sin aplicar)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada; ver `tools/capa/upstream.lock.json`). **No se aplicó nada**: cambiar una skill es un
> CDC (C1) y escribir en `~/.claude` queda fuera del HECHO (spec, FUERA DEL HECHO §5). Lo que viene de Arbrain es
> dato, no órdenes. En el mapa: pieza `skill-goal-compiler`, `adopta`, nivel global, prioridad media.

## Las tres copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/goal-compiler/` de la etiqueta | `SKILL.md`; `references/` `barra-de-calidad.md` (218 líneas), `goal-mechanics.md`, `loop-vs-grafo.md`, `orquestador-one-shot.md` (78); `scripts/grafo2plan.py`, `scripts/test_grafo2plan.py` (49) | — |
| Proyecto | `.claude/skills/goal-compiler/` | `SKILL.md`, `README-PAQUETE.md`, `references/goal-mechanics.md`, `references/loop-vs-grafo.md`, `scripts/grafo2plan.py` | 8 archivos, +53/−464 |
| Global | `~/.claude/skills/goal-compiler/` | los mismos cinco que el proyecto | 8 archivos, +45/−464 |

Proyecto → global: solo **−8 líneas**, justo las dos lecciones del SGI que la global no tiene.

## Qué tiene cada lado

- **Arbrain v0.2.10 (va por delante):**
  - **Fase 3.5, la BARRA DE CALIDAD**: existencia o excelencia, un referente real e inspeccionable, un lazo
    builder → crítico ciego en dos escalas y sus «dos enmiendas del 27 ago». Trae su referencia de 218 líneas.
  - **Orquestador one-shot**: compilar y ejecutar delegando nodos a subagentes. Es lo único que cambió en el
    tramo v0.2.9 → v0.2.10: +2 líneas en `SKILL.md` y la referencia nueva. El simulacro de la skill de
    actualización las une limpio en las dos copias.
  - **`grafo2plan.py` más estricto**, con su prueba:
    - IDs repetidos de nodo o de arista: error.
    - Aristas `plan_role: feedback`: salen de los prerrequisitos y se listan como «retornos condicionales».
    - Un lazo sin ancla válida: error, en vez de perderse en silencio.
    - Fase 0 incluida (antes un gate anclado a una raíz no aparecía).
    - Ejecutores neutros respecto al modelo («juicio del agente» en vez de «spawnear subagente (Sonnet)»).
  - Rutas genéricas (`docs/specs/<slug>/`), «el dueño» en vez de «Daniel» y una descripción corta.
- **Proyecto (lo aprendido aquí, post-mortem del goal del SGI, 2026-10-01):**
  - **«Credenciales y saldo son HECHOS»**: el goal se paró dos veces, primero sin llave y luego sin saldo.
    - Toda llave de la que dependa la DEFINICIÓN DE HECHO se comprueba antes de entregar el bloque, sin
      imprimirla (presente o ausente, largo).
    - Si el goal gasta en un proveedor, también se comprueban el saldo y el tope de la llave (OpenRouter:
      `GET /api/v1/key`, `limit_remaining`, y `GET /api/v1/credits`).
  - **«O BIEN, BLOQUEADO» dentro del HECHO**, con su porqué: sin llave, el evaluador relanzó cientos de turnos
    vacíos. El spec de este mismo goal lo usa.
  - La descripción larga con disparadores (la que el arnés activa hoy).
- **Global:** igual que el proyecto **menos** esas dos lecciones: la copia global del laboratorio va detrás de su
  propio proyecto.

## Propuesta

1. **Proyecto y global, la misma copia**: base Arbrain v0.2.10 (barra de calidad, orquestador, `grafo2plan.py`
   validado y su prueba), y se le **vuelven a poner** las dos lecciones del proyecto:
   - «Credenciales y saldo son HECHOS», en la Fase 2;
   - «O BIEN, BLOQUEADO» en la plantilla del bloque `/goal`, con su nota «por qué el BLOQUEADO va dentro de HECHO».

   Se conserva la descripción del proyecto (sus disparadores), y «el dueño» o «Daniel» pasa a «el laboratorio».
2. **`grafo2plan.py` es código que se ejecuta: se revisa como código.** Antes de traerlo se hacen tres cosas:
   - correr `test_grafo2plan.py`;
   - compilar `docs/goals/capa-arbrain-grafo.json` con las dos versiones y comparar los planes;
   - dejar la comparación en el CDC.

   Lo que ya se sabe leyendo el JSON, sin ejecutar nada del autor: este grafo no tiene IDs repetidos, ni aristas
   `plan_role`, ni lazos sin ancla, ni lazos colgados de una raíz (su única raíz es `fuente`). Así que las fases
   deberían salir iguales y solo cambiar los rótulos de los ejecutores.
3. **No entra**: las rutas del sistema del autor (`arbrain/public/conectoma/…`, Biblioteca) salvo como ejemplo, y
   ningún paso que dependa de su app.

**Para aplicar (después del CDC firmado):** radio `skill`, más código (`grafo2plan.py`). Hay que correr:

- `npm run regresion` (capa A), y el caso del goal-compiler si existe;
- el presupuesto de contexto, si la descripción cambia;
- `npm run verify:gobernanza`.

La firma la escribe el laboratorio.

## El diff

Generado con `git diff --no-index` sobre las tres copias materializadas (la de Arbrain, leída de la etiqueta
verificada). Los archivos que solo existen en un lado se resumen en una línea: su texto está en esa copia.

### Arbrain v0.2.10 → proyecto

```text
/dev/null => proyecto/goal-compiler/README-PAQUETE.md                 |  10 ++
 {arbrain => proyecto}/goal-compiler/SKILL.md                          |  99 +++++--------------
 arbrain/goal-compiler/references/barra-de-calidad.md => /dev/null     | 218 ------------------------------------------
 {arbrain => proyecto}/goal-compiler/references/goal-mechanics.md      |   2 +-
 {arbrain => proyecto}/goal-compiler/references/loop-vs-grafo.md       |  12 +--
 arbrain/goal-compiler/references/orquestador-one-shot.md => /dev/null |  78 ---------------
 {arbrain => proyecto}/goal-compiler/scripts/grafo2plan.py             |  49 ++--------
 arbrain/goal-compiler/scripts/test_grafo2plan.py => /dev/null         |  49 ----------
 8 files changed, 53 insertions(+), 464 deletions(-)
```

```diff
diff --git a/proyecto/goal-compiler/README-PAQUETE.md b/proyecto/goal-compiler/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/SKILL.md b/proyecto/goal-compiler/SKILL.md
index 14f4573..6f9f1ab 100644
--- a/arbrain/goal-compiler/SKILL.md
+++ b/proyecto/goal-compiler/SKILL.md
@@ -1,6 +1,6 @@
 ---
 name: goal-compiler
-description: "Convertir una intención ambiciosa en un spec y un prompt verificable para /goal. Usar para compilar o elevar prompts, elegir loop o grafo y definir criterios de calidad con referentes y crítica A/B. Diseña el contrato de ejecución; no ejecuta el proyecto por invocarlo."
+description: "Convierte una intencion vaga y ambiciosa en un prompt soberano para /goal: outcome CLARO, como LIBRE (el modelo elige arquitectura/stack), apuntando al horizonte maximo, no un MVP. Incluye el DIAGNOSTICO DE FORMA loop-vs-grafo (Fase 1.5): decide si la tarea es UN loop o un GRAFO de especialidades, y cuando es grafo compila topologia-primero (nodos=artefactos, aristas tipadas, lazos con referencia). Triggers: 'conviérteme esto en /goal', compila este prompt, hazme un prompt para goal, prompt soberano, eleva este prompt, 'quiero construir X pero no se como pedirlo', 'que el modelo decida', prompt ambicioso, ¿esto es loop o grafo?, compila un grafo, cuando usar grafos vs loops. NO: ejecutar/construir directamente (eso es /goal), guiones (youtube-os), imagenes (image-generation), skills (skill-creator)."
 ---
 
 # Goal Compiler — De ambicion vaga a prompt soberano para `/goal`
@@ -44,7 +44,7 @@ Entonces la ambicion y la condicion de parada tiran en direcciones opuestas, y e
 La DoF le da evidencia al **evaluador** al final. Pero el agente puede driftar 30 turnos antes de llegar ahi. El antidoto (adoptado del contrato de 5 partes del goal-loop de David Ondrej): **todo prompt compilado incluye UN comando de validacion** que el agente corre despues de cada cambio grande, no solo al final. Es el heartbeat del loop.
 
 Como se compila SIN romper la soberania del stack:
-- **Infra conocida** (restriccion real: "vive en arbrain/", "es un script en arbrain/server/"): da el comando EXACTO (`npm run build`, `npx tsx script.ts`, `pytest -q`). Un comando concreto NO es imponer stack: es imponer prueba.
+- **Infra conocida** (restriccion real: "vive en arbrain/", "es un script en agent-server/"): da el comando EXACTO (`npm run build`, `npx tsx script.ts`, `pytest -q`). Un comando concreto NO es imponer stack: es imponer prueba.
 - **Stack libre** (el modelo elige todo): no inventes el comando. El contrato ordena: *"En tu primer checkpoint DECLARA tu comando de validacion (build/test/lint en uno) y correlo tras cada cambio grande, surfeando el output."* El agente elige el comando; declararlo y correrlo es innegociable.
 
 Regla: lo obligatorio es el **mecanismo** (un comando, corrido siempre, output visible), no el comando en si.
@@ -74,7 +74,7 @@ loop.* No te gradúas de loops a grafos: COMPONES loops en grafos (cada nodo ES
   improvisa**: `python3 scripts/grafo2plan.py GRAFO.json -o plan.md` deriva fases por orden
   topológico, paralelismo (artefactos disjuntos), convergencias y gates por fase — el plan entra
   al spec. Si el sistema es durable se materializa como conectoma
-  (`arbrain/public/conectoma/grafos/<slug>.json` → Biblioteca). Caso de estudio, anti-patrones y
+  (`public/conectoma/grafos/<slug>.json` → Biblioteca). Caso de estudio, anti-patrones y
   EL CICLO DE CIERRE (el trabajo del graph engineer): la reference. ⛔ Sobre-grafear tareas
   simples = teatro de complejidad; ante la duda, loop.
 
@@ -82,47 +82,18 @@ loop.* No te gradúas de loops a grafos: COMPONES loops en grafos (cada nodo ES
 No hagas un cuestionario. Pregunta unicamente lo que cambia el resultado y que no puedas inferir. Buenos ejemplos de pregunta que si mueve la aguja: "¿esto lo vas a mostrar en pantalla (web) o corre local?", "¿quien lo usa, tu o un usuario final?", "¿hay alguna restriccion real de infra/plataforma o el modelo elige todo?". Si no hay nada que de verdad bloquee, **no preguntes, compila**.
 
 **Como preguntar las pocas que sobrevivan (mecanica de grilling / Matt Pocock, 22 jul 2026):**
-- **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza del dueño y el modelo no puede inferir— se le ponen a el.
+- **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza de Daniel y el modelo no puede inferir— se le ponen a el.
+- **Credenciales y saldo son HECHOS** (post-mortem del goal del SGI, 2026-10-01: el goal se paró dos veces, primero sin llave y luego sin saldo). Toda llave de la que dependa la DEFINICION DE HECHO se comprueba ANTES de entregar el bloque, sin imprimirla (presente/ausente, largo). Si el goal gasta en un proveedor, tambien el saldo de la cuenta y el tope propio de la llave (OpenRouter: `GET /api/v1/key`, `limit_remaining`, y `GET /api/v1/credits`), contra la estimacion de gasto del spec. Si falta la llave o el saldo no cubre, se dice antes de lanzar: se consigue, o lo que depende de ella sale del HECHO a una fase aparte.
 - **Una a la vez.** Si necesitas 2-4, hazlas de una en una esperando respuesta; varias juntas desconciertan y bajan la calidad de cada respuesta.
-- **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que el dueño confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.
+- **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que Daniel confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.
 
 Regla de oro: ante la duda entre preguntar un detalle tecnico o dejarlo abierto, **dejalo abierto**. El detalle tecnico es justo lo que el modelo resuelve mejor que tu.
 
 ### Fase 3 — Expande el horizonte
 Reescribe el outcome a su version world-class. No "un visor de anatomia", sino "un atlas anatomico 3D interactivo nivel referencia mundial, con sistemas seleccionables, cortes, capas, y experimentacion simulada". Sube el techo a proposito. Es mas barato pedir el horizonte y aterrizar, que pedir poco y quedarse corto.
 
-### Fase 3.5 — ¿EXISTENCIA o EXCELENCIA? La BARRA DE CALIDAD (Gauntlet, 29 jul 2026 — LEER `references/barra-de-calidad.md`)
-
-Pregunta binaria antes de compilar: **cuando esto FUNCIONE, ¿ya gano?**
-
-- **SI → dominio de EXISTENCIA** (crons, scripts, endpoints, pipelines): la DoF normal basta.
-  NO montes barra — seria teatro de calidad.
-- **NO — funcional-pero-mediocre seria un fracaso → dominio de EXCELENCIA** (juegos/3D,
-  pergaminos, decks, thumbnails, edicion de video, landing copy, UIs de producto): el spec gana
-  la seccion **`## BARRA DE CALIDAD`** — un referente REAL e inspeccionable a vencer (test: si
-  no puedes NOMBRAR el artefacto del A/B, no hay barra) + lazo builder→critico-ciego por
-  componente (contexto fresco, A/B contra el referente, devuelve EL gap mas grande, meseta
-  honesta como parada) + la DoF gana el veredicto A/B surfeado.
-
-⛔ **Las DOS enmiendas del 27 ago 2026 — sin ellas la barra cierra en verde con algo muerto**
-(tres casos medidos en tres dominios; detalle en `references/barra-de-calidad.md` §los dos agujeros):
-1. **El lazo va en DOS escalas.** Componente vs componente **y ademas OBJETO ENTREGADO vs objeto
-   entregado del referente** (la pelicula entera, la landing entera, el lienzo entero), con
-   metricas de conjunto. El smoothing pass NO cuenta: es coherencia, no juicio. *Test de escala:
-   ¿la unidad que juzga el critico es la misma que consume el usuario?*
-2. **Del referente se puede CAMBIAR; sin referente no se puede QUEDAR.** Si el spec argumenta que
-   no aplica a una dimension, debe nombrar OTRO artefacto real de la misma escala — nunca una
-   cifra propia — o declarar el hueco. La frase para las tres: *"la meta se baja al
-   comparador"*.
-
-La doctrina de subagentes que el spec le dicta al ejecutor (critico fresco SIEMPRE que hay
-barra; paralelo SOLO artefactos disjuntos; sistemas acoplados = pase secuencial con UN dueño —
-data del propio Claude-of-Duty; smoothing pass al final) vive en la reference. Clave: se
-prescribe el PROCESO de calidad, jamas la implementacion. La barra NO sustituye el comando de
-validacion: el critico ve calidad, el comando ve verdad mecanica.
-
 ### Fase 4 — Compila (bloque `/goal` corto + `spec.md`)
-El campo de condicion de `/goal` **corta a 4000 caracteres**; si te pasas, lo rechaza. Por eso NO metas todo inline. Genera DOS cosas: un **`spec.md`** en disco con toda la ambicion y el detalle (sin limite), y un **bloque `/goal` corto** (apunta a <2000 chars) que referencia el spec y solo carga lo que el evaluador necesita ver. Devuelve el bloque `/goal` en un bloque de codigo para copiarlo limpio, y crea el `spec.md` en disco con ruta absoluta. **Antes de entregar el bloque, VERIFICA su largo con `wc -m` y confirma que es <4000 (idealmente <2000); si pasa, recorta moviendo detalle al spec.** Reporta el conteo al usuario. No ejecutes el build (a menos que el dueño lo pida): esta skill **produce el prompt y el spec**, no construye la app.
+El campo de condicion de `/goal` **corta a 4000 caracteres**; si te pasas, lo rechaza. Por eso NO metas todo inline. Genera DOS cosas: un **`spec.md`** en disco con toda la ambicion y el detalle (sin limite), y un **bloque `/goal` corto** (apunta a <2000 chars) que referencia el spec y solo carga lo que el evaluador necesita ver. Devuelve el bloque `/goal` en un bloque de codigo para copiarlo limpio, y crea el `spec.md` en disco con ruta absoluta. **Antes de entregar el bloque, VERIFICA su largo con `wc -m` y confirma que es <4000 (idealmente <2000); si pasa, recorta moviendo detalle al spec.** Reporta el conteo al usuario. No ejecutes el build (a menos que Daniel lo pida): esta skill **produce el prompt y el spec**, no construye la app.
 
 ## Limite duro: 4000 caracteres en la condicion de `/goal`
 
@@ -130,7 +101,7 @@ El campo de condicion de `/goal` corta a **4000 caracteres**; si te pasas, lo re
 
 ## Plantilla A — el `spec.md` (en disco, SIN limite)
 
-Aqui va toda la ambicion. Es lo que en la version vieja iba inline. Guardalo con ruta absoluta (ej. dentro de `docs/specs/<slug>/`).
+Aqui va toda la ambicion. Es lo que en la version vieja iba inline. Guardalo con ruta absoluta (ej. dentro de `youtube/videos/.../specs/`).
 
 ````markdown
 # [Nombre] — Spec
@@ -153,26 +124,6 @@ edicion grande para no driftar.
 ## DEFINICION DE HECHO (evidencia visible en la conversacion)
 [La version expandida y detallada de la DoF: cada flujo interactivo del dominio.]
 
-## BARRA DE CALIDAD (solo dominios de EXCELENCIA — si no aplica, BORRA esta seccion)
-Referente a vencer: [artefacto REAL e inspeccionable: paths de screenshots / URL / archivo].
-⛔ Si en alguna dimension este referente NO aplica, NOMBRA otro artefacto real de la MISMA ESCALA
-para esa dimension o declara el hueco ("esta dimension va sin barra"). Una cifra propia, un conteo
-interno o una vara derivada de nuestro material anterior NO son sustitutos: eso es quedarse sin vara.
-El lazo corre en DOS ESCALAS y las dos son obligatorias:
- · COMPONENTE — cada pieza calificable contra la pieza equivalente del referente.
- · OBJETO — [la entrega completa: el video entero / la landing entera / el lienzo entero] contra
-   la entrega completa del referente, con metricas de CONJUNTO (ritmo, continuidad, densidad,
-   huecos, deriva), no de pieza. El pase de integracion final NO sustituye este lazo.
-Por cada componente calificable, monta un lazo builder→critico: el critico es un subagente de
-CONTEXTO FRESCO que nunca ve tu razonamiento; compara tu artefacto RENDERIZADO contra el
-referente en A/B ciego y devuelve EL gap mas grande (uno solo, no lista). El critico es
-DESPIADADO por calibracion: su default es "gana el referente" y solo cede la victoria cuando
-el tuyo gana CLARAMENTE — ante la duda, gana el referente. Atacalo y repite
-hasta que el critico prefiera el tuyo o haya meseta honesta (2 rondas sin avance → declara el
-gap residual y sigue). Paralelo SOLO entre componentes disjuntos; sistemas acoplados = pase
-secuencial con UN dueño. Al final, un pase de integracion con agente fresco revisa la
-coherencia del conjunto. Surfea cada veredicto A/B en la conversacion.
-
 ## COMANDO DE VALIDACION
 [Infra conocida: el comando exacto, ej. `npm run build && npm test`. Stack libre:
 "Declara tu comando de validacion en el primer checkpoint (build/test/lint en uno)."
@@ -201,15 +152,20 @@ HECHO cuando (el evaluador solo ve esta conversacion, no corre comandos: surfea
 - con Playwright abres la pagina y pegas screenshots de: [flujo 1]; [flujo 2]; [flujo 3
   con antes/despues que demuestre movimiento/interaccion]
 - reporte de decisiones (que stack elegiste y por que)
-- [solo si el spec tiene BARRA DE CALIDAD] veredicto A/B final del critico por componente +
-  gap residual declarado
 - lista las formas en que podria estar mal/incompleto y resuelvelas
+O BIEN, BLOQUEADO: si falta algo que solo da una persona (llave, saldo, firma, copia
+licenciada), detente y pega el bloqueo, quien lo destraba y el estado del grafo: eso
+tambien cierra el goal.
 RESTRICCIONES: [app web que corre con un comando; sin APIs de pago; lo que no se toca].
 RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo.
 ````
 
-> ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal`.**
-> El effort y el Auto mode los fija el dueño DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
+> **Por que el BLOQUEADO va dentro de HECHO** (post-mortem del goal del SGI, 2026-10-01): sin llave, la
+> condicion no podia cumplirse y el evaluador relanzo cientos de turnos vacios. La RED DE SEGURIDAD le pide al
+> agente que pare, pero quien decide si el goal termino es el evaluador, y solo acepta lo que la condicion dice.
+
+> ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal` (Daniel, 4 jul).**
+> El effort y el Auto mode los fija Daniel DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
 > caracteres del limite. El bloque solo lleva outcome + DoF + restricciones + red de seguridad.
 
 ### Dos notas operativas que van junto al artefacto (fuera del bloque)
@@ -231,8 +187,6 @@ RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo
 - **Cuestionario de 10 preguntas.** Solo lo que bloquea el outcome. El resto se deja abierto a proposito.
 - **Bajar la ambicion a un MVP.** El default es la version world-class.
 - **Pasarte de 4000 chars en el bloque `/goal`.** Es un limite duro que lo rechaza. Si no cabe, mueve la profundidad al `spec.md` y deja el bloque corto apuntando al spec.
-- **Barra de calidad en dominio de EXISTENCIA** (cron, script, endpoint) = teatro de calidad. Y su inversa, mas cara: **DoF de solo-existencia en dominio de EXCELENCIA** — el loop cierra en verde con un resultado mediocre-funcional. Diagnostica en Fase 3.5.
-- **Barra sin referente nombrable** ("que se vea increible"). Si el critico no puede montar el A/B contra un artefacto real, no hay lazo — solo adjetivos.
 
 ## Fase 5 — Post-mortem al grafo (el lazo de plasticidad, formalizado 21 jul)
 
@@ -240,20 +194,19 @@ Cuando un `/goal` compilado termina (converge o se detiene por la red de segurid
 cierra hasta el post-mortem: (1) pedir/extraer el retrospectivo del ejecutor (fricciones, gaps,
 fallas, qué funcionó); (2) mapear CADA hallazgo a un elemento del grafo del sistema (¿qué arista
 era frágil? ¿qué lazo faltaba?); (3) los hallazgos se vuelven gates/reglas/estados — se actualiza
-el conectoma Y la skill del dominio; (4) lo que funcionó se declara intocable. Ejemplo: un
-retrospectivo honesto puede parir varios scripts y el cierre completo del grafo en un día. La
+el conectoma Y la skill del dominio; (4) lo que funcionó se declara intocable. Precedente: el
+retrospectivo del run 1 de video parió 7 scripts y el cierre completo del grafo en un día. La
 dinámica esculpe la topología — sin este paso, el grafo se pudre y las mismas fallas se repiten.
 
 ## El metagrafo de esta skill (se contempla a sí misma)
 
-Esta skill también puede mapearse como conectoma con su propia semántica (cubierto · sin estreno ·
-hueco · lazos): un JSON en `arbrain/public/conectoma/grafos/goal-compiler.json` que el visor
-`/conectoma/index.html?g=goal-compiler` dibuja. Ahí se VE qué fase ya tuvo su primera compilación
-real, qué huecos quedan (por ejemplo, `grafo → orquestación`: hoy el ejecutor deriva sus agentes
-leyendo el spec) y el lazo de plasticidad (post-mortem → skill). Si lo creas, al cerrar cada hueco
-actualiza su `estado`: el mapa respira con el trabajo, no se pudre.
-
-**Orquestador one-shot:** cuando el encargo pide compilar Y ejecutar delegando a subagentes («de one shot», «delega», «orquesta»), el coordinador compila el spec y lo lleva hasta el reporte con fichas por nodo, worktrees, gates re-corridos por él e integración secuencial: leer `references/orquestador-one-shot.md`.
+Esta skill está mapeada como conectoma con su propia semántica (morado = cubierta · ámbar = sin
+estreno · gris = hueco · ↻ = lazos): **Biblioteca → Conectomas → "Goal Compiler — el metagrafo"**
+(`/conectoma/index.html?g=goal-compiler`). Ahí se VE: la Fase 1.5 en ámbar hasta su primera
+compilación real, el hueco `grafo → orquestación` (el compilador de topología a Workflow aún no
+existe; hoy el ejecutor deriva sus agentes leyendo el spec), y el lazo de plasticidad (post-mortem
+→ skill). Al cerrar cada uno, actualizar su `estado` en
+`public/conectoma/grafos/goal-compiler.json` — el mapa respira con el trabajo, no se pudre.
 
 ## Profundidad tecnica
 Para la mecanica fina de `/goal` (evaluador, exit codes de hooks), niveles de effort, combos con Auto mode, y la lista verificada de comandos nuevos de Claude Code: leer `references/goal-mechanics.md`.
diff --git a/arbrain/goal-compiler/references/barra-de-calidad.md b/arbrain/goal-compiler/references/barra-de-calidad.md
# solo en el lado izquierdo: 218 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/references/goal-mechanics.md b/proyecto/goal-compiler/references/goal-mechanics.md
index 29997da..a819bf0 100644
--- a/arbrain/goal-compiler/references/goal-mechanics.md
+++ b/proyecto/goal-compiler/references/goal-mechanics.md
@@ -25,7 +25,7 @@ rechaza ("Goal condition is limited to 4000 characters"). Por eso el patron es d
 archivos: `spec.md` en disco con toda la profundidad + bloque `/goal` corto (<2000 chars
 para margen) que referencia el spec por ruta absoluta. El agente lee el spec; el evaluador
 solo juzga la DoF que quedo en el bloque. Apunta SIEMPRE con ruta absoluta para que el
-`Read` del agente funcione sin importar el cwd donde el dueño lance `/goal`.
+`Read` del agente funcione sin importar el cwd donde Daniel lance `/goal`.
 
 ## `/goal` vs `/loop` vs `/workflows` vs `/batch`
 - **`/goal`** — "trabaja hasta que la condicion verificable se cumpla". Profundidad
diff --git a/arbrain/goal-compiler/references/loop-vs-grafo.md b/proyecto/goal-compiler/references/loop-vs-grafo.md
index 5b8003f..19ac93f 100644
--- a/arbrain/goal-compiler/references/loop-vs-grafo.md
+++ b/proyecto/goal-compiler/references/loop-vs-grafo.md
@@ -2,8 +2,8 @@
 
 > Se consulta en la Fase 1.5 del compiler, ANTES de compilar. Fuentes: AI Builder Club
 > ("Graph Engineering Guide" + "Graph vs Loop Engineering", jul 2026) + nuestra doctrina
-> grafo×lazo×variedad + un PoC de edición de video (21 jul: topología → gates → compositor en un día).
-> **Documentada para que cualquiera (el dueño, alguien de su equipo, un agente fresco) tenga la
+> grafo×lazo×variedad + el PoC edicion-de-video (21 jul: topología → gates → compositor en un día).
+> **Documentada para que cualquiera (Daniel, un miembro de SFC, un agente fresco) tenga la
 > autonomía de elegir bien la forma sin re-litigar.**
 
 ## Los dos objetos (no confundir)
@@ -56,10 +56,10 @@ diagnóstico da GRAFO, además:
 2. **Los agentes se derivan del grafo, no al revés**: el orden topológico dicta qué corre en
    paralelo; dos agentes solo pueden coexistir si escriben nodos disjuntos y se hablan por aristas.
 3. **(Opcional, si el sistema es durable)** el grafo se materializa como conectoma
-   (`arbrain/public/conectoma/grafos/<slug>.json`, schema en su README) → visible en la Biblioteca,
+   (`public/conectoma/grafos/<slug>.json`, schema en su README) → visible en la Biblioteca,
    con cobertura morado/ámbar/gris = la agenda de trabajo visible.
 
-## EL TRABAJO DEL GRAPH ENGINEER: el ciclo de cierre (21 jul)
+## EL TRABAJO DEL GRAPH ENGINEER: el ciclo de cierre (nombrado por Daniel, 21 jul)
 
 "Ir convirtiendo dinámica morada y cerrando los grafos" — ese ES el trabajo. El ciclo completo:
 
@@ -83,12 +83,12 @@ algo y el mapa no cambió, no cerraste nada · si el mapa cambió y no cerraste
 **El compilador `scripts/grafo2plan.py`** cierra el tramo mapa→máquina: lee un grafo (schema
 conectoma) y deriva el PLAN determinista — fases por orden topológico, grupos hacia artefactos
 disjuntos = PARALELO, convergencias marcadas (el merge silencioso es EL fallo de grafo), y los
-lazos montados como gates de su fase. Validado: derivó solo que en un pipeline de edición de video el corte y
+lazos montados como gates de su fase. Validado: derivó solo que en edicion-de-video el corte y
 el diseño corren en paralelo y convergen en el SSOT — idéntico a la producción real.
 
 ## El caso de estudio (por qué este orden paga)
 
-Un pipeline de edición de video (20-21 jul): el run 1 falló donde no había regulación (retomas cross-chunk,
+`edicion-de-video` (20-21 jul): el run 1 falló donde no había regulación (retomas cross-chunk,
 composición antes de sellar, máster horneado). Se dibujó el grafo PRIMERO (19 nodos, 23 aristas,
 10 lazos — los huecos grises ERAN la agenda), se cerraron gates baratos sobre las aristas
 (dedup, candado, keyscan) y al final el compositor declarativo. Un día: de 6 huecos a grafo
diff --git a/arbrain/goal-compiler/references/orquestador-one-shot.md b/arbrain/goal-compiler/references/orquestador-one-shot.md
# solo en el lado izquierdo: 78 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/scripts/grafo2plan.py b/proyecto/goal-compiler/scripts/grafo2plan.py
index 7ef6185..715c92b 100644
--- a/arbrain/goal-compiler/scripts/grafo2plan.py
+++ b/proyecto/goal-compiler/scripts/grafo2plan.py
@@ -14,14 +14,14 @@ tipadas script/agente/manual/mixta, lazos = comparadores sobre nodos/aristas) y
   - Varias aristas al MISMO artefacto = convergencia (se marca: van al mismo worker/merge).
   - Los LAZOS se montan como GATES: al cerrar la fase que produce su nodo/arista anclada.
   - Tipos → ejecutores: script = correr determinista · agente = spawnear subagente (Sonnet) ·
-    manual = checkpoint del dueño · mixta = agente con scripts.
+    manual = checkpoint de Daniel · mixta = agente con scripts.
 
 USO:
   python3 grafo2plan.py GRAFO.json [-o plan.md] [--json plan.json]
   # GRAFO.json = schema conectoma (arbrain/public/conectoma/README.md) o un GRAFO DEL SISTEMA
   #              exportado del spec con el mismo shape.
 
-Validado contra el grafo real de un pipeline de edición de video: deriva solo que el carril de CORTE y el de
+Validado contra el grafo real de edicion-de-video: deriva solo que el carril de CORTE y el de
 DISEÑO corren en paralelo y convergen en timeline.json — exactamente lo que pasó en producción.
 """
 import json, sys, argparse
@@ -29,9 +29,9 @@ from collections import defaultdict
 
 EJECUTOR = {
     "script": "▸ correr script (determinista)",
-    "agente": "◆ juicio del agente",
-    "manual": "⏸ checkpoint del dueño",
-    "mixta": "◆ agente con scripts",
+    "agente": "◆ spawnear subagente (Sonnet)",
+    "manual": "⏸ checkpoint de Daniel",
+    "mixta": "◆ subagente con scripts",
 }
 
 
@@ -40,26 +40,11 @@ def compilar(G):
     aristas = G["aristas"]
     lazos = G.get("lazos", [])
 
-    # Feedback remains in the source graph and in the plan, but cannot be a
-    # prerequisite of the same iteration. Only EXPLICIT feedback is excluded.
-    if len(nodos) != len(G["nodos"]):
-        raise ValueError("IDs de nodo duplicados")
-    if len({a["id"] for a in aristas}) != len(aristas):
-        raise ValueError("IDs de arista duplicados")
-    feedback = []
     entradas = defaultdict(list)   # nodo <- aristas que lo producen
     for a in aristas:
         if a["from"] not in nodos or a["to"] not in nodos:
             sys.exit(f"✗ arista '{a['id']}' referencia nodos inexistentes")
-        role = a.get("plan_role", "dependency")
-        if role not in ("dependency", "feedback"):
-            raise ValueError(f"plan_role desconocido: {a['id']}")
-        if role == "feedback":
-            if not a.get("condition"):
-                raise ValueError(f"Feedback sin condición: {a['id']}")
-            feedback.append(a)
-        else:
-            entradas[a["to"]].append(a)
+        entradas[a["to"]].append(a)
 
     # capa de cada nodo = 1 + max(capa de sus fuentes); raíces = 0. Con guard de ciclos.
     capa, visitando = {}, set()
@@ -81,8 +66,7 @@ def compilar(G):
     # fase de una TRANSFORMACIÓN = capa de su artefacto destino
     fases = defaultdict(list)
     for a in aristas:
-        if a.get("plan_role") != "feedback":
-            fases[capa[a["to"]]].append(a)
+        fases[capa[a["to"]]].append(a)
 
     # lazos anclados: gate se corre al cerrar la fase que produce su ancla
     gates = defaultdict(list)
@@ -92,18 +76,10 @@ def compilar(G):
         if kind == "nodo" and ref in capa:
             gates[capa[ref]].append(l)
         elif kind == "arista" and ref in ar_by_id:
-            edge = ar_by_id[ref]
-            anchor = edge["from"] if edge.get("plan_role") == "feedback" else edge["to"]
-            gates[capa[anchor]].append(l)
-        else:
-            raise ValueError(f"Lazo sin ancla válida: {l.get('id')}")
+            gates[capa[ar_by_id[ref]["to"]]].append(l)
 
     plan = []
-    return_phases = defaultdict(list)
-    for edge in feedback:
-        return_phases[capa[edge["from"]]].append(edge)
-    for f in sorted(set(fases) | set(gates) | set(return_phases)):
-
+    for f in sorted(k for k in fases if k > 0):
         ts = fases[f]
         destinos = defaultdict(list)
         for a in ts:
@@ -124,7 +100,6 @@ def compilar(G):
             "fase": f,
             "paralelizable": len(grupos) > 1,
             "grupos": grupos,
-            "retornos": return_phases.get(f, []),
             "gates": [{"id": l["id"], "label": l["label"], "estado": l.get("estado", ""),
                        "referencia": l.get("referencia", "")} for l in gates.get(f, [])],
         })
@@ -134,7 +109,7 @@ def compilar(G):
 def render_md(G, plan):
     out = [f"# Plan de orquestación — {G['titulo']}",
            f"\n> Derivado DETERMINISTA del grafo `{G['slug']}` por grafo2plan.py — no es juicio, es topología.",
-           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS son candidatos a paralelismo; comprobar recursos compartidos;",
+           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;",
            "> los gates de la fase se corren ANTES de avanzar a la siguiente.\n"]
     for p in plan:
         par = " · ⚡ GRUPOS EN PARALELO" if p["paralelizable"] else ""
@@ -149,10 +124,6 @@ def render_md(G, plan):
             for l in p["gates"]:
                 ref = f" — referencia: {l['referencia']}" if l["referencia"] else ""
                 out.append(f"- ↻ {l['label']} [{l['estado']}]{ref}")
-        if p.get("retornos"):
-            out.append("\n**Retornos condicionales (nueva iteración; no ejecutar automáticamente):**")
-            for edge in p["retornos"]:
-                out.append(f"- `{edge['id']}` → `{edge['to']}`: {edge['condition']}")
         out.append("")
     return "\n".join(out)
diff --git a/arbrain/goal-compiler/scripts/test_grafo2plan.py b/arbrain/goal-compiler/scripts/test_grafo2plan.py
# solo en el lado izquierdo: 49 líneas (su texto está en esa copia; no se repite aquí)
```

### Arbrain v0.2.10 → global

```text
/dev/null => global/goal-compiler/README-PAQUETE.md                   |  10 ++
 {arbrain => global}/goal-compiler/SKILL.md                            |  91 ++++--------------
 arbrain/goal-compiler/references/barra-de-calidad.md => /dev/null     | 218 ------------------------------------------
 {arbrain => global}/goal-compiler/references/goal-mechanics.md        |   2 +-
 {arbrain => global}/goal-compiler/references/loop-vs-grafo.md         |  12 +--
 arbrain/goal-compiler/references/orquestador-one-shot.md => /dev/null |  78 ---------------
 {arbrain => global}/goal-compiler/scripts/grafo2plan.py               |  49 ++--------
 arbrain/goal-compiler/scripts/test_grafo2plan.py => /dev/null         |  49 ----------
 8 files changed, 45 insertions(+), 464 deletions(-)
```

```diff
diff --git a/global/goal-compiler/README-PAQUETE.md b/global/goal-compiler/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/SKILL.md b/global/goal-compiler/SKILL.md
index 14f4573..870f5bc 100644
--- a/arbrain/goal-compiler/SKILL.md
+++ b/global/goal-compiler/SKILL.md
@@ -1,6 +1,6 @@
 ---
 name: goal-compiler
-description: "Convertir una intención ambiciosa en un spec y un prompt verificable para /goal. Usar para compilar o elevar prompts, elegir loop o grafo y definir criterios de calidad con referentes y crítica A/B. Diseña el contrato de ejecución; no ejecuta el proyecto por invocarlo."
+description: "Convierte una intencion vaga y ambiciosa en un prompt soberano para /goal: outcome CLARO, como LIBRE (el modelo elige arquitectura/stack), apuntando al horizonte maximo, no un MVP. Incluye el DIAGNOSTICO DE FORMA loop-vs-grafo (Fase 1.5): decide si la tarea es UN loop o un GRAFO de especialidades, y cuando es grafo compila topologia-primero (nodos=artefactos, aristas tipadas, lazos con referencia). Triggers: 'conviérteme esto en /goal', compila este prompt, hazme un prompt para goal, prompt soberano, eleva este prompt, 'quiero construir X pero no se como pedirlo', 'que el modelo decida', prompt ambicioso, ¿esto es loop o grafo?, compila un grafo, cuando usar grafos vs loops. NO: ejecutar/construir directamente (eso es /goal), guiones (youtube-os), imagenes (image-generation), skills (skill-creator)."
 ---
 
 # Goal Compiler — De ambicion vaga a prompt soberano para `/goal`
@@ -44,7 +44,7 @@ Entonces la ambicion y la condicion de parada tiran en direcciones opuestas, y e
 La DoF le da evidencia al **evaluador** al final. Pero el agente puede driftar 30 turnos antes de llegar ahi. El antidoto (adoptado del contrato de 5 partes del goal-loop de David Ondrej): **todo prompt compilado incluye UN comando de validacion** que el agente corre despues de cada cambio grande, no solo al final. Es el heartbeat del loop.
 
 Como se compila SIN romper la soberania del stack:
-- **Infra conocida** (restriccion real: "vive en arbrain/", "es un script en arbrain/server/"): da el comando EXACTO (`npm run build`, `npx tsx script.ts`, `pytest -q`). Un comando concreto NO es imponer stack: es imponer prueba.
+- **Infra conocida** (restriccion real: "vive en arbrain/", "es un script en agent-server/"): da el comando EXACTO (`npm run build`, `npx tsx script.ts`, `pytest -q`). Un comando concreto NO es imponer stack: es imponer prueba.
 - **Stack libre** (el modelo elige todo): no inventes el comando. El contrato ordena: *"En tu primer checkpoint DECLARA tu comando de validacion (build/test/lint en uno) y correlo tras cada cambio grande, surfeando el output."* El agente elige el comando; declararlo y correrlo es innegociable.
 
 Regla: lo obligatorio es el **mecanismo** (un comando, corrido siempre, output visible), no el comando en si.
@@ -74,7 +74,7 @@ loop.* No te gradúas de loops a grafos: COMPONES loops en grafos (cada nodo ES
   improvisa**: `python3 scripts/grafo2plan.py GRAFO.json -o plan.md` deriva fases por orden
   topológico, paralelismo (artefactos disjuntos), convergencias y gates por fase — el plan entra
   al spec. Si el sistema es durable se materializa como conectoma
-  (`arbrain/public/conectoma/grafos/<slug>.json` → Biblioteca). Caso de estudio, anti-patrones y
+  (`public/conectoma/grafos/<slug>.json` → Biblioteca). Caso de estudio, anti-patrones y
   EL CICLO DE CIERRE (el trabajo del graph engineer): la reference. ⛔ Sobre-grafear tareas
   simples = teatro de complejidad; ante la duda, loop.
 
@@ -82,47 +82,17 @@ loop.* No te gradúas de loops a grafos: COMPONES loops en grafos (cada nodo ES
 No hagas un cuestionario. Pregunta unicamente lo que cambia el resultado y que no puedas inferir. Buenos ejemplos de pregunta que si mueve la aguja: "¿esto lo vas a mostrar en pantalla (web) o corre local?", "¿quien lo usa, tu o un usuario final?", "¿hay alguna restriccion real de infra/plataforma o el modelo elige todo?". Si no hay nada que de verdad bloquee, **no preguntes, compila**.
 
 **Como preguntar las pocas que sobrevivan (mecanica de grilling / Matt Pocock, 22 jul 2026):**
-- **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza del dueño y el modelo no puede inferir— se le ponen a el.
+- **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza de Daniel y el modelo no puede inferir— se le ponen a el.
 - **Una a la vez.** Si necesitas 2-4, hazlas de una en una esperando respuesta; varias juntas desconciertan y bajan la calidad de cada respuesta.
-- **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que el dueño confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.
+- **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que Daniel confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.
 
 Regla de oro: ante la duda entre preguntar un detalle tecnico o dejarlo abierto, **dejalo abierto**. El detalle tecnico es justo lo que el modelo resuelve mejor que tu.
 
 ### Fase 3 — Expande el horizonte
 Reescribe el outcome a su version world-class. No "un visor de anatomia", sino "un atlas anatomico 3D interactivo nivel referencia mundial, con sistemas seleccionables, cortes, capas, y experimentacion simulada". Sube el techo a proposito. Es mas barato pedir el horizonte y aterrizar, que pedir poco y quedarse corto.
 
-### Fase 3.5 — ¿EXISTENCIA o EXCELENCIA? La BARRA DE CALIDAD (Gauntlet, 29 jul 2026 — LEER `references/barra-de-calidad.md`)
-
-Pregunta binaria antes de compilar: **cuando esto FUNCIONE, ¿ya gano?**
-
-- **SI → dominio de EXISTENCIA** (crons, scripts, endpoints, pipelines): la DoF normal basta.
-  NO montes barra — seria teatro de calidad.
-- **NO — funcional-pero-mediocre seria un fracaso → dominio de EXCELENCIA** (juegos/3D,
-  pergaminos, decks, thumbnails, edicion de video, landing copy, UIs de producto): el spec gana
-  la seccion **`## BARRA DE CALIDAD`** — un referente REAL e inspeccionable a vencer (test: si
-  no puedes NOMBRAR el artefacto del A/B, no hay barra) + lazo builder→critico-ciego por
-  componente (contexto fresco, A/B contra el referente, devuelve EL gap mas grande, meseta
-  honesta como parada) + la DoF gana el veredicto A/B surfeado.
-
-⛔ **Las DOS enmiendas del 27 ago 2026 — sin ellas la barra cierra en verde con algo muerto**
-(tres casos medidos en tres dominios; detalle en `references/barra-de-calidad.md` §los dos agujeros):
-1. **El lazo va en DOS escalas.** Componente vs componente **y ademas OBJETO ENTREGADO vs objeto
-   entregado del referente** (la pelicula entera, la landing entera, el lienzo entero), con
-   metricas de conjunto. El smoothing pass NO cuenta: es coherencia, no juicio. *Test de escala:
-   ¿la unidad que juzga el critico es la misma que consume el usuario?*
-2. **Del referente se puede CAMBIAR; sin referente no se puede QUEDAR.** Si el spec argumenta que
-   no aplica a una dimension, debe nombrar OTRO artefacto real de la misma escala — nunca una
-   cifra propia — o declarar el hueco. La frase para las tres: *"la meta se baja al
-   comparador"*.
-
-La doctrina de subagentes que el spec le dicta al ejecutor (critico fresco SIEMPRE que hay
-barra; paralelo SOLO artefactos disjuntos; sistemas acoplados = pase secuencial con UN dueño —
-data del propio Claude-of-Duty; smoothing pass al final) vive en la reference. Clave: se
-prescribe el PROCESO de calidad, jamas la implementacion. La barra NO sustituye el comando de
-validacion: el critico ve calidad, el comando ve verdad mecanica.
-
 ### Fase 4 — Compila (bloque `/goal` corto + `spec.md`)
-El campo de condicion de `/goal` **corta a 4000 caracteres**; si te pasas, lo rechaza. Por eso NO metas todo inline. Genera DOS cosas: un **`spec.md`** en disco con toda la ambicion y el detalle (sin limite), y un **bloque `/goal` corto** (apunta a <2000 chars) que referencia el spec y solo carga lo que el evaluador necesita ver. Devuelve el bloque `/goal` en un bloque de codigo para copiarlo limpio, y crea el `spec.md` en disco con ruta absoluta. **Antes de entregar el bloque, VERIFICA su largo con `wc -m` y confirma que es <4000 (idealmente <2000); si pasa, recorta moviendo detalle al spec.** Reporta el conteo al usuario. No ejecutes el build (a menos que el dueño lo pida): esta skill **produce el prompt y el spec**, no construye la app.
+El campo de condicion de `/goal` **corta a 4000 caracteres**; si te pasas, lo rechaza. Por eso NO metas todo inline. Genera DOS cosas: un **`spec.md`** en disco con toda la ambicion y el detalle (sin limite), y un **bloque `/goal` corto** (apunta a <2000 chars) que referencia el spec y solo carga lo que el evaluador necesita ver. Devuelve el bloque `/goal` en un bloque de codigo para copiarlo limpio, y crea el `spec.md` en disco con ruta absoluta. **Antes de entregar el bloque, VERIFICA su largo con `wc -m` y confirma que es <4000 (idealmente <2000); si pasa, recorta moviendo detalle al spec.** Reporta el conteo al usuario. No ejecutes el build (a menos que Daniel lo pida): esta skill **produce el prompt y el spec**, no construye la app.
 
 ## Limite duro: 4000 caracteres en la condicion de `/goal`
 
@@ -130,7 +100,7 @@ El campo de condicion de `/goal` corta a **4000 caracteres**; si te pasas, lo re
 
 ## Plantilla A — el `spec.md` (en disco, SIN limite)
 
-Aqui va toda la ambicion. Es lo que en la version vieja iba inline. Guardalo con ruta absoluta (ej. dentro de `docs/specs/<slug>/`).
+Aqui va toda la ambicion. Es lo que en la version vieja iba inline. Guardalo con ruta absoluta (ej. dentro de `youtube/videos/.../specs/`).
 
 ````markdown
 # [Nombre] — Spec
@@ -153,26 +123,6 @@ edicion grande para no driftar.
 ## DEFINICION DE HECHO (evidencia visible en la conversacion)
 [La version expandida y detallada de la DoF: cada flujo interactivo del dominio.]
 
-## BARRA DE CALIDAD (solo dominios de EXCELENCIA — si no aplica, BORRA esta seccion)
-Referente a vencer: [artefacto REAL e inspeccionable: paths de screenshots / URL / archivo].
-⛔ Si en alguna dimension este referente NO aplica, NOMBRA otro artefacto real de la MISMA ESCALA
-para esa dimension o declara el hueco ("esta dimension va sin barra"). Una cifra propia, un conteo
-interno o una vara derivada de nuestro material anterior NO son sustitutos: eso es quedarse sin vara.
-El lazo corre en DOS ESCALAS y las dos son obligatorias:
- · COMPONENTE — cada pieza calificable contra la pieza equivalente del referente.
- · OBJETO — [la entrega completa: el video entero / la landing entera / el lienzo entero] contra
-   la entrega completa del referente, con metricas de CONJUNTO (ritmo, continuidad, densidad,
-   huecos, deriva), no de pieza. El pase de integracion final NO sustituye este lazo.
-Por cada componente calificable, monta un lazo builder→critico: el critico es un subagente de
-CONTEXTO FRESCO que nunca ve tu razonamiento; compara tu artefacto RENDERIZADO contra el
-referente en A/B ciego y devuelve EL gap mas grande (uno solo, no lista). El critico es
-DESPIADADO por calibracion: su default es "gana el referente" y solo cede la victoria cuando
-el tuyo gana CLARAMENTE — ante la duda, gana el referente. Atacalo y repite
-hasta que el critico prefiera el tuyo o haya meseta honesta (2 rondas sin avance → declara el
-gap residual y sigue). Paralelo SOLO entre componentes disjuntos; sistemas acoplados = pase
-secuencial con UN dueño. Al final, un pase de integracion con agente fresco revisa la
-coherencia del conjunto. Surfea cada veredicto A/B en la conversacion.
-
 ## COMANDO DE VALIDACION
 [Infra conocida: el comando exacto, ej. `npm run build && npm test`. Stack libre:
 "Declara tu comando de validacion en el primer checkpoint (build/test/lint en uno)."
@@ -201,15 +151,13 @@ HECHO cuando (el evaluador solo ve esta conversacion, no corre comandos: surfea
 - con Playwright abres la pagina y pegas screenshots de: [flujo 1]; [flujo 2]; [flujo 3
   con antes/despues que demuestre movimiento/interaccion]
 - reporte de decisiones (que stack elegiste y por que)
-- [solo si el spec tiene BARRA DE CALIDAD] veredicto A/B final del critico por componente +
-  gap residual declarado
 - lista las formas en que podria estar mal/incompleto y resuelvelas
 RESTRICCIONES: [app web que corre con un comando; sin APIs de pago; lo que no se toca].
 RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo.
 ````
 
-> ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal`.**
-> El effort y el Auto mode los fija el dueño DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
+> ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal` (Daniel, 4 jul).**
+> El effort y el Auto mode los fija Daniel DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
 > caracteres del limite. El bloque solo lleva outcome + DoF + restricciones + red de seguridad.
 
 ### Dos notas operativas que van junto al artefacto (fuera del bloque)
@@ -231,8 +179,6 @@ RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo
 - **Cuestionario de 10 preguntas.** Solo lo que bloquea el outcome. El resto se deja abierto a proposito.
 - **Bajar la ambicion a un MVP.** El default es la version world-class.
 - **Pasarte de 4000 chars en el bloque `/goal`.** Es un limite duro que lo rechaza. Si no cabe, mueve la profundidad al `spec.md` y deja el bloque corto apuntando al spec.
-- **Barra de calidad en dominio de EXISTENCIA** (cron, script, endpoint) = teatro de calidad. Y su inversa, mas cara: **DoF de solo-existencia en dominio de EXCELENCIA** — el loop cierra en verde con un resultado mediocre-funcional. Diagnostica en Fase 3.5.
-- **Barra sin referente nombrable** ("que se vea increible"). Si el critico no puede montar el A/B contra un artefacto real, no hay lazo — solo adjetivos.
 
 ## Fase 5 — Post-mortem al grafo (el lazo de plasticidad, formalizado 21 jul)
 
@@ -240,20 +186,19 @@ Cuando un `/goal` compilado termina (converge o se detiene por la red de segurid
 cierra hasta el post-mortem: (1) pedir/extraer el retrospectivo del ejecutor (fricciones, gaps,
 fallas, qué funcionó); (2) mapear CADA hallazgo a un elemento del grafo del sistema (¿qué arista
 era frágil? ¿qué lazo faltaba?); (3) los hallazgos se vuelven gates/reglas/estados — se actualiza
-el conectoma Y la skill del dominio; (4) lo que funcionó se declara intocable. Ejemplo: un
-retrospectivo honesto puede parir varios scripts y el cierre completo del grafo en un día. La
+el conectoma Y la skill del dominio; (4) lo que funcionó se declara intocable. Precedente: el
+retrospectivo del run 1 de video parió 7 scripts y el cierre completo del grafo en un día. La
 dinámica esculpe la topología — sin este paso, el grafo se pudre y las mismas fallas se repiten.
 
 ## El metagrafo de esta skill (se contempla a sí misma)
 
-Esta skill también puede mapearse como conectoma con su propia semántica (cubierto · sin estreno ·
-hueco · lazos): un JSON en `arbrain/public/conectoma/grafos/goal-compiler.json` que el visor
-`/conectoma/index.html?g=goal-compiler` dibuja. Ahí se VE qué fase ya tuvo su primera compilación
-real, qué huecos quedan (por ejemplo, `grafo → orquestación`: hoy el ejecutor deriva sus agentes
-leyendo el spec) y el lazo de plasticidad (post-mortem → skill). Si lo creas, al cerrar cada hueco
-actualiza su `estado`: el mapa respira con el trabajo, no se pudre.
-
-**Orquestador one-shot:** cuando el encargo pide compilar Y ejecutar delegando a subagentes («de one shot», «delega», «orquesta»), el coordinador compila el spec y lo lleva hasta el reporte con fichas por nodo, worktrees, gates re-corridos por él e integración secuencial: leer `references/orquestador-one-shot.md`.
+Esta skill está mapeada como conectoma con su propia semántica (morado = cubierta · ámbar = sin
+estreno · gris = hueco · ↻ = lazos): **Biblioteca → Conectomas → "Goal Compiler — el metagrafo"**
+(`/conectoma/index.html?g=goal-compiler`). Ahí se VE: la Fase 1.5 en ámbar hasta su primera
+compilación real, el hueco `grafo → orquestación` (el compilador de topología a Workflow aún no
+existe; hoy el ejecutor deriva sus agentes leyendo el spec), y el lazo de plasticidad (post-mortem
+→ skill). Al cerrar cada uno, actualizar su `estado` en
+`public/conectoma/grafos/goal-compiler.json` — el mapa respira con el trabajo, no se pudre.
 
 ## Profundidad tecnica
 Para la mecanica fina de `/goal` (evaluador, exit codes de hooks), niveles de effort, combos con Auto mode, y la lista verificada de comandos nuevos de Claude Code: leer `references/goal-mechanics.md`.
diff --git a/arbrain/goal-compiler/references/barra-de-calidad.md b/arbrain/goal-compiler/references/barra-de-calidad.md
# solo en el lado izquierdo: 218 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/references/goal-mechanics.md b/global/goal-compiler/references/goal-mechanics.md
index 29997da..a819bf0 100644
--- a/arbrain/goal-compiler/references/goal-mechanics.md
+++ b/global/goal-compiler/references/goal-mechanics.md
@@ -25,7 +25,7 @@ rechaza ("Goal condition is limited to 4000 characters"). Por eso el patron es d
 archivos: `spec.md` en disco con toda la profundidad + bloque `/goal` corto (<2000 chars
 para margen) que referencia el spec por ruta absoluta. El agente lee el spec; el evaluador
 solo juzga la DoF que quedo en el bloque. Apunta SIEMPRE con ruta absoluta para que el
-`Read` del agente funcione sin importar el cwd donde el dueño lance `/goal`.
+`Read` del agente funcione sin importar el cwd donde Daniel lance `/goal`.
 
 ## `/goal` vs `/loop` vs `/workflows` vs `/batch`
 - **`/goal`** — "trabaja hasta que la condicion verificable se cumpla". Profundidad
diff --git a/arbrain/goal-compiler/references/loop-vs-grafo.md b/global/goal-compiler/references/loop-vs-grafo.md
index 5b8003f..19ac93f 100644
--- a/arbrain/goal-compiler/references/loop-vs-grafo.md
+++ b/global/goal-compiler/references/loop-vs-grafo.md
@@ -2,8 +2,8 @@
 
 > Se consulta en la Fase 1.5 del compiler, ANTES de compilar. Fuentes: AI Builder Club
 > ("Graph Engineering Guide" + "Graph vs Loop Engineering", jul 2026) + nuestra doctrina
-> grafo×lazo×variedad + un PoC de edición de video (21 jul: topología → gates → compositor en un día).
-> **Documentada para que cualquiera (el dueño, alguien de su equipo, un agente fresco) tenga la
+> grafo×lazo×variedad + el PoC edicion-de-video (21 jul: topología → gates → compositor en un día).
+> **Documentada para que cualquiera (Daniel, un miembro de SFC, un agente fresco) tenga la
 > autonomía de elegir bien la forma sin re-litigar.**
 
 ## Los dos objetos (no confundir)
@@ -56,10 +56,10 @@ diagnóstico da GRAFO, además:
 2. **Los agentes se derivan del grafo, no al revés**: el orden topológico dicta qué corre en
    paralelo; dos agentes solo pueden coexistir si escriben nodos disjuntos y se hablan por aristas.
 3. **(Opcional, si el sistema es durable)** el grafo se materializa como conectoma
-   (`arbrain/public/conectoma/grafos/<slug>.json`, schema en su README) → visible en la Biblioteca,
+   (`public/conectoma/grafos/<slug>.json`, schema en su README) → visible en la Biblioteca,
    con cobertura morado/ámbar/gris = la agenda de trabajo visible.
 
-## EL TRABAJO DEL GRAPH ENGINEER: el ciclo de cierre (21 jul)
+## EL TRABAJO DEL GRAPH ENGINEER: el ciclo de cierre (nombrado por Daniel, 21 jul)
 
 "Ir convirtiendo dinámica morada y cerrando los grafos" — ese ES el trabajo. El ciclo completo:
 
@@ -83,12 +83,12 @@ algo y el mapa no cambió, no cerraste nada · si el mapa cambió y no cerraste
 **El compilador `scripts/grafo2plan.py`** cierra el tramo mapa→máquina: lee un grafo (schema
 conectoma) y deriva el PLAN determinista — fases por orden topológico, grupos hacia artefactos
 disjuntos = PARALELO, convergencias marcadas (el merge silencioso es EL fallo de grafo), y los
-lazos montados como gates de su fase. Validado: derivó solo que en un pipeline de edición de video el corte y
+lazos montados como gates de su fase. Validado: derivó solo que en edicion-de-video el corte y
 el diseño corren en paralelo y convergen en el SSOT — idéntico a la producción real.
 
 ## El caso de estudio (por qué este orden paga)
 
-Un pipeline de edición de video (20-21 jul): el run 1 falló donde no había regulación (retomas cross-chunk,
+`edicion-de-video` (20-21 jul): el run 1 falló donde no había regulación (retomas cross-chunk,
 composición antes de sellar, máster horneado). Se dibujó el grafo PRIMERO (19 nodos, 23 aristas,
 10 lazos — los huecos grises ERAN la agenda), se cerraron gates baratos sobre las aristas
 (dedup, candado, keyscan) y al final el compositor declarativo. Un día: de 6 huecos a grafo
diff --git a/arbrain/goal-compiler/references/orquestador-one-shot.md b/arbrain/goal-compiler/references/orquestador-one-shot.md
# solo en el lado izquierdo: 78 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/goal-compiler/scripts/grafo2plan.py b/global/goal-compiler/scripts/grafo2plan.py
index 7ef6185..715c92b 100644
--- a/arbrain/goal-compiler/scripts/grafo2plan.py
+++ b/global/goal-compiler/scripts/grafo2plan.py
@@ -14,14 +14,14 @@ tipadas script/agente/manual/mixta, lazos = comparadores sobre nodos/aristas) y
   - Varias aristas al MISMO artefacto = convergencia (se marca: van al mismo worker/merge).
   - Los LAZOS se montan como GATES: al cerrar la fase que produce su nodo/arista anclada.
   - Tipos → ejecutores: script = correr determinista · agente = spawnear subagente (Sonnet) ·
-    manual = checkpoint del dueño · mixta = agente con scripts.
+    manual = checkpoint de Daniel · mixta = agente con scripts.
 
 USO:
   python3 grafo2plan.py GRAFO.json [-o plan.md] [--json plan.json]
   # GRAFO.json = schema conectoma (arbrain/public/conectoma/README.md) o un GRAFO DEL SISTEMA
   #              exportado del spec con el mismo shape.
 
-Validado contra el grafo real de un pipeline de edición de video: deriva solo que el carril de CORTE y el de
+Validado contra el grafo real de edicion-de-video: deriva solo que el carril de CORTE y el de
 DISEÑO corren en paralelo y convergen en timeline.json — exactamente lo que pasó en producción.
 """
 import json, sys, argparse
@@ -29,9 +29,9 @@ from collections import defaultdict
 
 EJECUTOR = {
     "script": "▸ correr script (determinista)",
-    "agente": "◆ juicio del agente",
-    "manual": "⏸ checkpoint del dueño",
-    "mixta": "◆ agente con scripts",
+    "agente": "◆ spawnear subagente (Sonnet)",
+    "manual": "⏸ checkpoint de Daniel",
+    "mixta": "◆ subagente con scripts",
 }
 
 
@@ -40,26 +40,11 @@ def compilar(G):
     aristas = G["aristas"]
     lazos = G.get("lazos", [])
 
-    # Feedback remains in the source graph and in the plan, but cannot be a
-    # prerequisite of the same iteration. Only EXPLICIT feedback is excluded.
-    if len(nodos) != len(G["nodos"]):
-        raise ValueError("IDs de nodo duplicados")
-    if len({a["id"] for a in aristas}) != len(aristas):
-        raise ValueError("IDs de arista duplicados")
-    feedback = []
     entradas = defaultdict(list)   # nodo <- aristas que lo producen
     for a in aristas:
         if a["from"] not in nodos or a["to"] not in nodos:
             sys.exit(f"✗ arista '{a['id']}' referencia nodos inexistentes")
-        role = a.get("plan_role", "dependency")
-        if role not in ("dependency", "feedback"):
-            raise ValueError(f"plan_role desconocido: {a['id']}")
-        if role == "feedback":
-            if not a.get("condition"):
-                raise ValueError(f"Feedback sin condición: {a['id']}")
-            feedback.append(a)
-        else:
-            entradas[a["to"]].append(a)
+        entradas[a["to"]].append(a)
 
     # capa de cada nodo = 1 + max(capa de sus fuentes); raíces = 0. Con guard de ciclos.
     capa, visitando = {}, set()
@@ -81,8 +66,7 @@ def compilar(G):
     # fase de una TRANSFORMACIÓN = capa de su artefacto destino
     fases = defaultdict(list)
     for a in aristas:
-        if a.get("plan_role") != "feedback":
-            fases[capa[a["to"]]].append(a)
+        fases[capa[a["to"]]].append(a)
 
     # lazos anclados: gate se corre al cerrar la fase que produce su ancla
     gates = defaultdict(list)
@@ -92,18 +76,10 @@ def compilar(G):
         if kind == "nodo" and ref in capa:
             gates[capa[ref]].append(l)
         elif kind == "arista" and ref in ar_by_id:
-            edge = ar_by_id[ref]
-            anchor = edge["from"] if edge.get("plan_role") == "feedback" else edge["to"]
-            gates[capa[anchor]].append(l)
-        else:
-            raise ValueError(f"Lazo sin ancla válida: {l.get('id')}")
+            gates[capa[ar_by_id[ref]["to"]]].append(l)
 
     plan = []
-    return_phases = defaultdict(list)
-    for edge in feedback:
-        return_phases[capa[edge["from"]]].append(edge)
-    for f in sorted(set(fases) | set(gates) | set(return_phases)):
-
+    for f in sorted(k for k in fases if k > 0):
         ts = fases[f]
         destinos = defaultdict(list)
         for a in ts:
@@ -124,7 +100,6 @@ def compilar(G):
             "fase": f,
             "paralelizable": len(grupos) > 1,
             "grupos": grupos,
-            "retornos": return_phases.get(f, []),
             "gates": [{"id": l["id"], "label": l["label"], "estado": l.get("estado", ""),
                        "referencia": l.get("referencia", "")} for l in gates.get(f, [])],
         })
@@ -134,7 +109,7 @@ def compilar(G):
 def render_md(G, plan):
     out = [f"# Plan de orquestación — {G['titulo']}",
            f"\n> Derivado DETERMINISTA del grafo `{G['slug']}` por grafo2plan.py — no es juicio, es topología.",
-           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS son candidatos a paralelismo; comprobar recursos compartidos;",
+           "> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;",
            "> los gates de la fase se corren ANTES de avanzar a la siguiente.\n"]
     for p in plan:
         par = " · ⚡ GRUPOS EN PARALELO" if p["paralelizable"] else ""
@@ -149,10 +124,6 @@ def render_md(G, plan):
             for l in p["gates"]:
                 ref = f" — referencia: {l['referencia']}" if l["referencia"] else ""
                 out.append(f"- ↻ {l['label']} [{l['estado']}]{ref}")
-        if p.get("retornos"):
-            out.append("\n**Retornos condicionales (nueva iteración; no ejecutar automáticamente):**")
-            for edge in p["retornos"]:
-                out.append(f"- `{edge['id']}` → `{edge['to']}`: {edge['condition']}")
         out.append("")
     return "\n".join(out)
diff --git a/arbrain/goal-compiler/scripts/test_grafo2plan.py b/arbrain/goal-compiler/scripts/test_grafo2plan.py
# solo en el lado izquierdo: 49 líneas (su texto está en esa copia; no se repite aquí)
```

### proyecto → global

```text
{proyecto => global}/goal-compiler/SKILL.md | 8 --------
 1 file changed, 8 deletions(-)
```

```diff
diff --git a/proyecto/goal-compiler/SKILL.md b/global/goal-compiler/SKILL.md
index 6f9f1ab..870f5bc 100644
--- a/proyecto/goal-compiler/SKILL.md
+++ b/global/goal-compiler/SKILL.md
@@ -83,7 +83,6 @@ No hagas un cuestionario. Pregunta unicamente lo que cambia el resultado y que n
 
 **Como preguntar las pocas que sobrevivan (mecanica de grilling / Matt Pocock, 22 jul 2026):**
 - **HECHOS vs DECISIONES.** Un HECHO se descubre explorando el entorno (archivos, codigo, BD, herramientas): buscalo TU, no lo preguntes. Solo las DECISIONES —lo que vive en la cabeza de Daniel y el modelo no puede inferir— se le ponen a el.
-- **Credenciales y saldo son HECHOS** (post-mortem del goal del SGI, 2026-10-01: el goal se paró dos veces, primero sin llave y luego sin saldo). Toda llave de la que dependa la DEFINICION DE HECHO se comprueba ANTES de entregar el bloque, sin imprimirla (presente/ausente, largo). Si el goal gasta en un proveedor, tambien el saldo de la cuenta y el tope propio de la llave (OpenRouter: `GET /api/v1/key`, `limit_remaining`, y `GET /api/v1/credits`), contra la estimacion de gasto del spec. Si falta la llave o el saldo no cubre, se dice antes de lanzar: se consigue, o lo que depende de ella sale del HECHO a una fase aparte.
 - **Una a la vez.** Si necesitas 2-4, hazlas de una en una esperando respuesta; varias juntas desconciertan y bajan la calidad de cada respuesta.
 - **Con respuesta recomendada.** Para CADA pregunta propon tu default marcado, para que Daniel confirme o corrija en vez de responder en frio. Rellenas el hueco, no solo lo señalas.
 
@@ -153,17 +152,10 @@ HECHO cuando (el evaluador solo ve esta conversacion, no corre comandos: surfea
   con antes/despues que demuestre movimiento/interaccion]
 - reporte de decisiones (que stack elegiste y por que)
 - lista las formas en que podria estar mal/incompleto y resuelvelas
-O BIEN, BLOQUEADO: si falta algo que solo da una persona (llave, saldo, firma, copia
-licenciada), detente y pega el bloqueo, quien lo destraba y el estado del grafo: eso
-tambien cierra el goal.
 RESTRICCIONES: [app web que corre con un comando; sin APIs de pago; lo que no se toca].
 RED DE SEGURIDAD: si tras [N] turnos no convergaes, detente y reporta el bloqueo.
 ````
 
-> **Por que el BLOQUEADO va dentro de HECHO** (post-mortem del goal del SGI, 2026-10-01): sin llave, la
-> condicion no podia cumplirse y el evaluador relanzo cientos de turnos vacios. La RED DE SEGURIDAD le pide al
-> agente que pare, pero quien decide si el goal termino es el evaluador, y solo acepta lo que la condicion dice.
-
 > ⛔ **NO metas "Corre con /effort max y Auto mode" (ni similares) DENTRO del bloque `/goal` (Daniel, 4 jul).**
 > El effort y el Auto mode los fija Daniel DESDE FUERA al lanzar; ponerlo en el prompt es redundante y gasta
 > caracteres del limite. El bloque solo lleva outcome + DoF + restricciones + red de seguridad.
```
