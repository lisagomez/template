---
name: playwright-cli
description: "Testing automatizado con Playwright CLI. Navega la app, llena formularios, hace click, toma screenshots, y genera reportes. Activar cuando el usuario dice: testea esto, revisa que funcione, hay un bug, verificalo, checalo en el browser, o despues de implementar una feature para validar."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Skill: QA Automatizado con Playwright CLI

> Ejecutar QA: $ARGUMENTS

---

## Por Que CLI en vez de MCP

Playwright MCP inyecta snapshots completos de pagina directamente en el context window. Esto consume muchos tokens y puede causar ruido para flujos conocidos.

Playwright CLI en cambio:
- Guarda datos de pagina a disco (archivos YAML/screenshots) en vez de llenar el contexto
- Menos tokens consumidos, mayor precision para flujos definidos
- Claude ya sabe usar shell commands, cero overhead de carga de herramientas
- Los artefactos quedan en disco para revision posterior

**Cuando usar MCP en vez de CLI**: Exploracion interactiva de paginas desconocidas o debugging visual en tiempo real. Para todo lo demas, CLI.

---

## Prerequisitos

Instalar Chromium si no esta instalado:

```bash
npx playwright install chromium
```

---

## Comandos Core de Playwright CLI

Hay **dos superficies distintas** y confundirlas es el error clasico:

| Superficie | Estado | Para que |
|---|---|---|
| `npx playwright <cmd>` | sin estado, un tiro | `screenshot`, `pdf`, `codegen`, `test` |
| `npx playwright cli -s=<sesion> <cmd>` | **sesion persistente** | `goto`, `click`, `fill`, `snapshot`... |

```bash
# UN TIRO: el archivo es POSICIONAL. `--output` NO existe.
npx playwright screenshot http://localhost:3000 captura.png

# CON ESTADO: la sesion sobrevive entre invocaciones (procesos distintos).
npx playwright cli -s=qa open --browser chromium   # sin esto: "browser is not open"
npx playwright cli -s=qa goto http://localhost:3000
npx playwright cli -s=qa snapshot                  # -> refs: [ref=e3], [ref=e4]...
npx playwright cli -s=qa fill "#email" "test@example.com"
npx playwright cli -s=qa click "text=Sign In"
npx playwright cli -s=qa screenshot --filename captura.png
npx playwright cli -s=qa eval "() => document.title"
npx playwright cli -s=qa close
```

**Tres cosas que hay que saber o no funciona nada:**

1. **El target admite ref del `snapshot` (`e4`) o selector** (`#email`, `text=Sign In`).
   Lo que NO funciona es texto pelado: `click "Sign In"` devuelve *"does not match any
   elements"*. Los refs son mas robustos cuando el DOM tiene varios candidatos.
2. **`--browser chromium` es obligatorio en `open`.** Por defecto busca Chrome de marca en
   `/opt/google/chrome`, que no viene con `npx playwright install chromium`.
3. **`file://` esta bloqueado.** Para probar HTML local, sirvelo por http.

Para autenticacion, `state-save` / `state-load` guardan y restauran la sesion en disco —
mejor que repetir el login en cada corrida.

---

## Flujo QA en 6 Fases

### Fase 1: SETUP

Leer los requerimientos del test. Identificar que necesita testing.

- Que feature o bug se esta verificando?
- Cuales son los criterios de exito?
- Que URL/rutas estan involucradas?
- Se necesitan datos de prueba?

Crear el directorio de artefactos:

```bash
mkdir -p .qa-reports/[YYYY-MM-DD]-[nombre]/screenshots
```

### Fase 2: PROVISION

Preparar datos de prueba si son necesarios.

- Crear usuario de prueba via Supabase MCP si aplica
- Preparar datos en BD que el flujo necesite
- Verificar que el servidor de desarrollo esta corriendo

