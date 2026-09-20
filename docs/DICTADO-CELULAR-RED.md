# El celular como micrófono: los dos caminos de red

La app `/dictar` corre en tu PC y el teléfono la abre por HTTPS (el micrófono del navegador lo
exige fuera de `localhost`). Hay dos formas de que el teléfono llegue a la PC; las dos se prueban
con `node scripts/laboratorio-voz/captura-movil.mjs` (iPhone emulado) contra la dirección real.

## Camino 1 — Tailscale (recomendado)

Sin certificado propio, sin abrir puertos, sin PowerShell como administrador, y funciona fuera
de casa mientras los dos aparatos estén en tu tailnet.

1. En la PC (WSL2): `tailscale up` y `tailscale serve --bg 3000` (o el `serve` que ya tengas hacia
   `http://127.0.0.1:3000`). `tailscale status` da el nombre, por ejemplo `kyara.tail65d848.ts.net`.
2. En el teléfono: la app Tailscale con la misma cuenta, en verde.
3. Abrir `https://<nombre>.ts.net/dictar` y emparejar una vez (QR desde un navegador ya
   emparejado, o teclear el token). «Añadir a inicio» para instalarla.

`dictado instala` imprime esta dirección si encuentra Tailscale. Medido el 2026-09-20 con el
laboratorio emulando un iPhone contra la dirección de Tailscale: página sin desborde, emparejar
por enlace, transcribir y guardar un veredicto, todo por el mismo camino que usa el teléfono.

## Camino 2 — la misma wifi (LAN)

Sirve sin Tailscale, pero exige dos cosas que Windows no deja hacer sin administrador y sin
tocar el certificado:

1. `npm run dev:movil` (HTTPS con certificado autofirmado y escucha en `0.0.0.0`), o el build de
   producción detrás de un proxy con certificado propio (mkcert).
2. **En Windows, PowerShell como administrador:** `tools/dictado/windows/red-movil.ps1` abre el
   puerto 3000 de WSL2 al teléfono (portproxy + regla de firewall solo en redes privadas). Da la
   URL. `-Quitar` lo deshace.
3. En el teléfono, misma wifi: `https://<ip-de-la-pc>:3000/dictar`, aceptar el certificado,
   emparejar e instalar.

## Lo que no cambia en ninguno de los dos

- Sin el token no se transcribe ni se pega nada (C3). El token no viaja por la URL más que en
  el fragmento `#t=` del enlace de emparejar, que el navegador nunca manda al servidor.
- El audio se transcribe en la PC y se borra; no sale a ningún tercero (C4).
- Exponer la PC fuera de la LAN o de la tailnet (un puerto a internet) es otra decisión, con
  modelo de amenazas y firma (C3). Ninguno de los dos caminos lo hace.
