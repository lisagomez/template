# SDD — Análisis, optimización y alineación de Fase 7 (Enjambre de Ejecutores, hermes-os-a2a)

**Estado:** documento de **análisis retrospectivo**, generado desde este template el
2026-08-24. La Fase 7 que analiza **ya está cerrada en su proyecto de origen**
(`hermes-os-a2a`, dogfood real con motor LLM real aprobado el 2026-07-11). Este documento no
modifica ni implementa nada del enjambre — vive en otro repositorio, fuera del alcance de
escritura de esta sesión. Tampoco dispara C1 (CDC) de este template: no toca modelo, skill,
prompt ni `.mcp.json`/`settings.json` de este proyecto — es documentación nueva bajo `docs/`,
igual que su precedente.

**Fuente:** [`ROADMAP.md` de `lisagomez/hermes-os-a2a`, sección Fase 7](https://github.com/lisagomez/hermes-os-a2a/blob/master/businessos/ROADMAP.md#fase-7--enjambre-swarm-de-ejecutores-en-el-departamento-de-software--completa--dogfood-real-aprobado-2026-07-11-glm-52),
leída el 2026-08-24. PRP de origen citado: `.claude/PRPs/prp-fase7-swarm.md` (en ese repo).

**Precedente directo:** `docs/SDD-fase6-trio-hermes-ejecutor-supervisor.md` — analiza la Fase 6
del mismo proyecto origen (el trío Hermes-Negocio→Ejecutor→Supervisor) y **ya anticipaba
esta fase**: *"antes de que esa apuesta se replique a más departamentos (la Fase 7 ya la
asume: 'el enjambre de Ejecutores reutiliza estos servicios sin modificación')"*. Este
documento continúa exactamente esa lectura, un nivel más adelante en el roadmap.

**Propósito:** leer la Fase 7 con el lente de gobernanza de esta fábrica (C1-C7,
`.claude/gobernanza/GOBERNANZA.md`) y con sus convenciones de spec (`.claude/PRPs/prp-base.md`,
`docs/SDD-fase6-trio-hermes-ejecutor-supervisor.md`), para que sirva de **precedente
auditado** si este template llega a necesitar un patrón de fan-out/fan-in coordinado sobre
agentes con llaves.

---

## 1. El problema

La Fase 7 da el segundo paso de una apuesta que la Fase 6 dejó planteada: si un
"departamento" es una **configuración** (`software.toml`) sobre servicios genéricos, entonces
paralelizar no debería exigir un Ejecutor o un Supervisor distintos — solo un tercer servicio
que reparta y reintegre. Eso es exactamente lo que construye el Coordinador: **cero cambios**
en Ejecutor y Supervisor, un servicio nuevo que descompone una feature grande en un DAG de
sub-tareas, las reparte en paralelo respetando dependencias, y devuelve la integración al
mismo Supervisor de siempre para el veredicto final.

Es una apuesta más agresiva que la de Fase 6 en un eje concreto: ahora hay **múltiples
Ejecutores escribiendo en paralelo** bajo un mismo padre, con presupuesto compartido y
alcances que deben quedar disjuntos por diseño, no por convención. Antes de que el propio
roadmap declare esto "replicable a otros departamentos sin código nuevo, solo configuración"
—la misma frase que motivó auditar la Fase 6 antes de que se replicara—, vale hacer la misma
pregunta: **¿qué de esto ya está gobernado, y qué se está dando por sentado?**

## 2. Principio de diseño (ya alineado)

> "Aislar, no fundir" · "Acotar antes de escalar" · "Verificar antes de confiar"

Los tres principios declarados en el roadmap ya son, sin haberlos tomado de aquí, principios
que este template exige en general:

- **"Aislar, no fundir"** es la misma disciplina de worktrees aislados que Fase 6 ya aplicaba
  por tarea — aquí se extiende a que cada sub-tarea sea una fila `tarea` **válida del
  contrato existente**, no un tipo de dato nuevo. No se inventa un segundo contrato para el
  caso paralelo.
- **"Acotar antes de escalar"** es la forma concreta de O4 (denial-of-wallet) que las Reglas
  de Código de este template piden declarar antes de construir: fan-out máximo +
  presupuesto acumulado como límite duro, no como aspiración.
- **"Verificar antes de confiar"** es literalmente la regla de este template — *"las salidas
  del LLM NO se confían por diseño: quien verifica re-ejecuta los gates de cero"*— aplicada
  ahora a la **rama integrada**, no solo a cada sub-tarea individual: el Supervisor
  re-verifica el todo, no confía en que la suma de veredictos parciales sea el veredicto
  final.

El hallazgo positivo se mantiene: dos proyectos distintos (este template y `hermes-os-a2a`)
llegan a la misma tríada de principios por caminos distintos — señal de que la regla es
correcta, no coincidencia de vocabulario.

