# Deploy en Hetzner Cloud cx33

Runbook completo para poner esta app en un **cx33 (4 vCPU / 8 GB RAM / 80 GB NVMe)**
con TLS automatico. De servidor vacio a produccion.

**Stack:** Docker + Next.js standalone + Caddy (reverse proxy y certificados).

---

## Por que cx33 y que aguanta

| Recurso | cx33 | Uso real de este stack |
|---------|------|------------------------|
| vCPU | 4 | app 3.0 / Caddy 0.5 / SO 0.5 |
| RAM | 8 GB | app 4 GB max / Caddy 512 MB / build ~3 GB pico |
| Disco | 80 GB | imagen ~200 MB + capas + logs rotados |

El build de Next.js es lo mas pesado que corre aqui. Con 8 GB entra, pero **sin
swap va justo** si la app anterior sigue viva durante el rebuild. El paso 3 lo resuelve.

Si el trafico crece, el primer cuello es CPU en SSR, no RAM. Sube a cx43 antes de optimizar codigo.

---

## 1. Crear el servidor

En Hetzner Cloud Console:
- **Tipo:** cx33
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
nano .env.production      # rellenar DOMAIN, TLS_EMAIL y las claves
chmod 600 .env.production
```

> **`.env.production` esta en `.gitignore` a proposito.** Vive solo en el
> servidor. Si alguna vez lo ves en un diff, para y revisa.

---

## 6. Levantar

```bash
npm run deploy
```

Equivale a `build` + `up -d` + `ps`. El primer build tarda **3-6 min** en cx33.
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

**Backups:** los datos viven en Supabase, no en el cx33. Este servidor es
desechable: si se pierde, se reconstruye con los pasos 1-6. Lo unico
irrecuperable es `.env.production` — guardalo en tu gestor de contrasenas.
