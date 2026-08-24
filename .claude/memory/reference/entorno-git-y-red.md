# Entorno: qué se puede y qué no desde una sesión aquí

Hechos de **esta máquina**, no del template (ver [[gobernanza-agentica]], "Dos ámbitos que
NO se mezclan"). Comprobados el 2026-08-23.

## GitHub: hay push, no hay PR

- `git push` funciona: el remoto es **SSH** (`git@github.com:lisagomez/template.git`).
- **No hay `gh`** instalado, y **no hay `GITHUB_TOKEN` ni `GH_TOKEN`** en el entorno. No se
  puede abrir ni mergear un PR desde la sesión.
- Lo que sí se puede, y es lo que se hizo: rama → commit → `git push -u origin <rama>` →
  **merge local `--no-ff`** → push de `main`. GitHub imprime en el push un enlace
  `.../pull/new/<rama>`: es lo que hay que darle al usuario si quiere el PR formal.
- Si algún día hace falta PR de verdad: instalar `gh` o poner un token en el entorno. Es
  decisión de la dueña, no del template.

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
