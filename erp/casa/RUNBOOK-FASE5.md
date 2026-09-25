# PRP-004 · Fase 5 · corte de los jobs del ERP en el servidor (runbook)

> ⛔ **Gate humano.** Escrito el 2026-09-25 desde el monorepo; **nada de esto se ha corrido en el
> servidor**. Cada paso se corre a mano, en orden, y el corte (paso 5) solo con el sí del
> laboratorio. Todo comando que toca credenciales las confirma por **presencia**, nunca por valor.

## Qué se corta

| Job | Hoy | Después |
|---|---|---|
| Cosechador (cron cada 10 min) | `python3 …/businessos/cosechar-activos.py detectar` y `concretar --auto` | `python3 /home/hermes/template/erp/bin/cosechar-activos.py …` |
| Detector swm-act (semanal, `weekly-jobs.sh`) | `python3 detector-swm-act.py` en `/home/hermes/repo/businessos` | `python3 /home/hermes/template/erp/bin/detector-swm-act.py` con `REPO_BUSINESSOS` |

Los scripts **no cambian de comportamiento** al moverse: el cosechador lee sus rutas del entorno
(`TRIO_REPO_DIR`, `COSECHA_MEMORIA`, `HERMES_STATE`) y el detector deduce el monorepo de su propia
ubicación (`erp/bin/` → raíz). Lo único nuevo es de dónde se leen, y que el monorepo es **privado**:
el servidor necesita una credencial para clonarlo.

## 0 · Precondiciones

- La Fase 4 aprobada y corrida (`erp/casa/fase4-reubicacion.sql`): el detector del template
  espera `template/erp/…`. Sin ella no rompe nada (ACT-0012 no lo mira ningún detector), pero el
  catálogo diría una ruta que ya no es verdad.
- El PR del template con la Fase 3B mergeado en `main`.

## 1 · Llave de despliegue de SOLO LECTURA (nunca un PAT de la cuenta)

En el servidor, como `hermes`:

```bash
ssh-keygen -t ed25519 -N '' -C 'servidor: template (solo lectura)' -f ~/.ssh/template_deploy
cat >> ~/.ssh/config <<'EOF'
Host github-template
  HostName github.com
  User git
  IdentityFile ~/.ssh/template_deploy
  IdentitiesOnly yes
EOF
cat ~/.ssh/template_deploy.pub     # es la parte pública: se puede copiar
```

El laboratorio la registra en el repo del template, **sin** permiso de escritura (gate humano):
GitHub → template → Settings → Deploy keys → Add → pegar la pública, **Allow write access sin
marcar**. O desde una máquina con `gh`: `gh repo deploy-key add template_deploy.pub --repo
<dueño>/template --title 'servidor (solo lectura)'` (sin `--allow-write`).

## 2 · Clon y prueba de que es de solo lectura

```bash
git clone git@github-template:<dueño>/template.git /home/hermes/template
git -C /home/hermes/template log --oneline -1
# Debe FALLAR con "marked as read only" / permission denied: si pasa, la llave escribe → parar.
git -C /home/hermes/template push --dry-run origin HEAD:refs/heads/prueba-solo-lectura
```

## 3 · Medir antes de tocar (y respaldar)

```bash
mkdir -p ~/state
crontab -l > ~/state/crontab-antes-fase5-$(date +%F).txt          # el respaldo del corte
crontab -l | grep -n -E 'cosechar-activos|weekly-jobs'              # las líneas que se cambiarán
grep -n 'detector-swm-act' /home/hermes/repo/businessos/weekly-jobs.sh
# Presencia (nunca valor) de lo que necesitan los dos scripts:
( set -a; . /home/hermes/repo/businessos/.env; set +a
  for k in ERP_DB_URL ERP_CLIENTE_CASA SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SLACK_BOT_TOKEN; do
    v="${!k:-}"; [ -n "$v" ] && echo "$k presente (largo ${#v})" || echo "$k AUSENTE"; done )
```

