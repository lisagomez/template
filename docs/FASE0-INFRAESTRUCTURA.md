# Fase 0 — Infraestructura de agentes y respaldos

Runbook para levantar los **contenedores Hermes** de un proyecto nacido de este
template, y para definir **qué se respalda y cómo se prueba** que el respaldo sirve.

De servidor vacío a dos agentes corriendo con su estado respaldado y una
restauración verificada.

> **Este documento es un delta sobre [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md).**
> El hardening (usuario `deploy`, SSH, UFW, fail2ban), Docker y el swap **no se
> repiten aquí**: se hacen una sola vez, según ese runbook. Aquí empieza lo que es
> propio de los agentes.

---

## Qué cubre y qué NO

| | |
|---|---|
| **Cubre** | Servidor de agentes · dos contenedores Hermes (`negocio`, `clientes`) · dashboard local por túnel SSH · contrato de respaldo con restauración verificada |
| **NO cubre (todavía, a propósito)** | **Telegram, Slack y cualquier canal de chat externo** |

**Por qué no hay canales de chat en Fase 0.** Un bot de Telegram o Slack no es "una
integración más": es una **superficie de entrada no autenticada** hacia un agente que
tiene llaves. Antes de abrirla hace falta lo que hoy no existe en el proyecto recién
nacido: allowlist de remitentes, modelo de amenazas de esa superficie (**C3**), AISIA
de lo que el agente puede decidir sobre terceros (**C4**) y un gate humano para toda
acción irreversible que se dispare desde el chat.

En Fase 0 el único canal es el **dashboard por túnel SSH** (§8): sin puertos
públicos, autenticado por tu llave SSH, sin superficie que endurecer. Cuando se
añada un canal externo, se añade con su sección de amenazas — no antes.

> **Procedencia de los datos técnicos.** El tag de imagen, los subcomandos
> (`setup`, `gateway run`, `dashboard`), la ruta `/opt/data` y las variables del
> dashboard vienen de los documentos de origen, verificados allí el 2026-06-26.
> **Este documento no los re-verificó.** Confirma tag, subcomandos y variables
> contra la doc oficial de Nous antes de provisionar.
>
> **Verificado el 2026-08-23** contra el registro público: el repositorio existe y el tag
> pineado `v2026.6.19` sigue publicado — pero hay **11 releases más nuevas** (la última,
> `v2026.8.19`). El pineo va dos meses por detrás **a propósito hasta que alguien decida
> moverlo**, que es un CDC. Lo que faltaba no era el pineo: era el sensor que avisa.
> El mecanismo para no volver a enterarse tarde está en
> **[`SDD-hermes-verificacion.md`](SDD-hermes-verificacion.md)** — especificado, aún sin
> implementar. Los subcomandos y las variables siguen **sin re-verificar**: eso es su capa B.

---

## 0. Decisión previa: ¿mismo servidor que la app, o uno aparte?

**Léelo antes de provisionar nada.** Es la decisión que más caro sale corregir.

`DEPLOY-HETZNER.md` dice algo importante sobre el servidor de la app:

> *"Este servidor es desechable: si se pierde, se reconstruye con los pasos 1-6."*

Es cierto **porque los datos de la app viven en Supabase**. Los volúmenes de Hermes
son lo contrario: son **memoria de agente, irrecuperable**. Si se pierden, no hay
Supabase de dónde traerlos.

**Montar estado irrecuperable en un servidor que tratas como desechable es cómo se
pierde.** No por un fallo técnico: por la costumbre de reconstruirlo sin pensar.

### Los números, además, no dan

En un servidor de 8 GB, sumando los límites del `docker-compose.yml` de la app:

| Componente | Límite |
|---|---|
| `app` (Next.js) | 4.0 GB |
| `caddy` | 0.5 GB |
| `hermes-negocio` | 2.0 GB |
| `hermes-clientes` | 2.0 GB |
| Sistema operativo | ~0.5 GB |
| **Total** | **9.0 GB sobre 8 GB disponibles** |

Sobre-suscrito. Y el pico real no es el promedio: `next build` llega a ~3 GB y
compite justo con los agentes. El swap lo absorbe, pero swap significa que **algo se
degrada**; en un box compartido, lo que se degrada es la latencia de los dos.

### Recomendación

| Topología | Cuándo | Qué provisionar |
|---|---|---|
| **Servidor aparte** ← recomendado | Default. Estado irrecuperable separado de la ruta de deploy | CX22 (2 vCPU / 4 GB) dedicado a agentes + swap 2 GB |
| **Mismo servidor** | Presupuesto muy ajustado, o el proyecto aún no tiene app desplegada | 8 GB **y** retunear límites: app a 3 GB, cada Hermes a 1.5 GB, swap 4 GB — con `npm run configura:deploy` la app ya no se los queda todos |

Con servidor aparte el respaldo también se simplifica: un solo box con estado, un
solo inventario que mantener.

