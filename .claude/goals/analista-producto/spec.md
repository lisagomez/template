# Analista de producto — un rol con contrato A2A que encuentra dónde duele y propone productos product first — Spec

## EL PEDIDO (del laboratorio, 2026-10-02)

> «planea el rol de A2A que revise el repositorio para un análisis de identificación de puntos de
> dolor (problemas) con casos de uso por categoría con las soluciones que ofrecen la combinación de
> herramientas, APPs y arquitectura para propuesta de productos con enfoque product first»

Junto al pedido llegó un **plan borrador** escrito desde fuera del repo: su autor solo pudo leer el
README y los títulos de los PR, no `tools/`, `docs/` ni `.claude/`. **Ese plan es una hipótesis de
entrada, no un requisito.** Lo que dice de sí mismo el repo se confirma o se refuta con evidencia;
lo que el plan propone como diseño es sugerencia descartable.

Decisión del laboratorio, preguntada antes de compilar: los entregables son **análisis, SDD, PRP,
skill y contrato A2A**. Esto descarta las otras dos formas: no hay servicio A2A vivo en este goal
(queda planeado en el PRP como fase con gate humano), y no basta con un análisis de una sola vez.

## MISIÓN

Que la fábrica tenga un **radar de producto**: un rol que cualquiera (el laboratorio, una sesión
de Claude Code u opencode y, más adelante, otro agente por A2A) puede lanzar sobre el repo y que
devuelve, con evidencia citada, **dónde duele, a quién, cuánto, y qué producto lo resolvería
recombinando lo que el monorepo ya tiene**.

Cuando termines, tienen que existir cinco cosas, y la quinta prueba que las otras cuatro sirven:

1. **El diseño del rol** (`docs/SDD-<nombre>.md`, convención de los SDD de aquí): el pipeline, la
   regla de evidencia, el contrato A2A, los estados de una tarea, las decisiones con su porqué y
   **qué no se construye**.
2. **El plan por fases** (`.claude/PRPs/PRP-008-<nombre>.md`, sobre `prp-base.md`). El QUÉ del rol
   ya está acordado y solo falta el plan, así que va **PRP directo, sin spec** (regla del decision
   tree: nunca los dos para lo mismo). La fase 1 es lo que construye este goal. La fase 2 es el
   **servicio A2A vivo en la red interna** y queda planeada, no construida, con sus gates explícitos:
   modelo de amenazas de la superficie (C3), evaluación de impacto (C4), una clase de routing para su
   motor (C8), contabilidad de tokens, y **la decisión de flujo de datos**: un motor LLM en el
   servidor hace que el contenido del repo salga a un proveedor.
3. **El skill del rol** en `.claude/skills/`, invocable con `/nombre` y activable por el modelo. Es
   de solo lectura sobre el repo y **solo escribe en `docs/analisis/`**.
4. **El contrato A2A del rol**: su Agent Card y el ciclo de estados de sus tareas, **tipados con el
   SDK que el repo ya fija (`@a2a-js/sdk` 1.1.0)** como hace `src/features/a2a/tarjeta.ts`, y con una
   prueba. Es contrato, **no superficie**: no se sirve por ninguna ruta.
5. **La primera corrida del skill sobre este repo** (`docs/analisis/<fecha>/`): el análisis que pidió
   el laboratorio, hecho por el rol que acabas de construir. Es la evidencia de que el rol funciona,
   y es el entregable que el laboratorio va a leer.

### Lo que el análisis tiene que dar (al horizonte, no un MVP)

- **Cobertura total del inventario.** Todo activo de `inventario/activos.json` de clase PRODUCTO, y
  los de FABRICA que tengan usuario, aparece revisado: con dolores, o con «sin dolor con
  evidencia». Ausente no es cero: un activo que no se miró se declara no mirado.
- **Dolores con evidencia graduada.** Cada hallazgo cita una ruta (con línea si aplica), un commit,
  un PR, una entrada de registro o el comando que produjo una cifra. La evidencia se gradúa: medida
  (un script la produce), registrada (incidente, riesgo, bitácora), declarada (un documento la
  afirma) o **hipótesis** (no hay cita). **Un dolor sin cita no entra como hallazgo**: va a una
  sección aparte de hipótesis, con lo que haría falta para confirmarlo.