Anota la línea exacta del cron del cosechador: el paso 4 la copia **cambiando solo la ruta del
script**, con el mismo `cd`, el mismo `.env` y el mismo log.

## 4 · En paralelo, en seco (una semana, o una corrida manual acordada)

El viejo sigue operando; el nuevo corre con `--dry-run` y escribe a otro log. En `crontab -e`,
**añadir** (sin quitar nada), con el prefijo de entorno medido en el paso 3:

```cron
*/10 * * * * git -C /home/hermes/template pull -q --ff-only && <prefijo medido> python3 /home/hermes/template/erp/bin/cosechar-activos.py detectar --dry-run >> /home/hermes/logs/cosecha-template-seco.log 2>&1
```

Y una corrida del detector, lado a lado:

```bash
cd /home/hermes/repo/businessos && set -a && . ./.env && set +a
python3 detector-swm-act.py --dry-run                                   > ~/logs/swm-act-viejo.txt
REPO_BUSINESSOS=/home/hermes/repo/businessos \
  python3 /home/hermes/template/erp/bin/detector-swm-act.py --dry-run   > ~/logs/swm-act-template.txt
diff ~/logs/swm-act-viejo.txt ~/logs/swm-act-template.txt
```

**Diferencias esperadas** (ensayadas contra una copia del catálogo el 2026-09-25): el detector
nuevo propone como NUEVO los 9 archivos de `template/erp/{bin,reglas,migrations}` y los activos del
inventario del template (`template/…`), que el catálogo de la casa aún no tiene uno por uno; **cero
HUÉRFANO y cero REUBICAR**. Cualquier HUÉRFANO o REUBICAR es motivo para parar.

El cosechador en seco debe mostrar las mismas tareas que el viejo cosechó en ese periodo
(`[dry-run] <task>: alta act_activo …` frente a las altas reales en `host-jobs.log`).

## 5 · Corte (gate humano: el sí del laboratorio)

Un solo escritor por fila: el cosechador viejo y el nuevo **no pueden correr a la vez sin
`--dry-run`**. Por eso el corte es **editar la misma línea**, no añadir otra:

```bash
crontab -e
#  · en la línea del cosechador medida en el paso 3: …/businessos/cosechar-activos.py
#    → /home/hermes/template/erp/bin/cosechar-activos.py, y anteponer
#    `git -C /home/hermes/template pull -q --ff-only &&`
#  · borrar la línea de --dry-run del paso 4
#  · añadir el detector semanal desde el template, a la hora del weekly de hoy:
#    <hora del weekly> cd /home/hermes/repo/businessos && set -a && . ./.env && set +a && REPO_BUSINESSOS=/home/hermes/repo/businessos python3 /home/hermes/template/erp/bin/detector-swm-act.py >> /home/hermes/logs/host-jobs.log 2>&1
crontab -l | grep -n -E 'cosechar-activos|detector-swm-act'   # comprobar: una sola línea de cada uno
```

El bloque del detector dentro de `weekly-jobs.sh` lo retira el PR de la Fase 6 (vive en
`hermes-os-a2a`; editarlo a mano en el servidor lo perdería el próximo pull). Mientras ese PR no se
mergee, el detector corre dos veces por semana: es de solo lectura y solo **propone**, así que el
único efecto es un aviso duplicado. Si se quiere evitar, cortar el detector el mismo día que se
mergea la Fase 6.

## 6 · Validación

- Primera corrida real del cosechador desde el template en `host-jobs.log` (o su log) con `rc=0` y
  las mismas tareas que el paralelo en seco.
- Primera corrida semanal del detector con `rc=0` y los mismos hallazgos que el paso 4.
- `.env` confirmado por presencia (paso 3), nunca impreso.

## Reverso

```bash
crontab ~/state/crontab-antes-fase5-<fecha>.txt   # vuelve el cron exacto de antes
```

El clon y la llave pueden quedarse (solo lectura); para retirarlos: borrar la deploy key en GitHub y
`rm -rf /home/hermes/template ~/.ssh/template_deploy*`.