---

## 1. El servidor de agentes

Sigue **`DEPLOY-HETZNER.md` §1–§4** (crear servidor, hardening, swap, Docker) con
tres diferencias:

- **Tipo:** CX22 (2 vCPU / 4 GB / 40 GB) si es box dedicado a agentes.
- **Hostname:** `agentes` (o `<proyecto>-agentes`).
- **Firewall:** **solo SSH (TCP 22)**. No abras 80/443: aquí no hay nada público.
  El dashboard va por túnel (§8).

> Verifica el nombre y precio del tipo de servidor en hetzner.com antes de
> provisionar: el catálogo y los precios cambian, y este documento no es la fuente.

### El gotcha que el firewall de red resuelve

**Docker se salta UFW.** Docker escribe sus propias reglas de iptables e ignora UFW
para cualquier puerto que publique con `ports:`. Habilitar UFW **no** protege los
puertos de tus contenedores.

El **Cloud Firewall de Hetzner opera a nivel de red**, fuera de la VM, así que sí
filtra lo que Docker publique. Resuelve el gotcha de raíz.

Aun así, cinturón y tirantes: UFW y fail2ban quedan dentro como defensa en
profundidad, y el dashboard se publica **solo en `127.0.0.1`** (§7). Dos controles
independientes para el mismo riesgo, porque el firewall de red es config remota que
alguien puede aflojar desde una consola web sin tocar el servidor.

---

## 2. Las dos verticales

Dos contenedores, no uno. La separación **no es organizativa: es de radio de daño.**
Cada contenedor tiene su propia memoria, sus propias credenciales y su propio
volumen; una fuga o una inyección en uno no expone el estado del otro.

| Vertical | Opera hacia | Decide sobre | Datos que toca |
|---|---|---|---|
| **`negocio`** | Adentro | Presupuesto, métricas, tareas, proveedores | **Propios** del dueño |
| **`clientes`** | Afuera | Propuestas, seguimiento, contratos | **De terceros** |

### Por qué esta distinción importa para la gobernanza

La vertical **`clientes` toca datos de gente que no firmó nada.** Ahí es donde muerde
el límite de **C5**: el dueño puede firmar riesgos **propios** en
`.claude/gobernanza/REGISTRO-RIESGO.md`, pero **no puede firmar el riesgo de un
tercero.** Si una decisión de esta vertical puede dañar a un cliente final, no hay
entrada de registro que lo autorice — se rediseña o no se hace.

Por eso también toda acción irreversible de `clientes` (enviar una propuesta, firmar,
cobrar) va con **gate humano**, no con autonomía.

`negocio` es más laxo por naturaleza: el dueño se equivoca sobre su propio dinero y
eso sí es firmable.

---

## 3. Estructura en disco

```bash
sudo mkdir -p /opt/hermes/{negocio,clientes}/.hermes
sudo chown -R deploy:deploy /opt/hermes
cd /opt/hermes
```

Queda así:

```
/opt/hermes/
├── docker-compose.yml         # el de §7
├── .env                       # secretos, chmod 600, NUNCA en git
├── negocio/
│   ├── SOUL.md  AGENTS.md  MEMORY.md      # fuente, versionada en tu repo
│   └── .hermes/               # volumen del agente (uid 10000, 0700)
└── clientes/
    ├── SOUL.md  AGENTS.md  MEMORY.md
    └── .hermes/
```

**Por qué bind mounts y no volúmenes nombrados de Docker.** El nombre de un volumen
nombrado depende del nombre del proyecto compose, que a su vez depende del **nombre
del directorio**. Un `mv` inocente convierte `hermes_negocio-hermes` en
`agentes_negocio-hermes` y el script de respaldo sigue corriendo en verde
respaldando una ruta que ya no existe. Con bind mounts la ruta es explícita,
estable y aparece en el inventario tal cual.

> **Los `.hermes` son `0700`, uid 10000.** El agente no puede leer el volumen de su
> vecino — y tampoco puede leer el suyo desde dentro para respaldarlo. Es a
> propósito: ahí viven sus sesiones y sus credenciales. **El respaldo lo hace el
> host como root, jamás el agente** (§9).

---

## 4. Variables de entorno

```bash
cd /opt/hermes
nano .env
chmod 600 .env
```

```bash
# --- Modelo ---
OPENROUTER_API_KEY=

# --- Supabase (si los agentes leen datos del proyecto) ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# --- Dashboard (§8) ---
# Nombres verificados contra la doc oficial de la imagen el 2026-08-23 (capa B del SDD).
# Los anteriores (DASH_USER / DASH_PASS / DASH_SECRET) NO existen: la imagen los ignoraba
# en silencio, así que el runbook creía configurar una autenticación que no configuraba.
HERMES_DASHBOARD=1                      # sin esto el dashboard no arranca
HERMES_DASHBOARD_BASIC_AUTH_USERNAME=
HERMES_DASHBOARD_BASIC_AUTH_PASSWORD=
HERMES_DASHBOARD_BASIC_AUTH_SECRET=     # openssl rand -hex 32 — sesiones estables tras reinicio
```