- **Casos de uso por categoría**: quién, en qué momento, qué intenta hacer, qué se lo impide y cuánto
  le cuesta (con cifra medida, o «no medido», nunca una cifra inventada).
- **Árbol dolor → caso de uso → oportunidad → propuesta.** Una propuesta sin dolor detrás no existe.
- **Priorización con veto.** Puntúa como mejor justifiques (el borrador sugiere frecuencia ×
  severidad × solidez de evidencia × reuso del stack ÷ esfuerzo). C3 (¿quién ataca?) y C4 (¿a quién
  dañamos sin atacante?) **vetan, no ponderan**: un candidato con daño a terceros sin mitigar no se
  prioriza, porque ese daño no es firmable. Va aparte, con su motivo.
- **One-pagers product first** de los candidatos que suban: abren con el **usuario, la tarea que hoy
  le cuesta y cuánto le cuesta**. Después vienen la promesa y la métrica de éxito. La tecnología va
  al final y, por defecto, como **recombinación de activos `TPL-*` que ya existen**, con lo que falta
  construir declarado. Cada uno lleva: app o herramienta (los dos caminos del README), producto
  existente cuyo contrato cambiaría o «producto nuevo → `/new-app`», amenazas, terceros afectados,
  fuera de alcance, y el **handoff recomendado** (`/prp` si el QUÉ está claro, `/spec-generator` si
  no), recomendado y no ejecutado.
- **Veredicto de las seis hipótesis del borrador** (tabla de abajo): confirmada, refutada o sin
  evidencia, cada una con su cita. Incluye su «lectura preliminar» (que el extractor de CFDI es el
  candidato más vendible): se sostiene o se refuta con datos, no se hereda.
- **Corridas comparables.** La salida de cada corrida se guarda fechada y en formato de máquina
  (además del Markdown para el laboratorio), de modo que la segunda corrida pueda decir **qué
  dolores se cerraron (y con qué commit o PR), cuáles nacieron y cuáles persisten**. En esta primera
  corrida basta con que el formato lo permita y el SDD lo diga.

### Las hipótesis del borrador (a confirmar o refutar en la corrida)