## 3. Topología

Aplicando el diagnóstico loop-vs-grafo de `.claude/skills/goal-compiler/SKILL.md` (el mismo
usado en el SDD de Fase 6): ¿contextos especializados separados? (sí: Coordinador planifica,
Ejecutor ejecuta, Supervisor valida — tres roles, no uno) — ¿fan-out/fan-in real? (sí, y ahora
literal: una feature se reparte en N sub-tareas paralelas y se reintegra en una sola rama) —
¿flujo legible como diagrama? (sí) — ¿el objetivo cambia por nodo? (sí: "planificar" no es
"ejecutar" no es "validar"). Cuatro síes → sigue siendo **grafo**, y el enjambre lo hace más
explícito que el trío: ahora el fan-out no es metafórico, es paralelismo real con integración
posterior.

```
                         ┌──────────── validar_plan (DAG) ────────────┐
                         │        aciclicidad · alcances disjuntos     │
Hermes-Negocio ──feature──▶ Coordinador                                │
                         │  (fan-out + reintento,                     │
                         │   fan_out_max, presupuesto_usd)             │
                         └──────┬──────────────┬──────────────┬───────┘
                                │              │              │
                          tarea hija      tarea hija      tarea hija
                       (parent_id, task_id) (paralela)   (dependiente)
                                │              │              │
                            Ejecutor       Ejecutor       Ejecutor
                          (sin cambios — reutilizado de Fase 6, worktree aislado c/u)
                                │              │              │
                                └──────┬───────┴──────┬───────┘
                                       ▼               ▼
                              merge a rama tarea/<parent_id>
                                       │
                                  Supervisor
                          (re-verifica la RAMA INTEGRADA completa,
                           sin cambios — mismo Supervisor de Fase 6)
                                       │
                                  VEREDICTO final
                            ┌──────────┴──────────┐
                        aprobado                rechazado
                     (gate humano de siempre       (hallazgos +
                      para lo irreversible)         reintento)
```

- **Nodos = artefactos**, no roles: `plan` (Coordinador), `tarea` hija (`parent_id`, `task_id`
  para atribución exacta de gasto), rama integrada, `VEREDICTO`.
- **Aristas = transformaciones tipadas**: `validar_plan` es una arista nueva (valida el DAG
  *antes* de que exista una sola fila hija), no un chequeo posterior.
- **El lazo sigue siendo el Supervisor** — sin cambios respecto a Fase 6 — pero ahora su
  sensor es la **rama integrada de N sub-tareas**, no una sola tarea: la propiedad que hace
  confiable al sistema (quien ejecuta no se audita a sí mismo) se preserva exactamente igual
  al escalar de 1 a N ejecutores, porque el punto de verificación no se distribuyó — se dejó
  concentrado a propósito.

## 4. Qué se verifica

| Componente | Tests | Cobertura declarada |
|---|---|---|
| `ejecutor-a2a` (reutilizado) | 35 | mecánica de ejecución, sin cambios de Fase 6 |
| `coordinador-a2a` (nuevo) | 41 | fan-out + reintento, `MockPlanner` |
| `trio-contrato` extendido | 36 | `validar_plan` + DAG (aciclicidad, alcances disjuntos) |
| **Total capa A (mecánica)** | **112** | verdes, con `MockEngine`/`MockPlanner` — coste cero en tokens |
| Dogfood real (2026-07-11) | 1 caso end-to-end | motor real GLM-5.2, **8/8 gates en verde** |

El dogfood es el dato más fuerte del documento: no es una simulación. `dogfood-swarm-1`
planificó 3 sub-tareas reales (2 paralelas + 1 dependiente), gastó **$1.62 de un presupuesto
de $2** (el corte de presupuesto operó, no solo existe en el código), integró 4 archivos
nuevos limpiamente, y el Supervisor dio veredicto **APROBADO** con los 8 gates en verde —
los mismos 8 de `software.toml` que la Fase 6 ya documentó (incluidos los 2 inactivos por
falta de runner: `codigo_review`, `security_review` — ese hueco declarado no se cerró en esta
fase, sigue igual de abierto).

**Lo que falta, con la misma forma que en Fase 6:** 112 tests son capa A (camino feliz,
determinista). No hay capa B — casos-trampa específicos del enjambre. Ver C2 más abajo.

## 5. Análisis de alineación con la gobernanza de la fábrica (C1-C7)

### C7 · `service_role` y RLS — mejora real sobre Fase 6, con el mismo hueco de fondo

