---
name: google-workspace
description: Google Workspace via gog CLI — Gmail + Calendar for el usuario's accounts
triggers: gmail, calendar, email, correo, eventos, agenda, scheduling, inbox
---

# Google Workspace (gog CLI)

## Accounts

| Account | Services | Use |
|---------|----------|-----|
| `tu-cuenta@gmail.com` | gmail, calendar | Personal — Gmail cleanup, calendar events |
| `tu-cuenta@tu-dominio.com` | calendar | Business — tu proyecto calendar |

## GCP project (gog config) — VERIFICADO 2026-04-29

OAuth client registrado en Google Cloud:
- **Project ID:** `openclaw-487321` (proyecto "Openclaw" en Google Cloud)
- **Project number:** `932271934017`
- **Client name (consola):** `ClaudeClaw CLI` (creado 26 feb 2026, tipo Desktop app)
- **Client ID:** `932271934017-e5p1k77p2pn4hrj78lnte5lom7lv88kr.apps.googleusercontent.com`
- **Config local:** `~/Library/Application Support/gogcli/credentials.json`
- **Tokens encrypted en:** `~/Library/Application Support/gogcli/keyring/`
- **Keyring backend:** file (requiere `KEYRING_PASSWORD` env var en cron)

Console URL del client:
https://console.cloud.google.com/auth/clients?project=openclaw-487321

OAuth scopes habilitados: gmail (read/send/modify), calendar (read/write).

**Otros OAuth clients en el mismo proyecto Openclaw** (no confundir con gog):
| Nombre consola | Prefix | Uso |
|----------------|--------|-----|
| `Openclaw Desktop` | `932271934017-egu1...` | OpenClaw original (anterior a ClaudeClaw) |
| `ClaudeClaw CLI` | `932271934017-e5p1...` | **gog** (Gmail + Calendar) |
| `youtube ctr` | `932271934017-8nim...` | YouTube analytics/CTR (diferente al comments-agent) |
| `ClaudeClaw YouTube Agent` | (a crear) | YouTube comments-agent (force-ssl scope) |

## Automation Flags

Always use these in cron jobs and scripted contexts:
- `--json` — machine-readable output
- `--no-input` — never prompt for user input
- `--max N` — limit results (default 25 is too many)

## Gmail Commands

```bash
# Search inbox (threads)
gog gmail search "in:inbox newer_than:1d" --account=tu-cuenta@gmail.com --max 10 --json

# Search messages (individual emails, not threads)
gog gmail messages search "in:inbox is:unread" --account=tu-cuenta@gmail.com --max 10 --json

# Search by label
gog gmail search "label:PROMOCIONES newer_than:7d" --account=tu-cuenta@gmail.com --max 50

# List labels
gog gmail labels list --account=tu-cuenta@gmail.com --json

# Archive (remove INBOX label)
gog gmail messages modify <messageId> --remove-labels INBOX --account=tu-cuenta@gmail.com

# Send email (plain text)
gog gmail send --to recipient@example.com --subject "Subject" --body "Text" --account=tu-cuenta@gmail.com

# Send email (multi-line via stdin)
gog gmail send --to recipient@example.com --subject "Subject" --body-file - --account=tu-cuenta@gmail.com <<'EOF'
Message body here.
EOF

# Send email (HTML)
gog gmail send --to recipient@example.com --subject "Subject" --body-html "<p>HTML content</p>" --account=tu-cuenta@gmail.com
```

## Calendar Commands

```bash
# Today's events (personal)
gog calendar events primary --from $(date +%Y-%m-%dT00:00:00) --to $(date +%Y-%m-%dT23:59:59) --account=tu-cuenta@gmail.com --json

# Tomorrow's events (personal)
gog calendar events primary --from $(date -v+1d +%Y-%m-%dT00:00:00) --to $(date -v+1d +%Y-%m-%dT23:59:59) --account=tu-cuenta@gmail.com --json

# Today's events (business)
gog calendar events primary --from $(date +%Y-%m-%dT00:00:00) --to $(date +%Y-%m-%dT23:59:59) --account=tu-cuenta@tu-dominio.com --json

# Create event
gog calendar create primary --summary "Title" --from 2026-03-01T10:00:00 --to 2026-03-01T11:00:00 --account=tu-cuenta@gmail.com
```

## Gmail Cleanup Pattern (cron job)

1. Search each low-value label in inbox:
   - `in:inbox label:PROMOCIONES newer_than:7d`
   - `in:inbox label:NEWSLETTERS newer_than:7d`
   - `in:inbox label:NOTIFICACIONES newer_than:7d`
2. Archive each message (remove INBOX label)
3. Count remaining inbox: `gog gmail search "in:inbox" --max 1 --json` (check total)
4. Return empty string if normal, alert if inbox > 20 or error

## Rules

- NEVER send email without el usuario's explicit approval
- NEVER delete emails — only archive (remove INBOX label)
- Confirm destructive calendar actions (delete, modify existing events)
- Use `--account` flag on every command — never rely on defaults
