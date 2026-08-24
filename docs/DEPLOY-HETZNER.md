# Deploy en un VPS (Hetzner Cloud u otro)

Runbook completo para poner esta app en un servidor propio con TLS automatico. De
servidor vacio a produccion.

**Stack:** Docker + Next.js standalone + Caddy (reverse proxy y certificados).

---

## Que servidor necesitas

**Este runbook no te dice un modelo.** Los nombres y las specs de los planes cambian, y
una tabla copiada envejece sin que nadie lo note. Lo que importa no es como se llame el
plan, sino lo que hay dentro:

| Recurso | Minimo real | Por que |
|---------|-------------|---------|
| RAM | **2 GB duros**, 4 GB comodos | El pico de todo el deploy es el **build de Next.js**, no el runtime |
| vCPU | 2 | Con 1 el build tarda, pero entra |
| Disco | 40 GB | Imagen ~200 MB + capas + logs rotados |
| Swap | **obligatorio** con 8 GB o menos | Sin el, el build muere por OOM sin avisar (paso 3) |

Quien decide los limites exactos no es este documento: es
**`npm run configura:deploy`**, que corre EN EL SERVIDOR, mide `nproc` y `/proc/meminfo`
y deriva de ahi cuanta CPU y RAM se lleva la app, cuanta Caddy y cuanto heap usa el
build. Si mañana mueves la app a una maquina mas grande, lo vuelves a correr y ya.

Si el trafico crece, el primer cuello es **CPU en SSR**, no RAM: sube de plan antes de
ponerte a optimizar codigo.

---

## 1. Crear el servidor

En Hetzner Cloud Console:
- **Tipo:** el que cumpla la tabla de arriba (2 GB de RAM como minimo duro)
- **Imagen:** Ubuntu 24.04 LTS
- **SSH key:** subir la tuya (NO uses password)
- **Firewall:** permitir solo `22`, `80`, `443`

Apunta tu dominio antes de seguir: registro **A** de `tuapp.com` -> IP del servidor.
Verifica con `dig +short tuapp.com` que ya responde la IP correcta. Sin DNS
propagado, Caddy no puede emitir el certificado.

---

## 2. Hardening basico

```bash
ssh root@TU_IP

adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/

# Cerrar login root y passwords
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/'            /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
apt update && apt install -y fail2ban && systemctl enable --now fail2ban
```

Reconecta como `deploy` **antes de cerrar esta sesion** (si algo salio mal, la
sesion abierta es tu unica via de rescate).

---

## 3. Swap (obligatorio en 8 GB)

Evita que el OOM killer mate el build a la mitad:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
free -h
```

---

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
newgrp docker
docker --version && docker compose version
```

---

## 5. Codigo y variables

```bash
git clone https://github.com/TU_USUARIO/TU_REPO.git app && cd app
cp .env.production.example .env.production
nano .env.production      # rellenar DOMAIN, TLS_EMAIL, claves y APP_NAME
chmod 600 .env.production

# Mide el servidor, valida el .env y escribe el bloque de tamaño:
npm run configura:deploy -- --escribir
```

> **`.env.production` esta en `.gitignore` a proposito.** Vive solo en el
> servidor. Si alguna vez lo ves en un diff, para y revisa.

El configurador **no es cosmetico**: caza tres fallos que de otro modo descubres tarde.

| Lo que comprueba | Por que importa |
|---|---|
| `NEXT_PUBLIC_SITE_URL` apunta a `DOMAIN` | Si no, **los redirects de OAuth se rompen sin dar error**: el build pasa, el certificado pasa, y el usuario no vuelve del login |
| Placeholders sin tocar (`tuapp.com`, `tu@email.com`) | Caddy pediria un certificado para un dominio que no es tuyo |
| Swap y RAM reales | Sin swap en 8 GB o menos, el build muere por OOM a mitad |
| `SUPABASE_SERVICE_ROLE_KEY` sin prefijo `NEXT_PUBLIC_` | Con el prefijo se inlinea en el bundle del navegador (C7) |

De los secretos solo dice **presente/ausente y el largo**: nunca imprime el valor.

---

## 6. Levantar

```bash
npm run deploy
```

Equivale a `build` + `up -d` + `ps`, y antes pasa el gate (`predeploy`: gobernanza,
regresion y auditoria de credenciales). El primer build tarda **3-6 min** en 4 vCPU.
Caddy pide el certificado solo; la app queda en `https://tuapp.com`.

```bash
npm run deploy:logs      # seguir el arranque
curl -I https://tuapp.com
```

---

## 7. Cerrar el circulo en Supabase

En **Dashboard > Authentication > URL Configuration**:

- **Site URL:** `https://tuapp.com`
- **Redirect URLs:** `https://tuapp.com/**`

Sin esto el login funciona en local y **falla en produccion** redirigiendo a
`localhost:3000`. Es el fallo #1 al estrenar dominio.

---

## 8. Actualizar

```bash
cd ~/app && git pull && npm run deploy
```

Docker reusa capas: los rebuilds bajan a ~1-2 min si no cambiaron las dependencias.

---

## Gotchas que ya estan resueltos aqui

| Sintoma | Causa | Donde se resolvio |
|---------|-------|-------------------|
| `supabaseUrl is required` en el navegador | `NEXT_PUBLIC_*` se inlinea en **build**, no en runtime | Pasadas como `ARG` en `Dockerfile` y `build.args` en compose |
| Certificado no se emite | DNS aun no propaga, o puerto 80 cerrado | Paso 1: verificar `dig` + `ufw` |
| Let's Encrypt rate limit tras varios deploys | Certificados no persistian | Volumenes `caddy_data` / `caddy_config` |
| Build muere sin mensaje (exit 137) | OOM durante `next build` | Swap (paso 3) + `--max-old-space-size=3072` |
| Imagen de ~1 GB | Sin `output: 'standalone'` | Activado en `next.config.ts` |
| Disco lleno a los meses | Logs de Docker sin rotar | `max-size: 10m` / `max-file: 3` en compose |
| App accesible por `IP:3000` saltandose TLS | Puerto publicado por la app | La app usa `expose`, no `ports` |

---

## Operacion

```bash
npm run deploy:ps       # estado y health
npm run deploy:logs     # logs en vivo
npm run deploy:down     # parar todo
docker stats            # CPU/RAM real
docker system prune -af --volumes   # liberar disco (cuidado: borra volumenes sin uso)
```

**Backups:** los datos viven en Supabase, no en el VPS. Este servidor es
desechable: si se pierde, se reconstruye con los pasos 1-6. Lo unico
irrecuperable es `.env.production` — guardalo en tu gestor de contrasenas.

> ⚠️ **"Viven en Supabase" no es un plan de respaldo, es una dependencia.** Lo que
> recuperas es lo que dé **tu plan contratado**, y el PITR es un add-on de pago: en los
> planes bajos no existe. Sin PITR confirmado en el dashboard, el RPO real de tus datos
> **es 24h**. Compruebalo mirando, no suponiendo — y si el proyecto necesita mas, el
> contrato de respaldo completo esta en
> [FASE0-INFRAESTRUCTURA.md §9](FASE0-INFRAESTRUCTURA.md).
>
> Y "desechable" vale para **este** servidor. Si algun dia corre algo con estado propio
> (agentes, colas, volumenes), deja de serlo: ver §0 de ese mismo documento.