> **La autenticación del dashboard no se enciende sola.** Su gate engancha cuando el bind
> es no-loopback **y** hay un proveedor de auth registrado. Con las tres variables de
> arriba vacías **no hay proveedor**, y en Fase 0 lo único que te autentica es tu llave
> SSH (§8) — que es un modelo válido, pero conviene saber cuál de los dos te protege.
> `HERMES_DASHBOARD_INSECURE` es hoy un **no-op deprecado**: ya no desactiva nada.

> **C7 — `service_role` tiene BYPASSRLS.** Ninguna política de RLS lo detiene. Esta
> llave entra aquí **solo si los agentes son jobs de plataforma declarados**. Si un
> agente atiende una superficie de negocio, no lleva `service_role`: lleva una
> identidad con RLS aplicada. Y nunca, en ningún contexto, con prefijo
> `NEXT_PUBLIC_`.

> **Secretos en pantalla.** Al depurar, no imprimas el valor de ninguna de estas
> variables. Se confirma presencia enmascarando: `presente/ausente`, largo, y a lo
> sumo 4 caracteres de prefijo. Un valor impreso queda en el transcript y en los
> logs; de ahí no se borra, solo se rota.

Confirma que nada de esto llega a git:

```bash
cat >> .gitignore <<'EOF'
.env
**/.hermes/
EOF
```

---

## 5. Wizard de Hermes (una vez por vertical)

Crea credenciales y configuración **dentro** de cada volumen. Va **antes** del
`docker compose up`.

```bash
for v in negocio clientes; do
  docker run -it --rm -v /opt/hermes/$v/.hermes:/opt/data \
    nousresearch/hermes-agent:v2026.6.19 setup
done
```

En cada wizard:
- **Proveedor:** OpenRouter.
- **Modelo:** uno barato para arrancar; el routing se afina después.
- **Canal de chat:** **ninguno.** Sáltalo. (Ver "Qué NO cubre", arriba.)

> **El tag va PINEADO — `latest` es anti-patrón (C1).** Vale para la imagen del
> agente exactamente igual que para el modelo: un alias auto-actualizable cambia el
> comportamiento del sistema sin diff, sin regresión y sin aprobación. Cambiar este
> tag es un **CDC**: diff, `npm run regresion`, aprobación humana y entrada en
> `.claude/gobernanza/BITACORA-CDC.md`.

---

## 6. SOUL / AGENTS / MEMORY

Hermes los lee desde `HERMES_HOME` (`/opt/data` dentro del contenedor). Cada
vertical lleva los tres:

| Archivo | Qué es |
|---|---|
| `SOUL.md` | Persona: cómo habla y qué tono tiene |
| `AGENTS.md` | Reglas: qué puede y qué no puede hacer, dónde pide gate humano |
| `MEMORY.md` | Hechos estables: presupuesto en `negocio`, plantilla de propuestas en `clientes` |

```bash
for v in negocio clientes; do
  cp /opt/hermes/$v/{SOUL.md,AGENTS.md,MEMORY.md} /opt/hermes/$v/.hermes/
done
```

> **`AGENTS.md` es un prompt: cambiarlo es un CDC (C1).** Es el archivo que define lo
> que el agente se permite hacer. Editarlo "rapidito en el servidor" es exactamente
> el hueco que C1 existe para cerrar. Se edita en el repo, pasa la regresión, se
> aprueba, y recién entonces se copia.

---

## 7. `docker-compose.yml`

```yaml
# =============================================================================
# Agentes Hermes — dos verticales + dashboard local.
# Ningún servicio publica puertos al exterior: el dashboard solo en 127.0.0.1.
# =============================================================================

x-hermes-base: &hermes-base
  # PINEADO POR DIGEST — cambiarlo es un CDC (C1). El tag queda como etiqueta legible;
  # quien manda es el `@sha256:`. Un tag se puede re-publicar; un digest, no.
  image: nousresearch/hermes-agent:v2026.6.19@sha256:9f367c7756ef087661a361536a89f438d57a122b958dc23d82d456b1433e6e9e
  restart: unless-stopped                        # vuelve solo tras reboot
  env_file: /opt/hermes/.env
  deploy:
    resources:
      limits:
        memory: 1536M      # 2 verticales en CX22 (4 GB) + swap. Ver §0.
  logging:
    driver: json-file
    options:
      max-size: "10m"      # sin esto, el disco se llena a los meses
      max-file: "3"

services:
  hermes-negocio:
    <<: *hermes-base
    container_name: hermes-negocio
    command: gateway run
    environment:
      HERMES_DASHBOARD: "1"     # el dashboard es un servicio s6 DENTRO de este contenedor
    ports:
      - "127.0.0.1:9119:9119"   # SOLO localhost. Se abre por túnel SSH (§8).
    volumes:
      - /opt/hermes/negocio/.hermes:/opt/data

  hermes-clientes:
    <<: *hermes-base
    container_name: hermes-clientes
    command: gateway run
    environment:
      HERMES_DASHBOARD: "1"
    ports:
      - "127.0.0.1:9120:9119"   # su propio dashboard: verticales separadas, no comparten
    volumes:
      - /opt/hermes/clientes/.hermes:/opt/data
```

