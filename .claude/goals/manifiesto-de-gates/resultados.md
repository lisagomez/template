# Manifiesto de gates — resultados (2026-09-26)

Ejecución del `/goal` de `spec.md`. Todo lo de aquí está **medido**, no estimado.

---

## Lo que existe ahora

| Pieza | Qué hace |
|---|---|
| `.claude/gates.json` | El padrón: 30 gates como dato (nombre, runner, `guarda`, `evidencia`, perfiles, activo/inactivo con `motivo` y `falta`, `timeout_s`) y 3 perfiles (`validate`, `predeploy`, `cdc`) |
| `scripts/lib/gates.mjs` | El cargador fail-closed: valida el padrón **entero** antes de aceptar un solo gate |
| `scripts/corre-gates.mjs` | El runner: deriva el perfil, corre, clasifica en `paso`/`fallo`/`no_ejecutable`, cuenta las tres poblaciones y sella |
| `scripts/verifica-gates.mjs` | El gate del padrón (11 comprobaciones) + `--prueba` (6 siembras) + `--lista` |
| `scripts/proyecta-gates.mjs` | Emite `reglas/software.toml` para `hermes-os-a2a` y lo compara con su copia a mano (`--diff`) |
| `scripts/prueba-tools.mjs` | Corre las suites de `tools/` — **alta nueva**: nadie las corría |

`package.json` pasó de una cadena de 21 `&&` en 599 caracteres a `node scripts/corre-gates.mjs
validate`, y `predeploy` de un subconjunto copiado a mano a `node scripts/corre-gates.mjs
predeploy`.

## Estado del gate

```
pasaron: 23   inactivos declarados: 7   rojos: 0
Gate validate en VERDE: 23/23 gates activos pasaron.
```

Tres poblaciones contadas aparte, y los 7 inactivos se imprimen con su motivo en **cada**
corrida: un gate apagado nunca se lee como uno que pasó.

## Las 6 siembras de la prueba de la prueba

`node scripts/verifica-gates.mjs --prueba` → **6 de 6 cazadas**. Con línea base comprobada
primero, para que ninguna siembra «caiga» por un error preexistente (lección del 2026-09-25).

1. runner sin implementación (`modelo`) en un gate ACTIVO → padrón inválido
2. typo de runner (`comanddo`) en un gate **APAGADO** → padrón inválido igual
3. gate ACTIVO cuyo comando no existe → padrón inválido
4. `validate` con la cadena a mano de vuelta → divergencia
5. gate inactivo **sin** `motivo` → padrón inválido
6. archivo de pruebas huérfano → sin cubrir

## C1 dispara (demostrado, no citado)

Sembré la salida del manifiesto del alcance de C1 en `AGENTS.md` y corrí el verificador:

```
✗ CLAUDE.md: el CDC (C1) nombra el manifiesto de gates (.claude/gates.json)
✗ GEMINI.md: el CDC (C1) nombra el manifiesto de gates (.claude/gates.json)
Gobernanza DIVERGENTE: 2 de 156 comprobaciones fallaron.
```

Restaurado: **156/156 en verde**, con las dos comprobaciones y la de `GOBERNANZA.md §2`.

## Los tres agujeros que el padrón destapó

### 1. `scripts/prueba-a2a.ts` era huérfano y se había podrido

Prueba el puente A2A (spec 005 TAR-8..TAR-13, spec 010 RF-15..RF-21) y **ningún script npm lo
corría**. Medido: **12 verdes, 3 rojos**.

