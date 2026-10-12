# La vitrina de Soporte SAP en Vercel

Una URL de Vercel, protegida, con Soporte SAP en bento-grid:

- **la vitrina de los tres niveles**, momento a momento;
- **el journey de experiencia**;
- **el deck para consultoras**, con su PDF;
- **el manual por rol**;
- **una sección en vivo** que pasa al laboratorio que corre en la máquina del laboratorio.

Todo con datos sintéticos. El producto no se despliega aquí, y el laboratorio tampoco: Vercel solo sirve la vitrina, y lo en vivo llega a la
máquina del laboratorio por un túnel, con cada petición firmada.

Qué protege qué: el C3 (`.claude/PRPs/PRP-008-soporte-sap.md`, «La vitrina y la sección en vivo») y la AISIA (revisión
10, «Dato real en la sección en vivo»).

## Cómo está armada

```
navegador del invitado ──(sesión de Vercel)──▶ Vercel: /vitrina/soporte-sap/*   (solo la vitrina; lo demás, 404)
                                                  │  /api/vitrina/soporte-sap/en-vivo: filtra datos, FIRMA
                                                  ▼
                                    túnel (Tailscale Funnel: TLS hasta la máquina)
                                                  ▼
                       máquina del laboratorio: portero 127.0.0.1:8787  ── verifica la firma, solo /api/soporte-sap,
                                                  │                          solo documentos de muestra, filtra datos
                                                  ▼
                                   laboratorio 127.0.0.1:3011 (en memoria, sintético)
```

## Una vez

Antes de abrir el túnel, **firma la revisión 10 de la AISIA**: `docs/goals/soporte-sap-AISIA-revision-vitrina.md`, que
después se mueve a `.claude/gobernanza/AISIA-soporte-sap.md`.

1. **Entra a Vercel**, en una terminal aparte, porque es interactivo: `npx vercel@63.1.2 login`.
2. **Enlaza el proyecto**, desde la raíz de este worktree: `npx vercel@63.1.2 link --yes --project soporte-sap-vitrina`.
3. **Protege todos los despliegues.** En el panel de Vercel, entra al proyecto y luego a Settings → Deployment Protection:
   - activa **Vercel Authentication** en **All Deployments**, que en el plan Hobby no cuesta;
   - en **Protection Bypass for Automation**, crea un secreto y guárdalo sin que pase por el chat, en una terminal
     aparte:

   ```bash
   read -rsp 'bypass: ' B && printf 'VERCEL_AUTOMATION_BYPASS_SECRET=%s\n' "$B" > ~/.soporte-sap-vitrina.env && chmod 600 ~/.soporte-sap-vitrina.env && unset B
   ```

   Con ese secreto, el recorrido de evidencia (`recorrido-vitrina.mjs`) entra a la vitrina protegida.
4. **Primer despliegue**: `bash scripts/vitrina/despliega.sh`.
   - Construye aquí, como vitrina, y a Vercel sube solo el resultado.
   - Al final debe decir «sin sesión no abre». Si no, la protección del paso 3 no está, y hay que activarla ya.
5. **El túnel.** Se recomienda Tailscale Funnel: es gratis, da una URL estable y el TLS termina en esta máquina.
   - Instala Tailscale, entra con `tailscale up` y publica el portero con `tailscale funnel --bg 8787`.
   - La URL es `https://<máquina>.<tailnet>.ts.net`.
6. **El secreto**: `bash scripts/vitrina/siembra-secreto.sh https://<vitrina>.vercel.app https://<máquina>.<tailnet>.ts.net`.
   Después, redespliega: `bash scripts/vitrina/despliega.sh`.

## Cada vez que quieras lo en vivo

- **Para encenderlo**: `bash scripts/vitrina/en-vivo.sh`.
  - Levanta el laboratorio en 127.0.0.1:3011 y el portero en 127.0.0.1:8787.
  - El portero no arranca si la vitrina no responde «protegida», y se apaga si deja de hacerlo.
  - Con `--bg`, el funnel de Tailscale sigue publicado.
- **Para apagarlo**: Ctrl+C en `en-vivo.sh`. La sección en vivo dirá «apagado», y el resto de la vitrina sigue.
  - Para cerrar también el túnel: `tailscale funnel reset`.

## A quién se invita

Solo entra quien inicia sesión en Vercel con acceso al proyecto, quien tiene el enlace para compartir (en Hobby, uno por
cuenta) o quien trae el bypass de automatización. Invita a quien vaya a ver datos sintéticos, y nada más: dentro del
laboratorio, cualquiera elige su identidad, también la de superadministrador (brecha declarada en el C3).

## Si cambia el producto

- **Los momentos congelados**: con el laboratorio encendido, `node src/features/soporte-sap/vitrina/genera.mjs http://localhost:3011`.
- **Las capturas**: `node src/features/soporte-sap/pruebas/recorrido.mjs http://localhost:3011 public/vitrina/soporte-sap/capturas`.
- **El manual**: `node src/features/soporte-sap/vitrina/genera-manual.ts`.
- **El PDF del deck**, con la vitrina servida en local: `node src/features/soporte-sap/vitrina/imprime-deck.mjs <url>`.
- **La evidencia**: `node src/features/soporte-sap/vitrina/recorrido-vitrina.mjs <url> <carpeta>`, con `--apagado` si la
  máquina está apagada.
