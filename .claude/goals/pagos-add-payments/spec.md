# Referencia a `add-payments` donde se necesite una pasarela de pagos en línea — Spec

Compilado por `/goal-compiler` el 2026-09-27. Forma: **LOOP** (un trabajo, mismas herramientas, un solo
criterio; 0 de 4 en el diagnóstico). Lo que se pega en `/goal` es `goal.txt`, NO este archivo.

## MISION

Que en la fábrica **nadie tenga que adivinar cómo se cobra en línea**: en cada lugar donde un flujo,
una skill, una regla, una plantilla o un documento necesita o sugiere una pasarela de pagos en línea
(checkout, suscripciones, cobrar por la app, botón de compra, facturación recurrente, monetizar), aparece
la referencia a la skill `add-payments` en el punto exacto donde alguien la necesitaría, con una línea
que diga **qué resuelve** (Polar como Merchant of Record sobre Stripe; checkout, webhooks, tabla de
compras, acceso por suscripción; requiere `/add-login`; el webhook es la fuente de verdad) y, cuando haga
falta, **qué NO resuelve**.

Lo que distingue un trabajo bien hecho de un buscar-y-pegar: **una referencia que manda a la herramienta
equivocada es peor que ninguna.** `add-payments` dice «NO USAR para: Stripe directo, analytics de pagos,
reportes de revenue», y Polar es un vendedor de productos digitales y software. Donde el cobro es de otra
naturaleza —una pyme que vende pan o mercancía física en línea, cobros presenciales, la obligación de
emitir CFDI, datos de ventas que solo se LEEN de PayPal o Mercado Pago— la referencia no se pone a ciegas:
se dice que `add-payments` no aplica y por qué, y el hueco queda nombrado para una decisión futura.

Horizonte: que la referencia **no se pudra**. Si lo juzgas valioso y proporcional, propón un contrato en
la regresión de skills (C2 capa A, `.claude/gobernanza/golden-sets/`) que falle cuando una skill mencione
checkout o pasarela de pagos sin citar `add-payments` o sin declarar por qué no aplica. Un control que
solo vive en un documento no dispara (aprendizaje del 2026-08-23). Justifica si lo haces o por qué no.

## LIBERTAD TECNICA

Tú decides dónde va cada referencia, con qué palabras y si conviene un contrato automático. Solo se
agregan referencias y documentación: no se implementa ni se instala nada de pagos.

## INVESTIGA ANTES DE CONSTRUIR

- Lee **entera** `.claude/skills/add-payments/SKILL.md`, el decision tree de `AGENTS.md`,
  `.claude/rules/flujos.md`, `.claude/skills/SKILLS_README.md`, `.claude/README.md`, `README.md`,
  `.claude/PRPs/prp-base.md`, la skill `new-app` (genera `BUSINESS_LOGIC.md`), y cómo están hechos los
  contratos de `.claude/gobernanza/golden-sets/contratos.json` y `scripts/regresion-skills.mjs`.
- Inventario de partida (verifícalo, no te fíes de él): ya citan `add-payments` `README.md`, `AGENTS.md`,
  `GEMINI.md`, `.claude/README.md`, `.claude/rules/flujos.md`, `.claude/skills/SKILLS_README.md`,
  `add-a2a`, el PRP-002, la bitácora, el manifiesto de la imprenta y el golden set. Candidatas que hablan
  de cobro sin citarla: `website-3d` (línea «D) Venta Directa — Boton de compra / checkout»),
  `bucle-agentico` (ejemplo «Sistema de facturacion con Stripe», que contradice el camino de Polar),
  `supabase` (consulta de MRR por suscripciones), `new-app` (acciones irreversibles como cobros). Busca
  más en `docs/`, `.claude/specs/`, `.claude/PRPs/`, `.claude/goals/`, `tools/*/README.md` y `src/`. Ignora
  el ruido: `checkout` de git, «suscripción» de notificaciones push, datos del ERP contable, corpus y
  mediciones.
- Verifica en la documentación oficial de Polar (solo lectura) qué vende y qué no: productos físicos,
  pagos desde México y en MXN, y si emite o no comprobantes fiscales mexicanos. Cita la fuente. Lo que
  no puedas verificar se escribe «a verificar», nunca como hecho.
- Si la rama `pymes-marketing-build` no está mezclada a `main`, sus documentos (familia de finanzas del
  plugin, cobros de la pyme) también cuentan: trabaja sobre ella y dilo; si ya está mezclada, sal de `main`.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

- **Inventario pegado**: tabla de cada mención de cobro o pasarela encontrada (`archivo:línea`), su
  veredicto (necesita referencia · ya la tiene · no aplica y por qué) y qué se hizo.
- **Diff pegado** de cada edición (o `git diff --stat` más los hunks de skills y reglas).
- Al menos un caso demostrado donde la referencia **no** se puso o se puso con su límite (Stripe directo,
  bienes físicos si Polar no los cubre, lectura de ventas), con la cita que lo justifica.
- Salida en verde del comando de validación y de `npm run validate` al final.
- **Propuesta de entrada CDC** para firma, FUERA de `BITACORA-CDC.md` (en la carpeta del goal), con las
  skills y reglas tocadas, la regresión corrida y lo que la firma decide (incluida la capa B).
- Formas en que esto podría estar mal, y cómo se resolvieron.

## COMANDO DE VALIDACION

`npm run regresion && npm run verify:gobernanza && npm run lint` tras cada cambio grande, con el output
pegado. Si tocas `AGENTS.md`: `npm run sincroniza:gemini` antes. `npm run validate` antes de cerrar.

## RESTRICCIONES REALES

- **Tocar skills, reglas, plantillas o `AGENTS.md` es CDC (C1)**: se hace en una rama propia, con el diff
  a la vista y la regresión en verde; la entrada va como propuesta fuera de la bitácora y **nada se mezcla
  a `main` sin la firma**. No se hace push ni PR sin preguntar.
- `AGENTS.md` solo si de verdad falta ahí (ya trae ADD-PAYMENTS en el decision tree): cada cambio
  invalida el caché de prefijo; `GEMINI.md` se regenera, no se edita a mano.
- No se implementa, instala ni configura nada de pagos; no se tocan `settings.json` ni `.mcp.json`.
- Secretos jamás en pantalla. Español de México, sin jerga.
