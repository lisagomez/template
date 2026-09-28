# Propuesta de entrada para `BITACORA-CDC.md` — para firma

> Redactada FUERA del registro (lección del 2026-09-20). Al firmar se pega en la bitácora y este archivo se borra.

### 2026-09-27 — `reel:rls` al padrón como gate INACTIVO con motivo → CDC PROPUESTO — radio: sistema (padrón de gates)
- **Cambio**: en `.claude/gates.json` nace `reel:rls` (`node scripts/reel/mide-aislamiento.ts`), **inactivo**, con
  `motivo`: «necesita red y crea dos cuentas de prueba por corrida en el proyecto Supabase», y `falta`: «un perfil de
  gate con red y un proyecto Supabase de pruebas desechable».
- **Motivo**: `verifica:gates` señaló el archivo (entonces `scripts/reel/prueba-rls.ts`) como prueba huérfana. En el
  goal se reestructuró como **medición** (escribe `public/laboratorio-pymes/reel/rls.json`, que verifica el caso
  `sala-7` dentro de `validate`), igual que `contenido:video` → `video-7`. Así el gate verifica la ÚLTIMA medición,
  pero no la vuelve a correr: si RLS se rompe después, `sala-7` sigue en verde hasta que alguien mida otra vez.
  Declararla en el padrón hace visible esa ausencia en vez de dejarla implícita.
- **Gate aplicado**: diff ☐ (se enseña al firmar) · regresión capa A ☐ · aprobación humana ☐. Capa B: propuesta
  «capa A basta» (no toca skills, prompts, modelo ni instrucciones).
- **Aprobado por**: _(firma)_
