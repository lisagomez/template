# Entorno: qué se puede y qué no desde una sesión aquí

Hechos de **esta máquina**, no del template (ver [[gobernanza-agentica]], "Dos ámbitos que
NO se mezclan"). Comprobados el 2026-08-23; la sección de GitHub, actualizada el 2026-08-24.

## GitHub

- `git push` funciona: el remoto es **SSH** (`git@github.com:lisagomez/template.git`).
- **`gh`, corregido el 2026-08-25**: el activo es **`/usr/bin/gh` v2.46.0** (paquete de
  Ubuntu). El v2.98.0 que se instaló en `~/.local/bin/gh` desde el tarball **ya no existe**
  en la máquina; esta nota decía lo contrario y era falsa. Ojo: 2.46 es bastante anterior,
  así que una bandera nueva de `gh` puede no existir aquí — comprobar con `--help` antes de
  usarla en vez de suponerla.
- **Autenticado desde el 2026-08-24** (cuenta `lisagomez`, protocolo **HTTPS** según
  `gh auth status`; esta nota decía SSH). La sesión de
  agente ya abre y fusiona PRs: `gh pr create` + `gh pr merge --merge --delete-branch`
  funcionan — probado en el PR #10. El login en sí lo hizo la usuaria: `gh auth login` es
  interactivo y sigue sin correrse desde una sesión.
- El token vive en `~/.config/gh/hosts.yml`, **fuera del repo**, y `gh auth status` lo
  imprime enmascarado. No hay `GITHUB_TOKEN` ni `GH_TOKEN` en el entorno, y no hacen falta.
- Camino de respaldo si `gh` volviera a estar sin autenticar: rama → commit → `git push -u
  origin <rama>` → **merge local `--no-ff`** → push de `main`. GitHub imprime en el push un
  enlace `.../pull/new/<rama>` para abrir el PR a mano.

## Red: sí, y con eso basta para vigilar la imagen

- Hay salida HTTPS. `hub.docker.com`, `auth.docker.io`, `registry-1.docker.io` y la doc
  oficial de Hermes responden.
- **No hay Docker** (ni cliente ni demonio). Por eso la capa B del SDD se resolvió con el
  **blob de configuración** del registro (entorno, entrypoint) y la documentación oficial,
  sin descargar capas — y por eso la topología de dos dashboards sigue **deducida, no
  probada**. Ver [[infraestructura-agentes]].

## Supabase

El MCP de Supabase responde `Unauthorized`: el token vive en
`~/.config/claude/secrets.env`, fuera del repo, y no está cargado en la sesión. No es deuda
del template — que no tenga credenciales es justo lo que se quiere de un boilerplate.
