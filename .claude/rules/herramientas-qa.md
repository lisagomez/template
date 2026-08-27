---
paths:
  - "src/**"
  - "supabase/**"
  - "tests/**"
  - "e2e/**"
  - "playwright.config.*"
---
# MCPs: Tus Sentidos y Manos

Trasladado de `AGENTS.md` el 2026-08-26, texto original. Carga al tocar codigo, base de datos
o pruebas (Claude Code) o siempre (opencode). La escalera CLI-first y las reglas de los CLIs
siguen inline en `AGENTS.md` (Reglas de Codigo).

### Next.js DevTools MCP (Quality Control)
Conectado via `/_next/mcp`. Ve errores build/runtime en tiempo real.

### Playwright (Tus Ojos)

**CLI** (preferido, menos tokens). Lo que lleva estado va bajo `playwright cli`, con sesión
con nombre entre invocaciones — verificado el 2026-08-25:
```bash
npx playwright screenshot http://localhost:3000 captura.png   # un tiro, archivo POSICIONAL
npx playwright cli -s=qa open --browser chromium              # sin esto, todo lo demas falla
npx playwright cli -s=qa goto http://localhost:3000
npx playwright cli -s=qa snapshot                             # -> refs [ref=e3]
npx playwright cli -s=qa fill "#email" "x@y.com"; npx playwright cli -s=qa click "text=Entrar"
npx playwright cli -s=qa close
```
El detalle (targets, autenticación, límites) vive en el skill `playwright-cli`, que solo se
paga al invocarlo. **`navigate` no existe: es `goto`; `--output` tampoco.**

**MCP** (cuando necesitas explorar UI desconocida):
```
playwright_navigate, playwright_screenshot, playwright_click/fill
```

### Supabase MCP (Tus Manos)
```
execute_sql, apply_migration, list_tables, get_advisors
```
