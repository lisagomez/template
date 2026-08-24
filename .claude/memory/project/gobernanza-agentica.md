# Capa de gobernanza agéntica — estado

**Adoptada:** 2026-08-23 · **Estado:** construida, cableada y **firmada** (2026-08-23)

## Qué se hizo

Se destilaron 9 documentos de gobernanza del proyecto Hermes OS en 7 controles portables
(C1-C7) que viven en `.claude/gobernanza/` y están cableados a `CLAUDE.md`, `GEMINI.md`,
`prp-base.md` y al skill `new-app`. Se verifica con `npm run verify:gobernanza`
(**113 comprobaciones** al 2026-08-24; nacio con 30), incluido en `npm run validate`.

Las reglas están en el propio `GOBERNANZA.md`; aquí solo vive **lo que falta**.

## Dos ámbitos que NO se mezclan (aprendido el 2026-08-23)

Esto es un **boilerplate**: lo que se versiona lo hereda cada proyecto que nazca de aquí.
Hay cosas que parecen deuda del template y son del **entorno de la máquina** donde vive.
Mezclarlas produce listas de pendientes falsas — pasó, y lo corrigió la dueña.

| Del template (viaja a los proyectos) | Del entorno (de esta máquina) |
|---|---|
| Reglas, casos, verificador, runbooks | Tokens en `~/.config/claude/secrets.env` |
| Registros de decisiones y su firma | El alias `opus` en `~/.claude/settings.json` |
| Que un caso exista y esté medido | Que un servidor esté provisionado |

Regla: un boilerplate **nunca** está provisionado ni corre gates de operación. Si un
pendiente sólo puede cerrarlo un proyecto derivado o la máquina, no es deuda del template.

## Pendientes reales del template

1. **Cerrado el 2026-08-23: cinco mediciones válidas en frío, todas verdes** (una de ellas
   verde-plus). C5 tiene evidencia por los dos lados —el riesgo propio y su límite— y la
   regla de secretos en pantalla, que era el hueco de este punto, también está medida.
   **Qué mide cada caso no se escribe aquí, ni su identificador** — ver
   [[infraestructura-agentes]], sección de contaminación del corpus. El estado se anota por
   control, nunca por caso.
2. **Tres casos míos se anclaron en cosas que el template no tiene** (tabla `pedidos`,
   sistema de pagos, tope de gasto). Al escribir un caso-trampa: anclarlo en lo que EXISTE
   en un template vacío, o no computa.
3. **El corpus vive en la rama `golden-sets`**, no en el árbol de trabajo — dos
   contaminaciones lo obligaron. Se lee con `git show golden-sets:casos-trampa.md`. Si
   alguien clona con `--single-branch`, la capa B queda inaccesible (el verificador lo
   detecta). **Y desde el 2026-08-23 el árbol tampoco habla de él**: cero identificadores,
   vigilado por dos comprobaciones del verificador — ver [[infraestructura-agentes]].
4. **C7 diferido con disparador.** Las superficies pueden seguir con `service_role`
   mientras haya UN solo tenant. El disparador de la migración es **el alta del segundo
   tenant**, no una fecha.
5. **Fusionar antes de medir.** Cuando `main` va por detrás de la rama de trabajo, la
   aislación en worktree parte de `main` y una corrida de capa B **mide el estado viejo**:
   falso verde. Al 2026-08-23 `main` y `golden-sets` están sincronizadas con `origin`, así
   que la condición no aplica ahora — pero vuelve sola en cuanto haya trabajo sin fusionar.

## Condiciones del entorno (NO son deuda del template)

- **Rotar `SUPABASE_ACCESS_TOKEN` y `HCLOUD_TOKEN`.** Un agente los imprimió en claro
  (`INCIDENTES.md`). Viven en `~/.config/claude/secrets.env`, en la máquina, fuera de todo
  repo. El template **no los contiene** — se auditó: cero credenciales reales, y hay un gate
  que lo vigila. Rotar es acción de la dueña sobre su entorno.
- **El alias `opus` en `~/.claude/settings.json`.** `BITACORA-CDC.md` declara
  `claude-opus-5` pineado; la config real usa un alias flotante. Es config global del
  usuario: su cambio es un CDC propio y lo decide ella.

## Una entrada sin firmar ya no pasa el gate (2026-08-23)

El verificador vigilaba que los registros conservaran su **marca** append-only, pero no que
sus entradas tuvieran **dueno**. Una quedo dias con `_pendiente de firma` y la encontro un
repaso manual, no un control. Ahora el bloque 6b exige firma con valor real en toda entrada
de `REGISTRO-RIESGO.md` y `BITACORA-CDC.md`, ignorando la plantilla del bloque `## Formato`.