```bash
# Verificar que la app esta corriendo
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Fase 3: NAVIGATE

Abrir la app y navegar a las paginas relevantes.

```bash
QA=".qa-reports/[fecha]-[nombre]"
npx playwright cli -s=qa open --browser chromium
npx playwright cli -s=qa goto http://localhost:3000/[ruta]
npx playwright cli -s=qa screenshot --filename "$QA/screenshots/01-inicio.png"
```

### Fase 4: TEST

Ejecutar los pasos del test. Llenar formularios, hacer clicks, verificar resultados.
**La misma sesion `-s=qa` de la fase 3**: es lo que hace que el login persista entre pasos.

```bash
# Ejemplo: test de login
npx playwright cli -s=qa goto http://localhost:3000/login
npx playwright cli -s=qa snapshot            # confirma que los campos existen
npx playwright cli -s=qa fill "#email" "test@example.com"
npx playwright cli -s=qa fill "#password" "testpassword"
npx playwright cli -s=qa click "text=Sign In"
npx playwright cli -s=qa eval "() => location.pathname"   # verificar, no suponer
```

El `snapshot` va primero **para confirmar contra el DOM real** en vez de suponer los
selectores. Si un selector casa con varios elementos, usar el ref (`e4`) que devuelve.
Tomar screenshot ANTES y DESPUES de cada accion critica.

### Fase 5: DOCUMENT

Guardar snapshots de pagina solo cuando se necesite inspeccionar estructura.

```bash
npx playwright cli -s=qa snapshot --filename "$QA/snapshot-[paso].md"
npx playwright cli -s=qa close               # cerrar la sesion al terminar
```

`--filename` guarda el snapshot **en vez de** devolverlo en la respuesta: es la forma de no
pagarlo en el contexto. Redirigir con `>` no sirve — igual lo devuelve, y ademas envuelto
en markdown.

**Principio sticky-notes**: NO volcar snapshots completos al contexto. Leer el archivo YAML solo cuando se necesite inspeccionar algo especifico. Resumen primero, detalles on-demand.

### Fase 6: REPORT

Generar reporte markdown con hallazgos.

---

## Template del Reporte

Crear el archivo `.qa-reports/[YYYY-MM-DD]-[nombre]/report.md`:

```markdown
# QA Report: [Feature/Bug Name]

**Date**: [YYYY-MM-DD]
**Status**: PASSED | FAILED | PARTIALLY_FIXED

## Test Steps
1. [Descripcion del paso] - Screenshot: `screenshots/01-nombre.png`
2. [Descripcion del paso] - Screenshot: `screenshots/02-nombre.png`
3. ...

## Findings
- [Issue encontrado o confirmacion de que funciona]
- [Comportamiento inesperado observado]

## Screenshots
- `screenshots/01-inicio.png` - Estado inicial
- `screenshots/02-accion.png` - Despues de [accion]
- ...

## Recommendations
- [Fix sugerido o mejora]
- [Siguiente paso]
```

---

## Modos de Uso

| Comando | Que hace |
|---------|----------|
| `/qa verify [flujo]` | Verificar que un flujo funciona correctamente |
| `/qa reproduce [bug]` | Intentar reproducir un bug reportado |
| `/qa full [feature]` | QA completo de una feature (happy path + edge cases) |

### Ejemplo: `/qa verify login flow`

```
Fase 1: SETUP - Verificar flujo de login. Criterio: usuario puede loguearse y ver dashboard.
Fase 2: PROVISION - Verificar que existe usuario de prueba en BD.
Fase 3: NAVIGATE - Ir a /login, tomar screenshot.
Fase 4: TEST - Llenar email/password, click Sign In, verificar redireccion a /dashboard.
Fase 5: DOCUMENT - Screenshots en cada paso.
Fase 6: REPORT - Generar report.md con status PASSED/FAILED.
```

---

## Directorio de Output

Todos los artefactos de QA se guardan en:

```
.qa-reports/
  [YYYY-MM-DD]-[nombre]/
    report.md
    screenshots/
      01-nombre.png
      02-nombre.png
      ...
    snapshot-[paso].yaml  (solo si se necesito)
```

---

## Reglas

- SIEMPRE crear el directorio de artefactos antes de empezar
- SIEMPRE tomar screenshots en cada paso critico
- NUNCA volcar snapshots YAML completos al contexto (leerlos on-demand)
- SIEMPRE generar el reporte al final, incluso si todo paso
- Si el servidor no esta corriendo, avisar al usuario en vez de fallar silenciosamente
- Los screenshots se guardan en disco, NO se insertan inline en el reporte (solo paths)