El rojo de opacidad es **test viejo, no fuga**: asserta que la app tiene *exactamente* 3 rutas de
servidor (`/.well-known/agent-card.json`, `/a2a`, `/a2a/health`) y hoy tiene **14** — crecieron
11 `/api/*` legítimas de dictado, laboratorio, historial y ajustes (PRs #129-#140). Los otros 2
rojos (camino feliz y lectura de XML) necesitan la capacidad de extracción inyectada.

**Consecuencia real:** nadie vigila la opacidad A2A desde que la app creció. Queda declarado
`activo: false` con motivo y `falta`; reactivarlo es un CDC aparte porque exige decidir sobre el
puente, no sobre el padrón.

### 2. Las suites de `tools/` no las corría nadie

`prepara-gate.mjs` **construía** las 5 herramientas (para que el typecheck de la raíz no
fallara), pero nunca corría sus pruebas: **87 archivos**, con **776 pruebas sólo en
`extractor-documental`**. Las cuatro suites pasan en **3,4 s** juntas — pasaban por suerte, no
por gate. Cerrado activando `prueba:tools`.

Lo cazó la comprobación de huérfanos, no un ojo humano.

### 3. Siete gates existían fuera de `validate` sin que nada dijera por qué

`inventario:valida-erp`, `erp:prueba`, `erp:control` (Docker) · `vigila:versiones`,
`vigila:hermes` (red, y **proponen**: mover un pineo es un CDC) · `mide:mcp` (es una medición,
no un criterio: sin umbral no puede ponerse roja) · `regresion:trampa` (capa B, se paga por CDC —
antes esto sólo vivía en la prosa de `AGENTS.md`, ahora está en el padrón, en el perfil `cdc`).

## La divergencia con hermes-os-a2a, medida

`npm run proyecta:gates --diff <su software.toml>` → **3 divergencias**:

| Divergencia | Qué es |
|---|---|
| `tests` sólo allá | Declara **ACTIVO** `npx playwright test`. Aquí eso sale **exit 1, «No tests found»**: hay `playwright@1.63.0` en dependencias pero no hay `playwright.config.ts` ni tests. Su Supervisor **rechazaría siempre** una tarea sobre un worktree de este template |
| `code_review` sólo allá | Inactivo **sin motivo escrito** |
| `security_review` sólo allá | Inactivo **sin motivo escrito** |

El arreglo es el patrón de `voz`/`dictado` (PR #140): **una sola dueña del contrato**. El template
emite la proyección; adoptarla allá es un CDC de ese proyecto. **No se escribió nada en
`hermes-os-a2a`**, igual que declararon los dos SDD de sus Fases 6 y 7.

## Decisiones de diseño

- **`.claude/gates.json`, no `.claude/departamentos/`.** El análisis previo (en `spec.md`)
  concluyó que «departamento» es vocabulario organizativo y que la frontera de este repo es de
  **radio de daño** (`.claude/memory/project/infraestructura-agentes.md:27`). Un padrón de gates
  con perfiles da el mismo mecanismo sin la palabra.
- **JSON, no TOML.** Simetría con `.claude/routing-modelos.json`, que es el precedente exacto
  (config pineada + verificador propio dentro de `validate`), y `JSON.parse` sin dependencias.
- **`predeploy` también deriva.** No estaba en el spec, pero dejarlo a mano habría creado una
  divergencia nueva de la clase que este trabajo cierra. Ganó `verifica:gates` (14 gates ahora).
- **Fail-fast por defecto**, como la cadena de `&&`. `--sigue` corre todo.
- **8 comprobaciones de `verifica-gobernanza.mjs` migradas** de regex sobre la cadena de
  `package.json` a leer el perfil del padrón. Criterio idéntico, más fuerte: antes bastaba con
  que la palabra apareciera en la cadena; ahora el gate tiene que estar declarado, **activo** y
  en el perfil. Si el padrón no carga, la lista queda vacía y las comprobaciones **caen**: no
  poder mirar no es estar en verde.

## En qué podría estar mal (y qué hice)

| Riesgo | Qué hice |
|---|---|
| El runner se vuelve punto único de fallo | Falla cerrado (exit 1, «el runner no arranca»); `verifica:gates` corre dentro del propio perfil |
| Un `timeout_s` corto convierte lento en `no_ejecutable` | Valores generosos (build 1800 s); el síntoma es un rojo con la palabra «timeout», nunca un pase |
| Reformateo masivo de `inventario/activos.json` | Detectado (799 líneas de diff por un asiento): revertido y rehecho a mano respetando el formato → 9 líneas |
| Un gate nuevo sin declarar se escapa | `verifica:gates` lo caza (29 scripts con forma de gate revisados) |
| La escotilla `NO_SON_GATE` se usa para esconder | Hoy está **vacía** y documentada: excusar uno es una decisión visible |
| El padrón sólo cubre este repo | La proyección para hermes es el artefacto; adoptarla es decisión suya |

## CDC — firmado el 2026-09-26

Entrada en `.claude/gobernanza/BITACORA-CDC.md`, aprobada por **lisagomez** («continua con la
firma del CDC»). La propuesta se borró al firmar, como manda el aprendizaje del 2026-09-20.

Dos correcciones que salieron al firmar, y que conviene no perder:

- **`npm run regresion -- --trampa` NO invoca al modelo.** Su cabecera lo dice: «aquí solo se
  verifica que el corpus esté completo y se lista». Mi cautela sobre el gasto era infundada; la
  capa B es determinista y barata. **22/22, «promovible».** Lo que sí cuesta —y no se hizo— es
  ejecutar los 21 casos en sesiones frías: eso es una medición de conducta, no el gate.
- **No hacía falta un caso-trampa nuevo.** El caso del corpus que mide la petición de saltarse
  un gate «temporalmente» ya cubre esta superficie, y su expectativa dice literal que
  «inaceptable es que desaparezca del `validate` sin dejar rastro». El manifiesto la vuelve
  **más** exigible: ahora esa desaparición es detectable estructuralmente (`verifica:gates` la
  caza). Había sugerido añadir un caso; era innecesario. **Sin identificador a propósito**: el
  par caso→regla no puede reconstruirse leyendo el repo (protocolo ciego). Escribirlo fue mi
  error y lo cazó `audita:fugas` dentro del propio `validate`.

## Lo que queda a personas

1. **Decidir sobre `prueba:a2a`**: reencuadrar la opacidad + inyectar o acotar la extracción.
   Es un CDC aparte, sobre el puente A2A y no sobre el padrón.
2. **Adoptar la proyección en `hermes-os-a2a`** (CDC de ese repo; aquí solo se emite).
3. **Un perfil con Docker** para `inventario:valida-erp`, `erp:prueba` y `erp:control`.
4. **Medir la conducta de los 21 casos-trampa en sesiones frías**, si se quiere la capa B
   completa y no solo su gate.

## Nota de entorno

Un worktree nuevo no trae `node_modules`. `tsc` y `eslint` se resuelven subiendo al checkout
principal, pero **Turbopack no sale de la raíz del workspace** y el build falla con «Could not
find the Next.js package». Un symlink tampoco sirve: *«Symlink `[project]/node_modules` is
invalid, it points out of the filesystem root»* — la misma trampa que ya está en
`.claude/rules/aprendizajes-stack.md` (2026-09-20). Hace falta `npm ci` dentro del worktree.
