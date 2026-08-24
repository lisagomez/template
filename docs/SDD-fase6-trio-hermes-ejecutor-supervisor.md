# SDD — Análisis, optimización y alineación de Fase 6 (trío Hermes→Ejecutor→Supervisor)

**Estado:** documento de **análisis retrospectivo**, generado desde este template el
2026-08-24. La Fase 6 que analiza **ya está cerrada en su proyecto de origen**
(`hermes-os-a2a`, dogfood real completado 2026-07-11, bug crítico cerrado el mismo día).
Este documento no modifica ni implementa nada de ese trío — vive en otro repositorio, fuera
del alcance de escritura de esta sesión. Tampoco dispara C1 (CDC) de este template: no toca
modelo, skill, prompt ni `.mcp.json`/`settings.json` de este proyecto — es documentación
nueva bajo `docs/`.

**Fuente:** [`ROADMAP.md` de `lisagomez/hermes-os-a2a`, sección Fase 6](https://github.com/lisagomez/hermes-os-a2a/blob/master/businessos/ROADMAP.md#fase-6--departamentos-operados-por-el-tr%C3%ADo-hermesejecutorsupervisor--tr%C3%ADo-vivo-en-runtime-2026-07-08-dogfood-real--decisi%C3%B3n-de-la-due%C3%B1a), leída el 2026-08-24.

**Propósito:** leer la Fase 6 con el lente de gobernanza de esta fábrica (C1-C7,
`.claude/gobernanza/GOBERNANZA.md`) y con sus convenciones de spec (`.claude/PRPs/prp-base.md`,
`docs/SDD-hermes-verificacion.md`), para que sirva de **precedente auditado** si este
template llega a necesitar un patrón similar de departamentos operados por agentes.

---

## 1. El problema

La Fase 6 demuestra algo específico: que un "departamento" no tiene que ser un agente
dedicado, sino una **configuración** de reglas (`software.toml`) sobre un par de servicios
genéricos (Ejecutor, Supervisor) orquestados por un tercero (Hermes-Negocio). Es una
apuesta de diseño fuerte — y correcta, si se sostiene — porque significa que el "Departamento
de Marketing" de mañana no es código nuevo, es un `marketing.toml` nuevo.

Antes de que esa apuesta se replique a más departamentos (la Fase 7 ya la asume: "el
enjambre de Ejecutores reutiliza estos servicios sin modificación"), vale la pena hacer la
misma pregunta que este template le hace a cualquier cosa que opere agentes con llaves:
**¿qué de esto ya está gobernado, y qué se está dando por sentado?**

## 2. Principio de diseño (ya alineado)

> "Copiloto, no autopiloto": Supervisor automático a nivel de regla, humano obligatorio en
> lo irreversible (merge a main, deploy, contacto con cliente, movimiento de dinero).

Este es el hallazgo positivo principal, y vale decirlo explícitamente: **el trío ya
implementa, sin haberlo tomado de aquí, el mismo patrón que este template exige en
PRP-001** (`.claude/PRPs/PRP-001-canal-slack-agentes.md`) — separar **proponer/ejecutar**
(barato, automatizable) de **aprobar lo irreversible** (caro, gate humano). El Supervisor
determinista sin SDK de modelo es, además, el mismo principio que
`docs/SDD-hermes-verificacion.md` aplica a su propio vigilante: *"un vigilante que depende
del agente falla exactamente cuando el agente falla"*. Dos proyectos distintos llegaron a la
misma regla por caminos distintos — es una señal de que la regla es correcta, no una
coincidencia.

## 3. Topología del trío

Aplicando el diagnóstico loop-vs-grafo de `.claude/skills/goal-compiler/SKILL.md`: cuatro
preguntas — ¿contextos especializados separados? (sí: Ejecutor ejecuta, Supervisor valida,
Hermes orquesta) — ¿fan-out/fan-in real? (sí: una tarea se reparte y el veredicto vuelve) —
¿flujo legible como diagrama? (sí) — ¿el objetivo cambia por nodo? (sí: "ejecutar" no es
"validar por reglas"). Cuatro síes → **es un grafo**, no un loop de un solo agente, y el
propio test de colapso lo confirma: no se puede fusionar Ejecutor y Supervisor en un mismo
agente sin perder la propiedad que hace confiable al sistema — que quien ejecuta no se
audite a sí mismo.

```
Hermes-Negocio ──TAREA (JSON-RPC, A2A-Version:1.0)──▶ Ejecutor
                                                          │
                                                    worktree aislado
                                                    (jamás main)
                                                          │
                                                     RESULTADO
                                                          ▼
                                                     Supervisor
                                                (reglas deterministas,
                                                 sin SDK de modelo,
                                                 re-ejecuta gates él mismo)
                                                          │
                                                     VEREDICTO
                                                          ▼
                                        ┌─────────────────┴─────────────────┐
                                    aprobado                            rechazado
                                (¿reversible?)                    (hallazgos + reintento
                                        │                          con tope)
                          ┌─────────────┴─────────────┐
                    sí → Ejecutor aplica          no → gate humano
                                                  (merge, deploy, dinero,
                                                   contacto con cliente)
```

- **Nodos = artefactos**, no roles vagos: `TAREA`, `RESULTADO`, `VEREDICTO` (contrato
  `trio-contrato/contrato.py`, ciclo 1:1 a SPEC §7.2).
- **Aristas = transformaciones tipadas**: JSON-RPC verificado con reintento acotado, nunca
  llamada directa sin contrato.
- **El lazo es el Supervisor**: sensor = resultado real sobre el worktree; referencia =
  `software.toml`; el comparador **re-ejecuta** los gates en vez de confiar en lo que
  reporta el Ejecutor — es la misma disciplina de "verificar, no confiar en la salida del
  LLM" que las Reglas de Código de este template exigen en general.

## 4. Qué se verifica — los 8 gates de `software.toml`

| # | Gate | Estado (según el roadmap) |
|---|------|------|
| 1 | `build` | activo |
| 2 | `typecheck` | activo |
| 3 | `lint` | activo |
| 4 | `tests` | activo |
| 5 | `codigo_review` | **inactivo** — sin runner |
| 6 | `security_review` | **inactivo** — sin runner |
| 7 | `integración` | activo |
| 8 | `documentación` | activo |

El invariante declarado — *"gate no corrible = rechazo con hallazgo, jamás asumido"* — es
exactamente el control negativo correcto: un gate ausente no se cuenta como aprobado por
omisión. Es la misma forma que el exit code `2` ("no pude verificar", nunca confundido con
`0`) de `docs/SDD-hermes-verificacion.md` §8. Dos de ocho gates inactivos por falta de
runner queda como **hueco declarado, no oculto** — correcto en el diseño, pendiente en la
cobertura real.

## 5. Análisis de alineación con la gobernanza de la fábrica (C1-C7)

### C7 · `service_role` y RLS — el hallazgo más importante

El roadmap describe la tabla `tareas` así: *"RLS sin políticas (solo service_role)"*. Leído
con la regla de este template — *"`service_role` tiene BYPASSRLS: las superficies de
negocio NO lo usan. Solo migraciones, webhooks verificados y jobs de plataforma, cada uno
declarado"* — esto es exactamente la forma del anti-patrón que C7 existe para prohibir,
**salvo que la tabla `tareas` se declare explícitamente como superficie de plataforma y no
de negocio**.

Hay un argumento real a favor de que sí lo es: `tareas` la escriben solo dos servicios A2A
internos (Ejecutor como único escritor, según el roadmap), no una superficie con usuarios
finales — no hay "segundo tenant" todavía, que es el disparador real de migración según
`.claude/memory/project/infraestructura-agentes.md`. Pero ese argumento **no está escrito
en ningún lado del roadmap** — vive implícito. La optimización concreta: una línea explícita
del tipo *"`tareas` es superficie de plataforma (C7): solo `ejecutor-a2a` y `supervisor-a2a`
escriben, sin acceso de usuario final; se revisa en el alta del primer cliente externo"*
convierte un hueco silencioso en una decisión declarada — que es, además, justo lo que este
mismo documento le pide a la Fase 6 en el punto de C5 más abajo.

### C3 · Modelo de amenazas — no existe uno formal

El roadmap no trae una sección de modelo de amenazas. Con el catálogo O1-O6 de esta
fábrica, una primera versión sería:

| Activo | Atacante más relevante | Control ya presente |
|---|---|---|
| Presupuesto de tokens (`presupuesto_usd`, ruteo GLM-5.2) | **O4** — denial-of-wallet | Límite declarado por tarea; falta un techo agregado por ventana de tiempo |
| La tarea que arma Hermes-Negocio | **O1** — inyección de requerimientos (una tarea con instrucción maliciosa incrustada) | El Supervisor re-ejecuta gates sobre el resultado real, no confía en lo que dice el Ejecutor — mitiga el efecto, no la causa |
| Worktree del Ejecutor | O6 — compromiso de servicio | Aislado por tarea, "jamás main" |
| Imagen del motor (`ClaudeAgentEngine`, CLI de Claude Code) | **O5** — cadena de suministro | No declarado si el CLI/SDK va pineado por versión exacta; el hallazgo de este template en `docs/SDD-hermes-verificacion.md` (tags no son inmutables) aplica igual aquí |

### C4 · Evaluación de impacto (AISIA) — no existe una formal

*¿A quién se daña si el sistema opera bien y se equivoca?* El roadmap no lo pregunta.
Primer intento:

| Punto | Respuesta preliminar |
|---|---|
| Partes afectadas | La dueña (confía en el veredicto "aprobado" para decidir si mergea) |
| Daño con el sistema operando "bien" | Un gate **inactivo** (`codigo_review`, `security_review`) se lee, a simple vista, igual que uno que pasó — el invariante de "rechazo si no hay runner" lo evita en el veredicto, pero **no** en cómo se comunica el resultado a un humano apurado (fatiga de aprobación, O3) |
| Reversibilidad | Alta dentro del worktree; el punto de no-retorno real (merge a `main`) ya está correctamente detrás de gate humano |
| Vía de apelación | Implícita (el humano decide en el merge); no está descrita como tal |

### C5 · Registro de riesgo — la "decisión de la dueña" debería quedar trazable

El roadmap cierra la fase con: *"El dogfood real con tokens es el siguiente paso: decisión
de la dueña"*, y documenta el ruteo de costo (GLM-5.2 vía z.ai, presupuesto $1) como
"política versionada en `negocio/MEMORY.md`". Es exactamente un **riesgo propio y
firmable** en los términos de C5 de este template — nadie más que la dueña carga ese
presupuesto ni esa decisión. La optimización: que viva en un registro **append-only**
dedicado (equivalente a `REGISTRO-RIESGO.md`), no solo en la prosa del roadmap y un archivo
de memoria de negocio — para que la decisión, su fecha y su alcance ($1, un motor, una
tarea) queden auditables después de que el roadmap se siga escribiendo encima.

### C1 · CDC — `software.toml` es superficie de comportamiento sin gate declarado

`reglas/software.toml` es, en efecto, "config versionada" — pero cambiar sus reglas cambia
qué aprueba y qué rechaza el Supervisor para **todo** el departamento de software, para
siempre, hasta el próximo cambio. Es el mismo radio que un cambio de skill o de modelo en
este template. El roadmap no menciona un gate (diff + aprobación + regresión) para ese
archivo — encajaría exactamente en la forma de C1: ningún archivo que decide qué pasa y qué
no debería cambiar sin que alguien lo note.

### C2 · Regresión — falta la capa adversarial

158 tests verdes es una capa A real y sana (mecánica, determinista). Lo que no aparece es
una capa B — casos-trampa específicos del trío: ¿qué pasa si Hermes-Negocio arma una tarea
con una instrucción de inyección incrustada en la descripción? ¿Qué pasa si el Ejecutor
reporta éxito y el Supervisor, al re-ejecutar, encuentra lo contrario — el camino ya
probado— pero con una discrepancia deliberada, no accidental? Esos son los casos que
prueban el control, no solo el camino feliz.

### Colisión de nombre — "Hermes"

En este template, "Hermes" nombra un producto de infraestructura concreto
(`nousresearch/hermes-agent`, contenedor con dashboard — ver
`docs/FASE0-INFRAESTRUCTURA.md` y `docs/SDD-hermes-verificacion.md`). En el roadmap de
`hermes-os-a2a`, "Hermes-Negocio" es el orquestador propio del trío — otro software, mismo
nombre. Si ambos proyectos llegan a compartir vocabulario, equipo o documentación, esta
colisión va a costar una confusión real la primera vez que alguien lea "Hermes" fuera de
contexto. Vale nombrarla ahora que es barato, no cuando ya cueste desenredarla.

### Frontera de departamentos — aplicar la lección de "radio de daño"

`.claude/memory/project/infraestructura-agentes.md` documenta una decisión ya tomada en
este template: la frontera entre verticales de agentes **no es organizativa, es de radio de
daño** — es la misma frontera que separa lo firmable (C5) de lo infirmable. "Desarrollo de
Software" como primer departamento de la Fase 6 encaja bien con esa lente exactamente por
la razón que el roadmap da: *"no depende del grafo"* y su daño queda contenido en un
worktree que nunca toca `main` sin humano. Cuando llegue el segundo departamento, la
pregunta que debería decidir su diseño no es "¿qué área del organigrama sigue?" sino "¿este
departamento puede tocar dinero de terceros o datos de clientes sin que un humano lo vea
antes?" — si la respuesta es sí, necesita su propio Supervisor con reglas más estrictas, no
el mismo `software.toml` reconfigurado.

## 6. Qué cierra este documento y qué no

**Cierra**: una lectura completa de la Fase 6 con el lente de gobernanza de esta fábrica,
y una lista concreta de huecos — la mayoría no son errores de diseño sino **decisiones
correctas que faltan por escribirse** (C7 como excepción declarada, C5 como entrada
firmada, C1 sobre `software.toml`). El principio de diseño central del trío
(copiloto-no-autopiloto, Supervisor sin LLM, worktree aislado) ya está alineado con lo que
este template exige en sus propios PRPs de agentes.

**No cierra**: nada de esto se implementa desde aquí — el trío vive en otro repositorio, y
las decisiones (declarar `tareas` como plataforma, abrir un registro de riesgo, pinear el
motor por versión exacta) las toma la dueña de ese proyecto. Este documento es la auditoría,
no el CDC.