Fase 6 dejaba la tabla `tareas` como *"RLS sin políticas (solo `service_role`)"* — un hueco
silencioso. Fase 7 introduce algo mejor, aunque no lo declare en esos términos: **escritura
por fila, separada por rol**. El Coordinador solo escribe filas con `es_padre=true`; cada
Ejecutor solo escribe su propia fila hija, identificada por `parent_id`. Eso es una
separación **estructural** — el tipo que este template prefiere sobre la configuración
correcta, porque "equivocarse en una configuración no produce ningún síntoma". Vale nombrarlo
como avance real, no solo como pendiente.

Pero la separación por fila es una propiedad de **aplicación** (quién decide qué escribir),
no de **RLS** (qué puede escribir la conexión). Con `service_role` (BYPASSRLS) todavía
mediando el acceso, nada en la base impide que un bug en el Coordinador escriba en la fila
de un Ejecutor, o viceversa — la garantía vive enteramente en la disciplina del código, no en
una política verificable por Postgres. El mismo hueco de fondo de Fase 6 persiste: falta la
línea explícita —*"`tareas` es superficie de plataforma (C7): solo `coordinador-a2a` y
`ejecutor-a2a` escriben, con `service_role`, sin acceso de usuario final; RLS por fila queda
pendiente hasta el alta del primer cliente externo"*— que convierte "no hay RLS" en una
decisión declarada en vez de una omisión.

### C3 · Modelo de amenazas — el Planner es una superficie de ataque nueva

El roadmap no trae modelo de amenazas formal (igual que Fase 6). Con el catálogo O1-O6 de
esta fábrica, y con el dato nuevo del dogfood real:

| Activo | Atacante más relevante | Control ya presente | Hueco |
|---|---|---|---|
| Presupuesto agregado del enjambre (`presupuesto_usd`, `gasto_usd`) | **O4** — denial-of-wallet, ahora multiplicado por N sub-tareas paralelas | `fan_out_max` + presupuesto acumulado, **verificado en producción** (corte operó: $1.62 de $2) | No está documentado qué pasa si el corte se activa **a mitad de una sub-tarea en ejecución**: ¿se aborta el worktree en curso, o se deja terminar y solo se bloquea la siguiente? |
| El `plan` que arma el Coordinador | **O1** — inyección de requerimientos, ahora con superficie ampliada: una sola descripción maliciosa en la feature puede propagarse a N sub-tareas hijas | `validar_plan` rechaza ciclos y alcances no disjuntos — mitiga estructura, no contenido | Nada en el DAG valida el *contenido* de cada sub-tarea heredada; el Supervisor sigue siendo el único punto que re-verifica comportamiento real |
| Alcances de sub-tareas paralelas | O6 — compromiso por colisión de escritura | "alcances disjuntos" como invariante de `validar_plan` | El roadmap no dice qué pasa si dos sub-tareas *legítimamente* necesitan tocar el mismo archivo (ej. un `package.json` compartido) — ¿se rechaza el plan, o se serializa? |
| Motor de planificación real (GLM-5.2 vía z.ai) | **O5** — cadena de suministro, mismo hallazgo que Fase 6 hizo sobre el motor del Ejecutor | Ninguno declarado en el roadmap de Fase 7 | Sigue sin declararse si el Planner en modo real va pineado por versión exacta — la misma pregunta abierta de Fase 6, ahora también sobre un componente que decide *cuánto se gasta*, no solo *qué se ejecuta* |

### C4 · Evaluación de impacto (AISIA) — el residual documentado es el mismo patrón de Fase 6

*¿A quién se daña si el sistema opera bien y se equivoca?* El propio roadmap documenta un
residual honesto: *"`gasto_usd` fila padre = 0 — por diseño; `token_usage.task_id` es la
fuente de verdad"*. Es exactamente la misma forma de riesgo que Fase 6 marcó con los gates
inactivos que "se leen igual que uno que pasó": un humano que consulte la fila padre de
`tareas` sin conocer este residual puede leer "gasto: $0" y concluir que la planificación fue
gratis, cuando en realidad el dato vive en otra tabla. No es un bug — es, otra vez, un dato
correcto que se **comunica** de forma que invita al error de lectura (riesgo O3, fatiga de
aprobación, aplicado no a un gate sino a una cifra).

| Punto | Respuesta preliminar |
|---|---|
| Partes afectadas | La dueña de `hermes-os-a2a` (decide si confía en el presupuesto reportado por fila) |
| Daño con el sistema operando "bien" | Lectura errónea de `gasto_usd` en la fila padre; herencia incompleta de `modelo_pref` padre→hijo, ya detectada y corregida como gotcha — pero es la clase de bug que este mismo control (AISIA) habría anticipado antes de construir, no después |
| Reversibilidad | Alta — el `VEREDICTO` sigue detrás de gate humano para lo irreversible, sin cambios respecto a Fase 6 |
| Vía de apelación | Implícita, igual que en Fase 6: no está descrita como tal |

