# Propuesta de entrada para `BITACORA-CDC.md` — para firma

> Redactada FUERA del registro. Al firmar, se pega en la bitácora y este archivo se borra.

### 2026-09-27 — referencias a `add-payments` donde se cobra en línea, con sus límites → CDC PROPUESTO — radio: skills (6), plantilla (1), regla (1), contratos C2 (1)
- **Cambio** (rama `pagos-add-payments`, apilada sobre `pymes-marketing-build`):
  - `add-payments`: `description` suma que NO sirve para bienes físicos, servicios presenciales ni
    marketplaces; sección **Límites** con citas de la política de uso aceptable de Polar (consultada el
    2026-09-27), el alcance real del código (suscripción → acceso) y lo «a verificar» (moneda de
    liquidación, CFDI).
  - `website-3d`, `new-app`, `supabase` (+ `references/schema-example.md`), `bucle-agentico`: referencia al
    skill en el punto donde se decide o se usa el cobro, con su límite cuando hace falta.
  - `add-a2a`: se corrige una comparación falsa («igual que `/add-payments` pregunta»).
  - `prp-base.md` (plantilla) y `rules/flujos.md` (+10 tokens; reglas al 97 % de su presupuesto).
  - `golden-sets/contratos.json`: +7 contratos (5 `patron`, 2 `prohibido`) para que las referencias no se
    pudran. Regresión de 123 a 131 contratos.
- **Motivo**: goal `pagos-add-payments`. Una referencia que manda a quien no debe es peor que ninguna: una
  pyme de productos físicos no puede usar Polar.
- **No se tocó `AGENTS.md`**: ya enruta «pagos / cobrar / checkout» a ADD-PAYMENTS, y el límite vive en el
  skill al que lleva; tocarlo invalidaría el caché de prefijo sin ganar nada.
- **Gate aplicado**: diff visible ☑ (en la conversación del goal) · regresión verde ☑ capa A 131/131 ·
  `verify:gobernanza` ☑ 152/152 · `validate` ☑ · aprobación humana ☐ · pineo ☑ (sin modelo ni
  dependencia). **Capa B no corrida**: propuesta «capa A basta» — ninguna instrucción cambia de
  sentido, solo se suman referencias y límites; decide quien firma.
- **Aprobado por**: _(firma)_

**Propuesto para después (otro CDC, porque cambia el código del gate):** un contrato CONDICIONAL en
`scripts/regresion-skills.mjs` — «si una skill menciona checkout o pasarela de pagos, cita `add-payments`
o declara por qué no aplica» — para cubrir skills que todavía no existen. Los contratos por skill de este
cambio cubren los lugares conocidos.
