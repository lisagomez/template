# Capa de gobernanza agéntica — estado

**Adoptada:** 2026-08-23 · **Estado:** construida, cableada y **firmada** (2026-08-23)

## Qué se hizo

Se destilaron 9 documentos de gobernanza del proyecto Hermes OS en 7 controles portables
(C1-C7) que viven en `.claude/gobernanza/` y están cableados a `CLAUDE.md`, `GEMINI.md`,
`prp-base.md` y al skill `new-app`. Se verifica con `npm run verify:gobernanza`
(30 comprobaciones), incluido en `npm run validate`.

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

1. **C5 tiene evidencia por los dos lados** (cerrado el 2026-08-23). El límite y el riesgo
   propio salieron verdes en frío. **Sigue sin medir** la regla de secretos en pantalla: su
   caso existe y nunca se ha ejecutado. **Qué mide cada caso no se escribe aquí** — ver
   [[infraestructura-agentes]], sección de contaminación del corpus. El estado se anota por
   control, no por caso.
2. **Tres casos míos se anclaron en cosas que el template no tiene** (tabla `pedidos`,
   sistema de pagos, tope de gasto). Al escribir un caso-trampa: anclarlo en lo que EXISTE
   en un template vacío, o no computa.
3. **El corpus vive en la rama `golden-sets`**, no en el árbol de trabajo — dos
   contaminaciones lo obligaron. Se lee con `git show golden-sets:casos-trampa.md`. Si
   alguien clona con `--single-branch`, la capa B queda inaccesible (el verificador lo
   detecta).
4. **C7 diferido con disparador.** Las superficies pueden seguir con `service_role`
   mientras haya UN solo tenant. El disparador de la migración es **el alta del segundo
   tenant**, no una fecha.
5. **`main` va por detrás de la rama de trabajo.** No es cosmético: la aislación en worktree
   parte de `main`, así que una corrida de capa B lanzada así **mide el estado viejo** y
   puede devolver un falso verde. Fusionar antes de medir.

## Condiciones del entorno (NO son deuda del template)

- **Rotar `SUPABASE_ACCESS_TOKEN` y `HCLOUD_TOKEN`.** Un agente los imprimió en claro
  (`INCIDENTES.md`). Viven en `~/.config/claude/secrets.env`, en la máquina, fuera de todo
  repo. El template **no los contiene** — se auditó: cero credenciales reales, y hay un gate
  que lo vigila. Rotar es acción de la dueña sobre su entorno.
- **El alias `opus` en `~/.claude/settings.json`.** `BITACORA-CDC.md` declara
  `claude-opus-5` pineado; la config real usa un alias flotante. Es config global del
  usuario: su cambio es un CDC propio y lo decide ella.

## Firmas (cerrado el 2026-08-23)

La AISIA, las 3 entradas de `REGISTRO-RIESGO.md` y los 2 CDC quedaron firmados como
`lisagomez (responsable del proyecto)`, por instrucción explícita en sesión. Un agente no
firma por su cuenta: registra la autorización que una persona da.

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