### C5 · Registro de riesgo — segunda instancia del mismo hallazgo, ahora con evidencia real

Fase 6 ya señaló que el ruteo de costo real (GLM-5.2, presupuesto declarado) es un riesgo
propio y firmable en términos de C5, y que documentarlo solo en la prosa del roadmap no basta.
El dogfood de Fase 7 es la **segunda ejecución real con dinero real** ($1.62 gastados) bajo la
misma política no formalizada. Dos instancias del mismo patrón sin que el patrón se haya
corregido entre una y otra es, en los términos de este template, exactamente lo que un
registro append-only existe para evitar: que la decisión, su fecha y su alcance ($2
presupuestado, un motor, 3 sub-tareas) quedaran auditables la primera vez, no solo
mencionadas dos veces en el roadmap.

### C1 · CDC — el Planner hereda el hueco de `software.toml`, con un radio mayor

Fase 6 señaló que `software.toml` decide qué aprueba y rechaza el Supervisor para todo el
departamento, sin gate declarado para cambiarlo. El Planner de Fase 7 (`planner.py`) es la
misma clase de componente, con un radio **adicional**: no solo decide criterios de
aprobación, decide **qué sub-tareas existen y cuánto presupuesto recibe cada una**. Con
`MockPlanner` como default (determinista, sin costo) y un motor real (GLM-5.2) ya probado en
producción, el cambio de uno a otro —o cualquier ajuste al prompt/lógica que descompone una
feature en DAG— es un cambio de comportamiento de todo el enjambre, para siempre, hasta el
siguiente cambio. El roadmap no menciona un gate para ese archivo, igual que no lo mencionaba
para `software.toml`.

### C2 · Regresión — falta la capa adversarial, ahora con casos propios del paralelismo

112 tests verdes son una capa A sana. La capa B específica del enjambre —ausente— debería
cubrir al menos:

- Un `plan` con ciclo en el DAG (¿`validar_plan` lo rechaza limpio, con hallazgo, o falla
  silenciosamente?).
- Dos sub-tareas con alcances que se solapan (el caso que la tabla de C3 ya identificó como
  no resuelto).
- Un Coordinador que intenta exceder `fan_out_max` — ¿se trunca el plan, se rechaza entero, o
  se ejecuta parcialmente sin que nadie lo note?
- Un Ejecutor hijo que reporta éxito individual mientras la integración de la rama completa,
  al pasar por el Supervisor, revela una regresión que solo aparece al combinar dos
  sub-tareas — el caso que prueba que "verificar antes de confiar" se aplica de verdad a la
  rama integrada y no solo a cada parte.

### Frontera de departamentos — el disparador ya llegó

El roadmap cierra con la frase que motiva releer este documento antes de que se actúe sobre
ella: *"el patrón es replicable a otros departamentos sin código nuevo, solo
configuración"*. `.claude/memory/project/infraestructura-agentes.md` ya fijó en este template
la regla que debería decidir esa replicación: la frontera entre verticales de agentes **no es
organizativa, es de radio de daño** — la misma que separa lo firmable (C5) de lo infirmable.
Antes de que un segundo departamento reutilice Coordinador+Ejecutor+Supervisor con solo un
`.toml` nuevo, la pregunta que debería decidir su diseño es la misma que ya quedó escrita:
**¿ese departamento puede tocar dinero de terceros o datos de clientes sin que un humano lo
vea antes?** Si la respuesta es sí, necesita su propio Supervisor con reglas más estrictas —
la config de Fase 6/7 no basta solo porque el mecanismo ya esté probado.

## 6. Qué cierra este documento y qué no

**Cierra**: una lectura completa de la Fase 7 con el lente de gobernanza de esta fábrica, y
una lista concreta de huecos — la mayoría, otra vez, no son errores de diseño sino
**decisiones correctas que faltan por escribirse** (C7 como mejora real pero aún sin política
RLS, C5 como segunda instancia del mismo riesgo sin registrar, C1 sobre el Planner). El
principio de diseño central del enjambre (aislar-no-fundir, acotar-antes-de-escalar,
verificar-antes-de-confiar, Supervisor único e inmutable) ya está alineado con lo que este
template exige, y el dogfood real con motor LLM da evidencia de que el mecanismo funciona en
producción, no solo en simulación.

**No cierra**: nada de esto se implementa desde aquí — el enjambre vive en otro repositorio,
y las decisiones (declarar `tareas` como plataforma con su regla de escritura por fila,
abrir un registro de riesgo para el gasto real ya ejecutado dos veces, CDC sobre el Planner,
capa B de regresión para el paralelismo, y la pregunta de radio-de-daño antes de replicar a
un segundo departamento) las toma la dueña de `hermes-os-a2a`. Este documento es la
auditoría, no el CDC.