> **Corregido el 2026-08-23 por la capa B del SDD.** Aquí había un tercer servicio
> `hermes-dashboard` con `command: dashboard`. **Ese subcomando no existe en esta imagen**:
> el dashboard corre como servicio supervisado por s6 *dentro* del contenedor del gateway y
> se enciende con `HERMES_DASHBOARD=1`. Un servidor provisionado con el compose anterior
> habría levantado dos agentes y ningún dashboard.
>
> **Y son dos dashboards, no uno.** Un backend sirve a los perfiles *co-ubicados*, y estas
> dos verticales viven en contenedores y volúmenes distintos a propósito — esa separación es
> la frontera de radio de daño, así que el precio es un dashboard por vertical (`9119` y
> `9120` en el host). Antes de provisionar, confírmalo con un arranque real: aquí se
> verificó contra el registro y la documentación, **no contra un contenedor en marcha**.

Tres detalles que no son cosméticos:

- **`restart: unless-stopped`** es lo que hace que los agentes vuelvan solos tras un
  reboot. Se verifica de verdad en §10, reiniciando.
- **`127.0.0.1:9119`** y no `9119`. Sin el prefijo, Docker publica en `0.0.0.0` y
  UFW no lo detiene (§1).
- **Rotación de logs.** El modo de falla es lento y silencioso: disco lleno a los
  meses, y entonces falla todo a la vez.

---

## 8. Levantar y acceder

```bash
cd /opt/hermes
docker compose up -d
docker compose ps                       # 3 servicios "running"
docker compose logs -f hermes-negocio   # Ctrl-C para salir
```

**El dashboard se abre por túnel SSH**, desde tu máquina:

```bash
ssh -L 9119:localhost:9119 deploy@IP_DEL_SERVIDOR
```

Y luego `http://localhost:9119` en tu navegador. No hay puerto abierto en internet:
lo que te autentica es tu llave SSH, no una contraseña de aplicación.

---

## 9. Respaldos

> **El inventario de este capítulo es lo único que se respalda.** No hay respaldo
> implícito. Si un activo no está en la tabla de §9.1, cuando el servidor arda ese
> activo no existe.

Objetivo: **3-2-1-1-0** — 3 copias · 2 medios · 1 fuera de sitio · 1 inmutable ·
**0 errores en una restauración verificada**.

### 9.1 El inventario es un contrato — se llena por proyecto

Cada proyecto tiene activos distintos. La tabla de abajo trae las filas por defecto
de un proyecto de este template; **bórralas o añade las tuyas deliberadamente**, no
por omisión.

**Cómo se decide la criticidad de una fila** — una sola pregunta, en dos partes:

| ¿Se puede reconstruir? | Criticidad | Qué respaldo exige |
|---|---|---|
| Sí, sin pérdida (imagen Docker, certificados TLS, código en git) | **Baja** | Ninguno, o por conveniencia |
| Sí, pero cuesta trabajo o dinero (configuración, datos derivados) | **Media** | Nivel 1 (§9.2) |
| **No** (memoria de agente, datos de cliente, registros con obligación legal) | **Crítica** | Nivel 1 **+** Nivel 2 |

Nadie descubre que un activo era crítico antes de perderlo. Se llena esta tabla
ahora, no después.

| Activo | Dónde | Método | Criticidad | ¿Aplica? |
|---|---|---|---|---|
| Volúmenes `.hermes` ×2 (`negocio`, `clientes`) | `/opt/hermes/*/.hermes` | borg (root) | **Crítica** — memoria irrecuperable | Sí |
| `.env` del servidor de agentes | `/opt/hermes/.env` | borg, **cifrado con `age` antes** | **Crítica** — contiene secretos | Sí |
| `.env.production` de la app | servidor de la app | borg, **cifrado con `age` antes** | **Crítica** | Si hay app desplegada |
| Supabase (tablas del proyecto) | Supabase gestionado | PITR del proveedor + dump lógico mensual | **Crítica** | Si el proyecto usa Supabase |
| Certificados Caddy (`caddy_data`) | volumen docker | borg | Baja — se regeneran solos | Opcional |
| Código y configuración | GitHub | ya versionado | Baja | Sí |
| _[activo propio del proyecto]_ | | | | |