| # | Categoría | Dolor que el borrador supone | Lo que cita (sin verificar) |
|---|---|---|---|
| H1 | Documentos fiscales MX | capturar y conciliar CFDI a mano, con errores | el extractor documental: OCR, códigos, revisión humana, complementos CFDI contra XSD |
| H2 | Voz y dictado | funciona en el laboratorio, no para usuarios | «nueve huecos» entre laboratorio y usuario (PR #127); instalador de un paso con ≤6 acciones (PR #132) |
| H3 | Coste de operar agentes | contexto y sesiones caros | cinco MCP ≈ 20k tokens por sesión; una sesión de fábrica de 162 USD |
| H4 | Confianza y gobernanza | deriva silenciosa, controles que parecen funcionar | Hermes con 11 releases de rezago; capa B halló 4 afirmaciones falsas en un runbook; «151 comprobaciones» |
| H5 | Operación e infraestructura | respaldo que es una creencia | GATE 1 y GATE 3 de la Fase 0 |
| H6 | Portabilidad entre arneses | reglas que existen en un arnés y no en otro | opencode no expande imports `@ruta` |

Las categorías tampoco son fijas: si la evidencia pide otras, se cambian y se explica por qué.

## ESTADO DE PARTIDA (medido el 2026-10-02 en `origin/main` 1623a5c, no estimado)

- **El inventario ya existe y tiene gate.** `inventario/activos.json` registra 38 activos que cubren
  229 unidades (`npm run verifica:inventario`; vista en `inventario/INVENTARIO.md`; diseño en
  `docs/SDD-inventario-de-activos.md`). La fase 0 del borrador **no se rehace: se consume**.
- **El índice del portafolio** es la raíz `BUSINESS_LOGIC.md`: 7 productos, 5 con contrato propio y
  sección «Dolor» (dictado y asesor de voz, ERP, etiquetas, extractor, reel), y 2 **pendientes**
  (estudio pymes y vendedor de WhatsApp), que son dolor sin contrato.
- **Hay dos superficies A2A, no una.** El puente del extractor (`src/features/a2a/`, Agent Card en
  `tarjeta.ts`, `npm run prueba:a2a`) y la pasarela de ventas por WhatsApp (Agent Card firmada con
  JWS por dominio, apagada si no hay configuración). Ambas en la red interna. Exponer cualquiera
  fuera es gate humano. Doctrina: spec 005, `docs/SDD-puente-a2a-extractor.md` y el skill `add-a2a`.
- **Fuentes de evidencia que existen:** los contratos de cada producto; `.claude/gobernanza/`
  (`INCIDENTES.md` está **vacío**, y un registro vacío no prueba que no haya habido incidentes;
  `REGISTRO-RIESGO.md` tiene 6 entradas; `BITACORA-CDC.md`, 127); 14 specs; PRP-001 a 007; los
  `docs/SDD-*`, `docs/GOAL-*` y `.claude/goals/`; las trayectorias (`trayectorias/`, con informe por
  `npm run trayectorias:informe`); 642 commits y PR hasta el #207 (`gh` funciona); el padrón de
  gates (`npm run gates`).
- **Los medidores existen:** `mide:contexto`, `mide:mcp`, `audita:imprenta`, `verifica:routing`,
  `trayectorias:informe` y `vigila:versiones`. Las cifras del análisis salen de ahí, no del modelo.
- **No hay clase de tarea para este rol** en `.claude/routing-modelos.json` (C8). Una clase sin
  asignar hereda el default caro y el gate la rechaza: o encaja en una existente con su porqué, o
  se declara una nueva. Las dos cosas son CDC.
- **Hay 27 skills**, número declarado en `CLAUDE.md`, `AGENTS.md`, `README.md` y `.claude/README.md`.
  El verificador exige que coincida con los directorios. `GEMINI.md` se genera con
  `npm run sincroniza:gemini` y no se edita a mano.
- **Regresión C2:** la capa A son los contratos de `.claude/gobernanza/golden-sets/contratos.json`
  (`npm run regresion`). La capa B vive en la rama `golden-sets` y **ningún identificador de caso
  puede aparecer en el árbol** (`verify:gobernanza` falla).
- **Convención de goals:** `.claude/goals/<slug>/` con `spec.md`, `goal.txt`, `grafo.json` y
  `plan.md` (precedente: `pymes-marketing`, `readme-product-first`).
- **Worktree:** `.claude/worktrees/paintpoints`, rama `paintpoints` desde 1623a5c, con `npm ci`
  real hecho (con `node_modules` enlazado, Turbopack se rompe).

## LIBERTAD TÉCNICA

Eliges el nombre del rol y del skill, el esquema de las salidas, las categorías, la fórmula de
priorización, cómo se reparte el trabajo dentro del skill (subagentes, scripts, una sola pasada) y
dónde vive el contrato A2A. Todo lo que el borrador propone (la Agent Card de ejemplo, los tres
skills `inventario` / `deteccion-dolores` / `propuesta-producto`, un «agente medidor», la fórmula)
es sugerencia descartable. Lo innegociable es lo de RESTRICCIONES REALES y estos tres principios
de diseño, que son el pedido y no un cómo:

- **La regla de evidencia la hace cumplir algo que no es el analista.** Si el mismo modelo que
  escribe el hallazgo decide que su cita vale, la regla es un sello propio. Hace falta un comparador
  determinista que compruebe que cada cita existe y apunta a lo que dice, con un modo de prueba que
  **tumbe dolores sembrados sin cita o con cita falsa** (precedente: `verifica:gates --prueba`).
- **Las cifras las produce un script, no el analista.** Que eso sea un agente medidor A2A, un
  subagente o un comando lo decides tú. Una cifra sin el comando que la produjo es hipótesis; un
  dato ausente es `null`, nunca cero.
- **Product first también para el propio informe:** abre con lo que el laboratorio tiene que decidir
  (los candidatos y su veredicto), y deja el método y las tablas largas para después.

## INVESTIGA ANTES DE CONSTRUIR

Antes de diseñar, lee 2 o 3 referencias de descubrimiento de producto con evidencia (por ejemplo
el *opportunity solution tree*, *jobs to be done*, o cómo se gradúa la evidencia en revisiones
sistemáticas) y la doctrina de aquí: `docs/constitution.md`, `.claude/gobernanza/GOBERNANZA.md`
(C1–C8), el skill `add-a2a`, el skill `readme` (product first ya tiene contrato en este repo),
`skill-creator` y `.claude/PRPs/prp-base.md`. Reafirma el objetivo en una línea antes de cada
edición grande.

## GRAFO DEL SISTEMA

Topología antes que dinámica. Los nodos son **artefactos**, no agentes; las aristas son
transformaciones tipadas (script, agente, mixta); los lazos son comparadores con referencia. Vive
en `grafo.json`, junto a este spec. El plan de orquestación **se compila** a partir de él
(`plan.md`, generado con `grafo2plan.py`) y no se improvisa.

En `plan.md`, «subagente (Sonnet)» es solo la etiqueta por defecto del compilador. El modelo de
cada tarea lo decide `.claude/routing-modelos.json` (C8). El PRP (`prp-o-spec`) y los vetos
C3/C4 (`decision-de-gobernanza`) están en `no_se_abaratan`: van en el nivel de razonamiento,
nunca más baratos.

**Nodos** (morado = existe y validado · gris = falta):

| Nodo | Artefacto | Estado |
|---|---|---|
| `pedido` | este spec: pedido, decisión del laboratorio y las hipótesis H1–H6 | morado |
| `inventario` | `inventario/activos.json` (38 activos, gate propio) | morado |
| `fuentes` | contratos por producto, registros de gobernanza, specs/PRPs/SDD/goals, trayectorias, git y PR, padrón de gates | morado |
| `mediciones` | salida de los medidores, cada cifra con su comando | gris |
| `sdd` | `docs/SDD-<nombre>.md` | gris |
| `prp` | `.claude/PRPs/PRP-008-<nombre>.md` (fase 1 construida, fase 2 A2A viva planeada con sus gates) | gris |
| `skill` | el skill del rol | gris |
| `contrato-a2a` | Agent Card y estados tipados con el SDK fijado, con prueba, no servidos | gris |
| `verificador` | comparador determinista de evidencia, con `--prueba` | gris |
| `contrato-c2` | contrato capa A del skill | gris |
| `dolores` | hallazgos con cita + hipótesis aparte (formato de máquina, fechado) | gris |
| `casos` | casos de uso por categoría | gris |
| `priorizacion` | ranking con los vetos C3/C4 aparte | gris |
| `propuestas` | one-pagers product first + handoff recomendado | gris |
| `informe` | `docs/analisis/<fecha>/` para el laboratorio, con el veredicto de H1–H6 | gris |
| `propuesta-cdc` | diff completo + entrada de bitácora con la firma en hueco | gris |

**Lazos** (comparador → referencia):

- **L1 · sobre `dolores`**: ningún hallazgo sin cita verificada. El verificador da verde, todo lo
  que no tiene cita está en hipótesis, y su `--prueba` tumba todas las siembras.
- **L2 · sobre `inventario → dolores`**: ausente no es cero. Están revisados N de N activos PRODUCTO
  (y los FABRICA con usuario), y cada uno sin dolor lo dice.
- **L3 · sobre `mediciones`**: cada cifra trae su comando, y un dato ausente es `null`.
- **L4 · sobre `priorizacion`**: los vetos C3/C4 aparecen aparte y con motivo; ningún vetado está en
  el ranking.
- **L5 · sobre `propuestas`**: el orden product first se puede verificar, y cada propuesta usa al
  menos un `TPL-*` existente o explica por qué no.
- **L6 · sobre `contrato-a2a`**: typecheck y prueba en verde, y ninguna ruta nueva en `src/app`.
- **L7 · sobre `informe`**: las seis hipótesis tienen veredicto con cita.
- **L8 · sobre `prp`**: PRP y no spec, y los handoffs de los candidatos solo se recomiendan.
- **L9 · sobre `propuesta-cdc`**: `validate` completo en verde **después del commit** (la gobernanza
  lee `git ls-files`), `regresion` y `verify:gobernanza` con 28 skills, y la firma en hueco.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

El evaluador solo ve la conversación: no corre comandos ni lee archivos. Todo se pega.

1. **SDD y PRP-008**: su esqueleto (los encabezados) pegado, con las decisiones y la sección de lo
   que no se construye. La fase 2 del PRP nombra sus gates (C3, C4, C8, contabilidad, flujo de datos).
2. **Skill**: el `SKILL.md` pegado (o su diff), su contrato capa A, y `npm run regresion` en verde.
3. **Contrato A2A**: la Agent Card pegada, su prueba en verde y el comando que muestra que no hay
   ninguna ruta nueva servida.
4. **Verificador**: su salida en verde sobre la corrida real, y su `--prueba` tumbando cada dolor
   sembrado (sin cita, con ruta inexistente y con cita que no dice lo que el hallazgo afirma).
5. **Primera corrida** en `docs/analisis/<fecha>/`, con lo siguiente pegado en la conversación:
   - la tabla de cobertura del inventario (N/N);
   - el número de hallazgos por grado de evidencia y la sección de hipótesis;
   - los casos de uso por categoría;
   - el ranking con los vetos aparte;
   - al menos tres one-pagers completos;
   - la tabla de veredictos de H1–H6 con su cita.
6. **Cifras**: cada número del informe tiene al lado el comando que lo produjo, y ese output se pega.
7. **CDC**: `propuesta-cdc.md` con el diff completo de lo que es CDC: el skill, la clase de routing,
   la cuenta de skills en los documentos y, si lo propones, un gate nuevo en `gates.json` **sin
   aplicar**. La entrada de bitácora va con `aprobación humana ☐` y la firma en hueco, copiada a
   `~/propuesta-cdc.md` para que el laboratorio la firme.
8. **`npm run validate` completo en verde**, corrido después del último commit y pegado.
9. **Reporte de decisiones** (qué elegiste y por qué), más una lista de las formas en que el
   análisis o el rol podrían estar mal, cada una resuelta o declarada como residual.

## COMANDO DE VALIDACIÓN

`npm run validate` en el worktree (`.claude/worktrees/paintpoints`) tras cada cambio grande. En
cuanto exista, también el verificador de evidencia sobre la corrida. Surfea el output de los dos.
`validate` deriva del padrón de `.claude/gates.json` (`npm run gates` lo lista).

## RESTRICCIONES REALES

- **Solo el worktree `paintpoints`** (rama `paintpoints`). Commits locales sí; push, PR y merge no.
  El árbol principal y los otros worktrees no se tocan: puede haber otra sesión escribiendo.
- **CDC sin firmar.** Crear el skill, declarar su clase de routing, cambiar la cuenta de skills
  (también en `AGENTS.md`) y proponer un gate son C1. **La línea de aprobación la escribe el
  laboratorio**, no el agente: tú dejas el hueco.
- **El rol es de solo lectura** y solo escribe en `docs/analisis/`. No lee `.env*`. Las variables de
  entorno se nombran, nunca se imprimen.
- **Nada se sirve.** No hay ruta nueva ni cambios al puente o a la pasarela A2A existentes. El
  servicio vivo es la fase 2 del PRP, con gate humano, C3 y C4.
- **Sin motor LLM de servidor ni APIs de pago.** El contenido del repo no sale a ningún proveedor
  (la sesión que corre el skill ya es el motor). La red solo se usa para `gh`, en lectura.
- **Ni la rama `golden-sets` ni los casos-trampa.** El rol no los lee, no los cita y no escribe
  identificadores de caso en el árbol. Si propones un caso-trampa para el rol (por ejemplo, un dolor
  inventado sin evidencia que debe quedar como hipótesis), va **fuera del repo**, en
  `~/propuesta-trampa.md`, y lo siembra el laboratorio si quiere.
- **El costo por activo y su clasificación (D+I, defensibilidad) no entran a git** (spec 014
  §2.1). Las cifras de coste se citan por el comando que las produce.
- **No se inventa.** Un dolor sin evidencia es hipótesis; una cifra sin comando, también. Si falta
  una decisión de negocio (por ejemplo, de quién es el dolor), queda `input-required` en el
  informe y no se rellena.
- Código en TypeScript estricto, sin `any`; archivos de 500 líneas como máximo; en español.

## RED DE SEGURIDAD

Si tras 20 turnos el verificador o `validate` no convergen, detente y reporta el bloqueo con el
output real. Si la corrida revela que el inventario o un gate existente están mal, **no lo
arregles dentro de este goal**: anótalo como hallazgo con su cita, porque arreglarlo es otro
cambio con su propio dueño.
