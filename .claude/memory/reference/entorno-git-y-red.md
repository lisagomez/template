# Entorno: qué se puede y qué no desde una sesión aquí

Hechos de **esta máquina**, no del template (ver [[gobernanza-agentica]], "Dos ámbitos que
NO se mezclan"). **Medido el 2026-08-27**, comando a comando, tras encontrar que la versión
anterior describía OTRA máquina y erraba en casi todos sus puntos.

> **Esta nota ha caducado dos veces en dos días.** Es memoria de máquina viajando dentro de
> un repo que se clona: caduca por diseño, no por descuido. Antes de apoyarte en una línea de
> aquí, vuelve a medirla — cuesta un comando y ya ha costado dos correcciones.

Base: Ubuntu 26.04 LTS sobre **WSL2** (kernel `6.6.87.2-microsoft-standard-WSL2`), home
`/home/gsore`, repo en `/home/gsore/code/template`.

## GitHub

- Remoto **HTTPS** `https://github.com/lisagomez/template.git`. `git` 2.53.0 commitea como
  **lisagomez <lisagomez967@gmail.com>**.
- `gh` **2.46.0** en **`/usr/bin/gh`**, autenticado como **lisagomez** — la MISMA cuenta que
  el remoto, no una ajena. No existe `~/.local/bin/gh`. Scopes `gist, read:org, repo,
  workflow`: **abre** PRs desde la sesión, a nombre de la dueña. **Fusionarlos, no**: el
  clasificador de auto mode bloqueó `gh pr merge` el 2026-08-27, y también un
  `git checkout main && git pull` compuesto (ese sí pasó partido en `checkout` +
  `merge --ff-only`). Los scopes dan el permiso, el arnés no: el merge lo teclea ella con `!`
  o se añade una regla de permisos. Contarlo importa porque el scope invita a prometer un
  merge que la sesión no puede cumplir.
- **En `origin` solo quedan `main` y `golden-sets`** — podado el 2026-08-27. Las 5 ramas
  `claude/*` (PRs #16–#20) e `imprenta-de-clis` se borraron tras comprobar **una a una** que
  fusionarlas en `main` no cambiaba el árbol: `git merge-tree --write-tree main <rama>` contra
  `main^{tree}`. **La ascendencia sola engaña** aquí — un squash rompe el linaje aunque el
  contenido ya esté dentro, y cuatro de esas ramas no eran ancestros de nada. La única que dio
  conflicto (`claude/sdd-parametrizacion-supabase-*`) solo llevaba el borrador viejo del
  PRP-002, con `Estado: PENDIENTE` y las casillas sin marcar.
- **`golden-sets` no se borra nunca.** No comparte historia con `main` (no hay merge-base): es
  la rama huérfana del corpus de C2 capa B. El verificador y la regresión la resuelven por
  `origin/golden-sets` aunque no haya rama local, así que podarla rompe el gate.

## Herramientas

- **Node v20.20.2**, servido por **nvm** (`~/.nvm/versions/node/v20.20.2`) — medido el
  2026-08-30. **NO cumple `engines >=22.18`** del `package.json`, y por eso
  `npm run prueba:contabilidad` revienta: ejecuta un `.ts` directo y Node 20 no sabe.
  El resto del gate pasa entero.
  El entorno **volvió a cambiar**: `~/.local/bin/node` (v22.23.0) ya **no existe**, y nvm
  —que la nota anterior daba por ausente— sí está y gana en el `PATH`. Van dos notas
  seguidas desmentidas por la siguiente medición: **este dato se verifica antes de usarlo,
  no se recuerda.**
  Para cerrar `validate` en esta máquina hace falta un Node ≥22.18 (`nvm install 22`).
- **Go 1.26.7** en `~/.local/go/bin/go`. Es justo la versión buena: la press exige ≥1.26.6 y
  **1.27 la rompe** ([[imprenta-de-clis]]).
- **La imprenta está completa y aquí SÍ se imprime**: `cli-printing-press` **4.31.1** en
  `~/.local/bin`, 9 skills `/printing-press*` en sesión, y `~/printing-press/library` con los
  **5 CLIs** (`digitalocean`, `hcloud`, `polar`, `supabase`, `telegram-bot`).
  `npm run audita:imprenta` sale verde sobre 15 servicios, los 5 en grado **parcial** y el
  `dogfood FAIL` de `polar` reconocido. No hay `.claude/imprenta/indice.json`: el auditor
  resuelve por librería.
- **Docker 29.1.3** en `/usr/bin/docker`, daemon responde, **sin sudo**. Pero **`docker
  compose` NO está**: el plugin no existe y el `docker-compose` del PATH es un shim de Docker
  Desktop para Windows que no llega a esta distro. Los `npm run deploy:*` **no se pueden
  ensayar aquí** — se corren en el servidor, así que no es deuda del template, pero tampoco
  los des por probados.
- `sudo` existe y **pide contraseña interactiva**: nada que necesite `apt` se instala desde
  una sesión.
- Salida HTTPS confirmada (`registry.npmjs.org` → 200).

## Supabase

Sin credenciales, por diseño de boilerplate. **No hay CLI `supabase`** en la máquina y
`.mcp.json` lleva `YOUR_SUPABASE_PROJECT_REF` de marcador. La migración de PRP-002
(`supabase/migrations/20260826231500_create_project_settings.sql`) está escrita y **no
aplicada**.

## Secretos y configuración global

- `~/.config/claude/secrets.env` **presente** (2 líneas), fuera de todo repo. De su contenido
  se declara presencia y longitud, nunca el valor — regla de secretos en pantalla.
- `~/.claude/settings.json` usa `"model": "opus"`, un **alias flotante**, mientras
  `BITACORA-CDC.md` declara `claude-opus-5` pineado. Es config global del usuario, no del
  repo: cambiarlo es un CDC propio y lo decide ella ([[gobernanza-agentica]]).

## Lo que sí está aquí, y la nota anterior negaba

- **`/home/gsore/code/a2aboths` existe** y es navegable: el material de origen de la
  gobernanza ([[material-origen-gobernanza]]) no es una referencia histórica en esta máquina.
- **`~/printing-press/library` existe** con los 5 CLIs. El "el auditor declara *no
  verificable*" era de otra máquina.

## Sin verificar en esta corrida

Playwright **no está instalado en el árbol** (solo `@playwright/mcp` como servidor en
`.mcp.json`), así que no se comprobó si Chromium arranca ni la receta de capturas por
contenedor que describía la nota anterior. Se mide el día que haga falta, no antes.