**Regla de exclusión, sin excepciones:** ningún respaldo contiene secretos en claro.
El `.env` y toda credencial se cifran con `age` **antes** de entrar al archivo, con
llave privada que **vive fuera del servidor**. Si el servidor cae en manos ajenas,
el archivo sigue siendo opaco.

### 9.2 Niveles de destino — elige según el inventario

No todo proyecto necesita los tres. El inventario decide:

| Nivel | Qué es | Cuándo es obligatorio | Costo |
|---|---|---|---|
| **N0** | Copia diaria local rotada (7 días) **+ restauración verificada** | **Siempre.** Sin excepción | $0 |
| **N1** | Borg → Hetzner Storage Box, modo **append-only** | Si alguna fila del inventario es **Crítica** | ~€4/mes (BX11, 1 TB) |
| **N2** | Archivo mensual cifrado → Backblaze B2 con **Object Lock** | Si hay obligación legal de retención, o el ransomware es una amenaza real | ~$1/mes |
| **N3** | Copia trimestral en disco cifrado, domicilio fiscal | Si el proyecto factura en México (art. 28 III CFF) | ~$60 una vez |

**N0 no es opcional y no es el fácil.** Es el único nivel que incluye probar que la
restauración funciona; los otros dos son destinos. Un proyecto con N1 y N2 pero sin
N0 tiene tres copias de algo que nadie ha comprobado que se pueda restaurar.

**Por qué dos destinos y no uno (N1 + N2).** Borg da deduplicación y restauración
granular, pero su modelo de `prune` es **incompatible con Object Lock**: el bucket
rechaza los borrados y el costo crece sin techo. El archivo mensual cifrado sí
tolera Object Lock. Cada herramienta hace lo que hace bien.

**Por qué GitHub no es un destino de respaldo.** El token que empuja el respaldo vive
**en el mismo servidor que se respalda**. Un atacante con acceso al host borra origen
y destino en la misma sesión. Un espejo en GitHub es conveniencia; nunca copia de
recuperación.

### 9.3 Retención

| Nivel | Cantidad | Destino | Cubre |
|---|---|---|---|
| Diario | 7 | Storage Box | Error operativo reciente |
| Semanal | 4 | Storage Box | Problema detectado tarde |
| Mensual | 12 | Storage Box + B2 | Corrupción silenciosa, disputa |
| Anual | 7 | B2 con Object Lock | Retención legal + margen |

### 9.4 Instalación (una vez)

```bash
sudo apt update && sudo apt install -y borgbackup age rclone
```

**Storage Box (N1).** Contrata un BX11 y crea una **subcuenta dedicada** (no la
principal) con SSH y directorio propio:

```bash
sudo ssh-keygen -t ed25519 -f /root/.ssh/borg_storagebox -N ""
ssh-copy-id -p 23 -i /root/.ssh/borg_storagebox.pub uXXXXXX-sub1@uXXXXXX.your-storagebox.de
```

**Modo append-only.** En el `authorized_keys` de la subcuenta, antepón a la llave:

```
command="borg serve --append-only --restrict-to-path /home/borg",restrict ssh-ed25519 AAAA...
```

**Inicializar el repositorio:**

```bash
export BORG_REPO="ssh://uXXXXXX-sub1@uXXXXXX.your-storagebox.de:23/./borg/agentes"
export BORG_RSH="ssh -i /root/.ssh/borg_storagebox -p 23"
borg init --encryption=repokey-blake2
borg key export --paper $BORG_REPO /root/borg-key-paper.txt
```

> **Imprime ese archivo, guárdalo físicamente y BÓRRALO del servidor.** Sin la
> llave, el respaldo es ruido cifrado. Este es el punto exacto donde más proyectos
> descubren que en realidad no tenían respaldo.

**Llave `age` para el archivo mensual (N2):**

```bash
age-keygen -o /root/age-proyecto.key      # la PRIVADA sale del servidor
grep "public key" /root/age-proyecto.key  # solo la PÚBLICA se queda
```

El host puede cifrar, no descifrar. La privada va a custodia física junto con la
llave paper de Borg.

**Bucket B2 (N2):** `<proyecto>-archivo` con **Object Lock en governance mode**,
retención por defecto **2555 días** (7 años). Llave de aplicación restringida a ese
bucket y **sin permiso `deleteFiles`**. Luego `rclone config`.

### 9.5 Script diario — `/opt/hermes/respaldo/borg-diario.sh`

Cron **04:17**, como root.

