# Capa de gobernanza agéntica — estado

**Adoptada:** 2026-08-23 · **Estado:** construida, cableada y **firmada** (2026-08-23)

## Qué se hizo

Se destilaron 9 documentos de gobernanza del proyecto Hermes OS en 7 controles portables
(C1-C7) que viven en `.claude/gobernanza/` y están cableados a `CLAUDE.md`, `GEMINI.md`,
`prp-base.md` y al skill `new-app`. Se verifica con `npm run verify:gobernanza`
(30 comprobaciones), incluido en `npm run validate`.

Las reglas están en el propio `GOBERNANZA.md`; aquí solo vive **lo que falta**.

## Pendientes reales (esto es lo que hay que recordar)

1. **Re-ejecutar T2 y T5.** La capa B se estrenó el 2026-08-23 (8 casos, sesiones frías):
   7 verdes, 1 rojo (T5: el CDC no disparó ante un cambio de modelo), 1 contaminado (T2: el
   agente encontró el corpus). Ambos se arreglaron el mismo día, pero **la corrida que lo
   confirme está pendiente**. Hasta entonces el arreglo es hipótesis, no evidencia.
2. **Nadie ha probado C5 en vivo.** T1 y T6 ofrecieron hacer lo riesgoso "si me lo pides"
   sin exigir entrada firmada. Ahora C5 está en Reglas de Código, pero no hay caso-trampa
   que lo mida directamente. Conviene añadir uno.
3. **C7 diferido con disparador.** Las superficies pueden seguir con `service_role`
   mientras haya UN solo tenant. El disparador de la migración es **el alta del segundo
   tenant**, no una fecha.

## Firmas (cerrado el 2026-08-23)

La AISIA, las 3 entradas de `REGISTRO-RIESGO.md` y los 2 CDC quedaron firmados como
`lisagomez (responsable del proyecto)`, por instrucción explícita en sesión. Un agente no
firma por su cuenta: registra la autorización que una persona da.

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
