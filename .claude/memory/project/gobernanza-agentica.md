# Capa de gobernanza agéntica — estado

**Adoptada:** 2026-08-23 · **Estado:** construida, cableada y **firmada** (2026-08-23)

## Qué se hizo

Se destilaron 9 documentos de gobernanza del proyecto Hermes OS en 7 controles portables
(C1-C7) que viven en `.claude/gobernanza/` y están cableados a `CLAUDE.md`, `GEMINI.md`,
`prp-base.md` y al skill `new-app`. Se verifica con `npm run verify:gobernanza`
(30 comprobaciones), incluido en `npm run validate`.

Las reglas están en el propio `GOBERNANZA.md`; aquí solo vive **lo que falta**.

## Pendientes reales (esto es lo que hay que recordar)

1. **C2 no existe todavía.** La suite de regresión de skills está declarada, no
   construida. Consecuencia: el CDC (C1) exige una regresión que no hay, así que hoy se
   apoya solo en el diff y la aprobación humana. **Construirla antes de la primera
   migración forzada de modelo**, no durante.
2. **C7 diferido con disparador.** Las superficies pueden seguir con `service_role`
   mientras haya UN solo tenant. El disparador de la migración es **el alta del segundo
   tenant**, no una fecha.

## Firmas (cerrado el 2026-08-23)

La AISIA, las 3 entradas de `REGISTRO-RIESGO.md` y los 2 CDC quedaron firmados como
`lisagomez (responsable del proyecto)`, por instrucción explícita en sesión. Un agente no
firma por su cuenta: registra la autorización que una persona da.

## Decisiones de diseño que no son obvias del código

- Se eligió **un documento núcleo + plantillas separadas** (no un solo archivo) porque
  las plantillas se llenan y se copian por proyecto.
- Se cableó `GEMINI.md` además de `CLAUDE.md`: sin eso, una sesión con Gemini se saltaría
  la capa entera.
- **No hay rito trimestral a propósito.** Un rito que nadie hace es peor que ninguno; las
  revisiones cuelgan de disparadores reales (segundo tenant, primera migración de modelo).
- El verificador detecta **divergencia, no calidad**: alguien puede satisfacerlo con una
  sección vacía. Es un detector de pudrición, y no puede ser más sin volverse frágil.