```bash
#!/usr/bin/env bash
set -euo pipefail

export BORG_REPO="ssh://uXXXXXX-sub1@uXXXXXX.your-storagebox.de:23/./borg/agentes"
export BORG_RSH="ssh -i /root/.ssh/borg_storagebox -p 23"
export BORG_PASSCOMMAND="cat /root/.borg-pass"
STAGING=/var/tmp/respaldo-staging
AGE_PUB="age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

rm -rf "$STAGING"; mkdir -p "$STAGING"; chmod 700 "$STAGING"

# --- 1. Dumps consistentes (NUNCA copiar archivos de una BD en caliente) ---
# Una línea por cada base del inventario. Si el proyecto no tiene BD propia, borra.
# docker exec <contenedor-db> pg_dump -U postgres --format=custom <base> > "$STAGING/<base>.dump"

# --- 2. Secretos cifrados ANTES de tocar el archivo ---
age -r "$AGE_PUB" -o "$STAGING/env.age" /opt/hermes/.env

# --- 3. Archivo: exactamente las rutas del inventario de §9.1 ---
borg create --stats --compression zstd,3 \
  --exclude '*/node_modules' --exclude '*/.cache' --exclude '*/tmp' \
  ::'agentes-{now:%Y-%m-%dT%H:%M}' \
  /opt/hermes/negocio/.hermes \
  /opt/hermes/clientes/.hermes \
  /opt/hermes/docker-compose.yml \
  "$STAGING"

rm -rf "$STAGING"

# --- 4. Marca de éxito para el vigilante de §9.8 ---
mkdir -p /var/lib/proyecto
date -Iseconds > /var/lib/proyecto/ultimo-respaldo-ok
```

Instalación del cron y zona horaria (los servidores cloud vienen en UTC; si no la
fijas, "04:17" no significa lo que crees):

```bash
sudo timedatectl set-timezone America/Mexico_City
sudo crontab -e   # añade:  17 4 * * *  /opt/hermes/respaldo/borg-diario.sh
```

> **Gotcha 1 — corre como root en el host, no dentro de un agente.** Los volúmenes
> son `0700`/uid-10000. El agente no puede leerlos, y darle acceso sería entregarle
> sus propias credenciales.

> **Gotcha 2 — `pg_dump` primero, `borg create` después.** Copiar el directorio de
> datos de una base en caliente produce un respaldo que restaura y **luego** se
> corrompe. Es el peor modo de falla que existe, porque parece que funcionó.

### 9.6 Archivo mensual inmutable — `archivo-mensual.sh`

Cron día 1, **05:00**. Solo si el proyecto necesita N2.

```bash
#!/usr/bin/env bash
set -euo pipefail
AGE_PUB="age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
MES=$(date +%Y-%m)
OUT=/var/tmp/agentes-$MES.tar.zst.age

# Dump lógico de Supabase, ADEMÁS del PITR del proveedor
pg_dump "$SUPABASE_URI" --format=custom --no-owner > /var/tmp/supabase-$MES.dump

tar -C /opt/hermes -cf - negocio/.hermes clientes/.hermes \
  | zstd -3 \
  | age -r "$AGE_PUB" > "$OUT"

rclone copyto "$OUT" "b2:proyecto-archivo/$MES/agentes.tar.zst.age"
rclone copyto /var/tmp/supabase-$MES.dump "b2:proyecto-archivo/$MES/supabase.dump"
rm -f "$OUT" /var/tmp/supabase-$MES.dump
```

Object Lock hace el resto: una vez subido, ni el servidor ni la llave de aplicación
pueden borrarlo. **Esta es la copia que sobrevive al ransomware y a la suspensión de
la cuenta del proveedor.**

### 9.7 Los dos gates — sin ellos, el respaldo es una creencia

Mismo principio que el resto de la capa de gobernanza: **verificar antes de
confiar**, con **control negativo** (no basta que pase cuando debe pasar; tiene que
fallar cuando debe fallar).

#### GATE 1 — el append-only es real

Con la llave del servidor, `borg delete` y `borg prune` deben **fallar**:

```bash
borg delete ::algún-archivo   # DEBE terminar en error
```

Si no fallan, la inmutabilidad de N1 **no existe** y toda la carga recae en N2. El
`prune` se ejecuta entonces desde una segunda llave administrativa que **no vive en
el servidor** (se usa a mano, mensual).

#### GATE 3 — la restauración funciona (trimestral, cronometrada)

`/opt/hermes/respaldo/verificar-restauracion.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
INICIO=$(date +%s)
DEST=/var/tmp/restauracion-prueba
rm -rf "$DEST"; mkdir -p "$DEST"

ARCHIVO=$(borg list --last 1 --short)
borg extract --destination "$DEST" "::$ARCHIVO"

# Aserción 1: la memoria del agente existe y NO está vacía
test -s "$DEST"/opt/hermes/negocio/.hermes/MEMORY.md
test -s "$DEST"/opt/hermes/clientes/.hermes/MEMORY.md

# Aserción 2: el secreto cifrado está y es descifrable con la llave de custodia
test -s "$DEST"/var/tmp/respaldo-staging/env.age

# Aserción 3 (por proyecto): un dato de negocio concreto y contable.
# Ej.: si hay BD, restaurar en un postgres efímero y contar filas esperadas.
# test "$FILAS" -ge "$ESPERADAS" || { echo "FALLO: solo $FILAS"; exit 1; }

rm -rf "$DEST"
echo "RTO medido: $(( $(date +%s) - INICIO ))s"
```

