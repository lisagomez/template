# Hermes local y el skill global `/hermes-update` — en qué quedamos (2026-09-14)

## Dos Hermes que no son el mismo

- **Local, en esta máquina**: instalación git en `~/.hermes/hermes-agent` (rama `main`, **clon
  superficial `--depth 1`**, venv dentro, wrapper `~/.local/bin/hermes`). Gateway como unidad
  systemd **de usuario** (`~/.config/systemd/user/hermes-gateway.service`, sin sudo; `sudo -n`
  no funciona aquí). Canales Telegram, Discord y WhatsApp. Se actualiza con su propio
  `hermes update` (`--check` y `--plan` son de solo lectura; `--backup` fuerza zip completo;
  `--yes` no bloquea; restore = `hermes import <zip>` desde v0.21.3).
- **Producción**: imagen `nousresearch/hermes-agent` pineada por digest en `.hermes-baseline.json`,
  vigilada por `npm run vigila:hermes`; mover el pin es CDC humano. Ver
  [[infraestructura-agentes]] y `docs/SDD-hermes-verificacion.md`.

Confundirlos lleva a "actualizar Hermes" tocando el pin de producción, o a creer que el vigilante
del repo cubre la instalación local. **No la cubre.**

## El skill global `/hermes-update`

Vive **fuera del repo**, en `~/.claude/skills/hermes-update/` (SKILL.md + `scripts/hermes_update.py`
solo stdlib + `references/actualizador-de-hermes.md` con los hechos medidos del actualizador). Se
decidió global porque Hermes es herramienta de la máquina, no del template que se clona a clientes;
por eso no pasa por el CDC del repo y esta memoria es lo único que lo registra aquí.

Se compiló con `/goal-compiler` (spec en `~/.claude/specs/GOAL-hermes-update.md`) y el `/goal`
convergió en una sesión. Tres pasos: `revisa` (solo lectura: estado, salud en semáforo, changelog
destilado por grupos, relación con la fábrica, VEREDICTO con gates) → **una** pregunta al humano →
`aplica --si` (respaldo completo + `hermes update --yes`, log en `~/.hermes/logs/hermes-update/`)
→ `verifica` (HEAD == objetivo del recibo, gateway con pid nuevo y canales conectados, doctor sin
regresiones, recibo humano con rollback en tres líneas). No reimplementa nada de `hermes update`:
orquesta y pone gates (config que no parsea, sin respaldo, sin sí explícito, disco, método no git).

## Lo que se encontró ese día (y se arregló con el sí del dueño)

- **`~/.hermes/config.yaml` llevaba días roto**: un bloque `bot_token/allowed_user_ids/…` metido bajo
  `platform_toolsets.telegram` (que es una lista). Hermes corría con la config **por defecto** e
  ignoraba todos los overrides; el aviso salía en **stderr** de `hermes --version`, donde nadie mira.
  Respaldo `config.yaml.bak-2026-09-14`; se quitaron las 8 líneas (las opciones estaban duplicadas
  en el `telegram:` de nivel superior).
- **El token de Telegram de `.env` estaba revocado** desde el 2026-09-13 07:04 (951 `InvalidToken`;
  el bot nunca conectó). El válido (bot `liziris_bot`) era el del bloque roto. Probados ambos con
  `getMe`, el válido pasó a `.env` (respaldo `.env.bak-2026-09-14`). Conectó a las 23:19:08.
- **El gateway corría código de junio**: arrancó el 13/09 07:04, antes de la actualización de las
  08:59, y nadie lo reinició. `revisa` compara arranque del gateway con el reflog y lo avisa.
- No es incidente (C6): sin fuga ni acción irreversible no autorizada — fallo operativo del agente
  personal, cerrado con auto-blindaje en el SKILL.md.

## Corrida real

v0.21.2 @ `422bc9bd` → **v0.21.3 @ `f9ea3a53`** (533 commits, 94 s): zip de 285 MB en 13,7 s,
`reset --hard` por "orphan divergence" (clon superficial; Hermes guarda el HEAD previo en
`refs/hermes-update-backups/`), deps, web UI, **config v30 → v45**, gateway drenado y reiniciado
(pid 357 → 222610), recibo `outcome=success`, flota `current`. La migración avisó de rarezas
previas de la config (toolset `moa` desconocido en telegram; `teams` y `google_chat` sin toolsets)
que siguen en la cancha del dueño.

## Lecciones que ya están en el skill

- **Upstream no se está quieto**: 15 commits nuevos durante los 94 s, 55 una hora después. "Al día"
  se mide contra el objetivo del recibo (`post_update.sha`), no contra la punta de `origin/main`;
  "N commits detrás" justo después de actualizar es información, no fallo.
- `hermes --version` llama **upstream** a la punta remota y **local** al HEAD.
- El changelog sale de la API de GitHub (`gh api`, `curl` de respaldo) porque el clon no tiene
  historial; igual que hace el propio `--check` de Hermes.
- En segundo plano, sin `line_buffering` la salida y el log quedan vacíos hasta el final.