**Una decision de riesgo sin firmar no es una decision: es un descuido con formato de
decision.** Es la forma de fallo de siempre —el control existia, no estaba en la ruta—
aplicada al ultimo sitio donde quedaba.

## El arbol limpio no basta: la historia viaja (2026-08-23)

Auditado el boilerplate entero: **cero credenciales vivas** en los 63 commits de todas las
ramas; lo unico con forma de secreto son placeholders declarados. Lo que aparecio fue el
hueco del control que lo afirmaba:

1. El gate solo miraba el **arbol de trabajo**. Un boilerplate se clona **con su historia**:
   un secreto commiteado y borrado al commit siguiente sigue viajando. Medido con control
   negativo: con el archivo ya borrado del arbol, el verificador daba **verde** y el auditor
   nuevo, **rojo**.
2. El gate solo conocia **firmas con prefijo** (`ghp_`, `sk-`, ...). Un token sin prefijo
   —64 hex de Hetzner, una password a pelo en un `.env.example`— pasaba entero.

Lo cubre `scripts/audita-secretos.mjs`, en `validate` y `predeploy`. **Si alguna vez
encuentra algo real: la contencion es ROTAR, no reescribir la historia.** Rotar invalida el
valor filtrado; borrar el commit solo lo esconde de quien mire por el sitio obvio.

## AGENTS.md es la fuente unica (2026-08-23)

Las instrucciones viven en `AGENTS.md`; `CLAUDE.md` son 17 lineas que la importan con
`@AGENTS.md` mas lo especifico del arnes. Los dos hechos verificados antes de mover nada:
**Claude Code lee `CLAUDE.md`, no `AGENTS.md`** (y su doc recomienda justo este import), y
**opencode lee `AGENTS.md` primero** — cuando existen los dos, solo usa ese.

El verificador y el medidor de contexto **expanden los imports** (`scripts/lee-instrucciones.mjs`).
Sin eso mentirian los dos: el primero daria las reglas por desaparecidas, el segundo
reportaria un ahorro de ~6700 tokens **que no existe**. Un import se carga igual que si
estuviera pegado — mover contenido a otro archivo NO ahorra contexto, y medirlo asi lo
demuestra: el suelo subio de 9924 a 10163.

Pendiente que abre esto: la doc oficial pide **menos de 200 lineas** por archivo de
instrucciones y `AGENTS.md` tiene 507. `.claude/rules/` con `paths:` carga solo al tocar los
archivos que importan — ese si es ahorro real.

## Firmas (cerrado el 2026-08-23)

La AISIA, **todas** las entradas de `REGISTRO-RIESGO.md` y **todos** los CDC están
firmados como `lisagomez (responsable del proyecto)`, por instrucción explícita en sesión.
Un agente no firma por su cuenta: registra la autorización que una persona da. Que no quede
ninguna coja ya no depende de mirar — lo comprueba el gate de arriba.

## El límite de C5 (decidido el 2026-08-23)

**El dueño firma riesgos propios, no los de otros.** Cuando el daño recae sobre terceros
que no firmaron —datos de clientes, dinero ajeno— ninguna entrada del registro lo
autoriza. Lo propuso un agente en frío argumentando mejor que la expectativa escrita, y lo
decidió la responsable del proyecto (lisagomez). Se cruza con C4: si un riesgo necesita AISIA, probablemente no sea firmable.

## La lección de la primera corrida (2026-08-23)

**Un control escrito solo en el documento de gobernanza no dispara.** Dispararon C7 y C4,
que viven en Reglas de Código y en `prp-base.md`. No dispararon C1 ni C5, que vivían solo
en `GOBERNANZA.md` y en el decision tree. Por eso C1 y C5 se movieron inline.

Corolario para todo control futuro: si no está en el camino de quien decide, no existe.
Y dos gates estaban de adorno hasta ese día — el verificador fuera de la ruta de deploy
(arreglado con `predeploy`) y el corpus legible por el evaluado (ahora en base64).

## Decisiones de diseño que no son obvias del código

- Se eligió **un documento núcleo + plantillas separadas** (no un solo archivo) porque
  las plantillas se llenan y se copian por proyecto.
- Se cableó `GEMINI.md` además de `CLAUDE.md`: sin eso, una sesión con Gemini se saltaría
  la capa entera.
- **No hay rito trimestral a propósito.** Un rito que nadie hace es peor que ninguno; las
  revisiones cuelgan de disparadores reales (segundo tenant, primera migración de modelo).
- El verificador detecta **divergencia, no calidad**: alguien puede satisfacerlo con una
  sección vacía. Es un detector de pudrición, y no puede ser más sin volverse frágil.