**La aserción 3 es la que hace real el gate.** Las dos primeras comprueban que
existen archivos; la tercera comprueba que el **contenido** sirve. Escríbela con un
dato de tu proyecto que sepas contar.

**Prueba el control negativo a mano una vez:** corre el script contra un archivo
corrupto y confirma que sale con exit 1. Un verificador que nunca falla no está
verificando.

> **RPO/RTO solo se declaran después de cerrar GATE 3.** Antes de eso son
> desconocidos, y escribir "RPO 24h · RTO 4h" sin haberlo medido es documentar un
> deseo. Si decides operar sin cerrar el gate, eso **es un riesgo aceptado**: va
> firmado en `.claude/gobernanza/REGISTRO-RIESGO.md` (C5), no asumido en silencio.

### 9.8 Monitoreo — el modo de falla real

El respaldo casi nunca se corrompe. Lo que pasa es que **deja de correr y nadie se
entera durante cinco meses.**

```bash
# cron 09:00 — respaldo-vigilante.sh  (host-job, sin LLM)
ULTIMO=$(cat /var/lib/proyecto/ultimo-respaldo-ok 2>/dev/null || echo "1970-01-01")
HORAS=$(( ($(date +%s) - $(date -d "$ULTIMO" +%s)) / 3600 ))
if [ "$HORAS" -gt 30 ]; then
  # Canal de aviso del proyecto (correo, webhook, lo que exista).
  echo "⚠️ Respaldo sin correr hace ${HORAS}h — revisar borg-diario.sh"
fi
```

**Sin LLM a propósito.** Un vigilante que depende del agente falla exactamente
cuando el agente falla. La alarma vive fuera de lo que vigila.

Pruébalo con una marca sintética: pon una fecha vieja en el archivo y confirma que
avisa. Igual que GATE 1: comprobado que dispara, no supuesto.

### 9.9 Qué NUNCA va a un respaldo en línea

- **Llaves privadas y material criptográfico** (PKI, HSM, firmas). Respaldarlas en
  línea anula la separación que su ceremonia construyó. Van a hardware dedicado, con
  material de recuperación en sobre sellado y custodia física separada.
- **La llave paper de Borg y la llave `age` privada.** Si viven en el servidor que
  respaldas, no hay respaldo: hay un archivo cifrado que nadie puede abrir.
- **Secretos en claro.** Ver la regla de exclusión de §9.1.

Lo que sí se respalda de estos activos es su **configuración** (ya versionada en
git), nunca el material privado.

---

## 9.10 Vigilancia del pineo — el otro extremo del lazo

El respaldo tiene su vigilante (§9.8). El **pineo de la imagen** necesita el suyo, y por la
misma razón: pinear da estabilidad y **quita noticias**. Sin sensor, el rezago no se nota
hasta que duele — así se descubrió que este runbook iba dos meses por detrás.

El script viaja con el repo (`scripts/verifica-hermes.mjs`, diseño en
[`SDD-hermes-verificacion.md`](SDD-hermes-verificacion.md)); **el cron es del entorno**, y
esta sección es lo que hay que instalar en el servidor que lo corra:

```bash
# crontab -e  (lunes 09:00, hora LOCAL del servidor: `timedatectl` primero)
0 9 * * 1  cd /ruta/al/repo && /usr/bin/node scripts/verifica-hermes.mjs >> /var/log/hermes-vigilante.log 2>&1 || \
           echo "vigilante del pineo: exit $? — revisar /var/log/hermes-vigilante.log" | <canal-de-aviso>
```

Los tres códigos de salida **no son intercambiables**, y el cron tiene que distinguirlos:

| Exit | Significa | Qué hace el cron |
|---|---|---|
| `0` | Nada cambió | **Silencio.** No avisa: si avisara cada lunes, dejarías de leerlo |
| `1` | Hay deriva o algo en rojo | Avisa. El informe queda en `hermes-informe.md` |
| `2` | **No pude verificar** (sin red, API cambiada) | Avisa **igual que el 1**. Ausencia de respuesta no es ausencia de deriva |

> Tratar el `2` como un `0` es exactamente el fallo que este mecanismo existe para no
> tener: un control que parece funcionar y no mide nada. Si tu canal de aviso solo mira
> "¿falló?", asegúrate de que `2` cuenta como fallo.

**Pruébalo antes de confiar en él**, igual que GATE 1 y que el vigilante de respaldos:

```bash
node scripts/verifica-hermes.mjs --tag=v0000.0.0     # debe salir 1 (rojo)
node scripts/verifica-hermes.mjs --api=https://127.0.0.1:9   # debe salir 2, nunca 0
```

Y en cada CDC que proponga mover el pineo, antes de firmarlo:

```bash
node scripts/verifica-hermes.mjs --capa-b   # ¿lo que este runbook afirma sigue siendo cierto?
```

