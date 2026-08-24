# Entorno: qué se puede y qué no desde una sesión aquí

Hechos de **esta máquina**, no del template (ver [[gobernanza-agentica]], "Dos ámbitos que
NO se mezclan"). Comprobados el 2026-08-23.

## GitHub

- `git push` funciona: el remoto es **SSH** (`git@github.com:lisagomez/template.git`).
- **`gh` instalado el 2026-08-23**: v2.98.0 en `~/.local/bin/gh` (ya en PATH). Se instaló
  desde el tarball oficial **con checksum verificado**, sin `sudo` — no hay sudo sin
  contraseña en esta máquina, y para un binario de usuario tampoco hace falta. Actualizarlo
  es repetir el mismo paso con la release nueva; no hay apt que lo haga solo.
- **La autenticación es del usuario**: `gh auth login` es interactivo y no se corre desde
  una sesión de agente. Hasta que se haga, `gh` está instalado pero no puede abrir PRs.
  Tampoco hay `GITHUB_TOKEN` ni `GH_TOKEN` en el entorno.
- Sin `gh` autenticado, el camino que funciona es: rama → commit → `git push -u origin
  <rama>` → **merge local `--no-ff`** → push de `main`. GitHub imprime en el push un enlace
  `.../pull/new/<rama>` para abrir el PR a mano.

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
