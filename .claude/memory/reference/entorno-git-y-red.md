# Entorno: qué se puede y qué no desde una sesión aquí

Hechos de **esta máquina**, no del template (ver [[gobernanza-agentica]], "Dos ámbitos que
NO se mezclan"). **Reescrito el 2026-08-26**: la versión anterior describía OTRA máquina
(`/home/gsore`, `gh` 2.46 como `lisagomez`, sin Docker) y un agente que confiara en ella se
habría equivocado en cuatro cosas. Verificar antes de confiar aplica también a esta nota.

## GitHub

- Remoto **HTTPS** `https://github.com/lisagomez/template.git`. El clon es de otra cuenta:
  la sesión commitea en `main` local y **no hace push** salvo instrucción explícita.
- `gh` **2.96.0** en `~/.local/bin/gh`, autenticado como **HuertaVictor** (no `lisagomez`):
  un PR abierto desde aquí sale a nombre de esa cuenta.
- Ramas remotas `claude/*` (5): ya fusionadas por squash en `main` (PRs #16–#20); son
  huérfanas, no trabajo pendiente. No se borran desde aquí (repo ajeno).
- `golden-sets` existe en `origin`; desde el 2026-08-26 el verificador y la regresión la
  resuelven aunque no haya rama local.

## Herramientas

- **Node 22.23.2 vía nvm** (`~/.nvm`, `default -> 22`; el 20.20.2 sigue instalado). El
  template exige ≥22.18 (`.nvmrc`, `engines`). Ojo: el binario `claude` de npm global vive bajo
  el Node 20 y **no arranca con Node 22 activo** ("native binary not installed"); una sesión
  fría se lanza con `$CLAUDE_CODE_EXECPATH` (el `.exe` nativo de la sesión anfitriona) y las
  variables `CLAUDE_CODE_*` retiradas del entorno — probado el 2026-08-26.
- **Docker 29.7.1 funciona sin sudo.** Sirve para lo que el sistema no deja: Chromium de
  Playwright no arranca aquí (8 librerías del sistema ausentes, sin sudo) y las capturas se
  toman con `mcr.microsoft.com/playwright:v<version>-noble --network host`.
- **Go 1.24.6** en `~/.local/bin`: la imprenta de CLIs exige ≥1.26.6 (y 1.27 la rompe). Aquí
  **no se imprime** hasta actualizarlo — decisión del entorno, no del template.
- `sudo` pide contraseña interactiva: nada que necesite `apt` se instala desde una sesión.
- Hay salida HTTPS (npm, registros Docker).

## Supabase

Sin credenciales, por diseño de boilerplate: la migración de PRP-002 está escrita y no
aplicada. El MCP de Supabase no está cargado.

## Lo que NO está en esta máquina

- `/home/gsore/code/a2aboths/...` (material de origen de la gobernanza) — ver
  [[material-origen-gobernanza]]; la referencia es histórica, no navegable desde aquí.
- `~/printing-press/library` ni `.claude/imprenta/indice.json`: el auditor de la imprenta
  declara "no verificable", que es lo correcto.