---

## 10. Verificación final

- [ ] `docker compose ps` muestra los 3 servicios `running`
- [ ] Cada vertical responde con la voz de su `SOUL.md` y tiene su propia memoria
- [ ] `ssh deploy@IP` funciona con llave; `ssh root@IP` **no**
- [ ] El firewall de red solo permite TCP 22
- [ ] El dashboard abre por túnel y **no** responde en `http://IP:9119` desde fuera
- [ ] `free -h` muestra el swap activo
- [ ] **Reinicia el servidor** (`sudo reboot`) y los contenedores vuelven solos
- [ ] §9.1 llenado: el inventario refleja **este** proyecto, no el de la plantilla
- [ ] `borg-diario.sh` en cron 04:17, primera corrida verde con `--stats`
- [ ] **GATE 1** cerrado: `borg delete` falla con la llave del servidor
- [ ] Llave paper impresa y **borrada del servidor**; llave `age` privada fuera
- [ ] **GATE 3** cerrado: restauración verificada punta a punta, RTO medido y anotado
- [ ] Control negativo probado: el verificador **falla** con un archivo corrupto
- [ ] `respaldo-vigilante.sh` en cron 09:00, probado con marca sintética
- [ ] Si aplica N2: bucket con Object Lock y primera subida confirmada
- [ ] **Plan de Supabase confirmado EN EL DASHBOARD, con PITR.** §9.1 lista "PITR del
      proveedor" como método, pero PITR es un **add-on de pago**: en los planes bajos no
      existe. Si no está contratado, el RPO real de los datos de negocio **es 24h**, no lo
      que diga el plan de respaldo. Se comprueba mirando, no suponiendo

Con todos en verde, la Fase 0 está cerrada.

---

## 11. Costo mensual

| Concepto | Mensual |
|---|---|
| Servidor de agentes CX22 (4 GB) | ~€4 |
| Storage Box BX11 (N1) | ~€4 |
| Backblaze B2 (N2, ~150 GB) | ~$1 |
| Disco externo cifrado (N3) | $60 una vez |
| **Recurrente** | **~$10 USD/mes** |

Precios de referencia — verifícalos antes de contratar.

---

## Apéndice — qué cambió respecto a los documentos de origen

Este archivo consolida `FASE0.md`, `FASE0-hetzner.md` y `FASE0-respaldos.md` del
proyecto Hermes OS. **Los tres se contradecían entre sí en cuatro puntos**; aquí
quedó una sola respuesta por punto:

| Tema | En el origen | Aquí | Por qué |
|---|---|---|---|
| **Modelo de respaldo** | `FASE0.md` §9: tarball → GitHub. `FASE0-respaldos.md`: Borg + B2, y degrada GitHub a "espejo" | Solo Borg + B2. GitHub no es destino | El token de push vive en el box que se respalda: se borran origen y destino en la misma sesión |
| **Tipo de volumen** | `FASE0.md`: bind mounts `~/businessos/…`. `FASE0-respaldos.md`: volúmenes nombrados `/var/lib/docker/volumes/hermes_*` | Bind mounts en `/opt/hermes/` | El nombre del volumen depende del nombre del directorio: un `mv` deja el respaldo corriendo en verde sobre una ruta muerta |
| **Location del servidor** | `FASE0.md`: `fsn1`. `FASE0-hetzner.md`: Ashburn VA | Se elige por latencia, no se fija | Depende de dónde esté el usuario; EU es más barato, US-east mejor para LATAM |
| **Usuario del sistema** | `FASE0.md`: usuario `hermes`, con su propio hardening | Usuario `deploy`, hardening por referencia a `DEPLOY-HETZNER.md` | Dos procedimientos de hardening en el mismo repo divergen; uno solo, referenciado |

Y estos cambios de alcance, pedidos para el boilerplate:

- **Tres verticales → dos.** Se retira `personal`. Quedan `negocio` (datos propios) y
  `clientes` (datos de terceros), que es la frontera que importa para C4 y C5.
- **Telegram fuera.** Los tres bots, sus tokens y el allowlist de chat_id salen por
  completo. En Fase 0 el único canal es el dashboard por túnel SSH.
- **Inventario de respaldo parametrizado.** El origen listaba activos de Hermes OS
  (Postgres del grafo, `trio-workspace`, MSP de Fabric). Aquí §9.1 es una tabla que
  **cada proyecto llena**, con una regla explícita para decidir criticidad.
- **Niveles N0-N3.** El origen imponía el 3-2-1-1-0 completo. Un boilerplate sirve a
  proyectos de tamaños distintos: N0 (probar la restauración) es obligatorio siempre,
  los destinos se eligen según el inventario.
- **Se añade §0**, que no existía en ningún origen: dónde montar los agentes respecto
  del servidor de la app, y por qué el estado irrecuperable no va en el box desechable.
