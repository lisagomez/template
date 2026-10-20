# La mesa del experto de Soporte SAP, alojada en Cloudflare

La mesa es donde el experto SAP del laboratorio (el HIL, N1) prueba al agente con **sus** casos:

- los escribe como se los contaría a un colega;
- ve al agente trabajar paso a paso, en una línea de tiempo que sale de la cadena de eventos real;
- decide en la sala, le enseña cuando el agente dice «no lo sé» y retroalimenta cada paso y el caso entero.

El laboratorio lee lo que dijo y lo exporta para un PRP o para reglas firmadas.

Ya **no vive en la máquina del laboratorio**: el mismo laboratorio sintético corre en un contenedor de Cloudflare, y la
máquina puede estar apagada.

- **El kit del experto** (cómo se usa, qué probar, qué no hace) está dentro de la mesa: `/mesa/soporte-sap/kit`.
- **El goal**: `docs/goals/soporte-sap-experto.md`.
- **Qué protege qué**:
  - el C3: `.claude/PRPs/PRP-008-soporte-sap.md`, control «La mesa del experto alojada»;
  - la AISIA: revisión 11, daño «Lo que escribe el experto, en un tercero»;
  - la matriz: `docs/goals/soporte-sap-firmas-matriz.md`.

## Cómo está armada

```
navegador del experto ──▶ Cloudflare Access (su correo + un PIN de un solo uso; solo los correos de la política)
                              │  Cf-Access-Jwt-Assertion (JWT RS256 del equipo)
                              ▼
                    Worker «soporte-sap-laboratorio» (scripts/laboratorio-alojado/puerta.ts)
                      verifica el JWT y el rol · solo las rutas de la mesa · sin archivos · sin credenciales
                              ▼
                    Contenedor (scripts/laboratorio-alojado/Dockerfile, este de Norteamérica)
                      vuelve a verificar el JWT · el laboratorio sintético en memoria · OCR con Tesseract
                      solo sale a internet hacia las llaves de Access y el almacén
                              ▼
                    R2 «mesa-del-experto» (jurisdicción de Estados Unidos): los casos del experto, sus pasos y
                    su retroalimentación, filtrados, durante 180 días
```

Lo que sube es **el laboratorio sintético, no el producto**. `configura:deploy` le sigue cerrando al laboratorio la vía de
compose y VPS. Esta vía tiene su propio candado: `scripts/laboratorio-alojado/candado.mjs`, que corre dentro de
`despliega.sh`.

## Lo que cuesta (medido el 2026-10-20)

| Pieza | Plan | Cuánto |
|---|---|---|
| Containers + Workers | Workers Paid | US$5 al mes, con 25 GiB-h de memoria, 375 vCPU-min y 200 GB-h de disco incluidos |
| La instancia | `basic` (1/4 de vCPU, 1 GiB, 4 GB de disco) | Pico medido: 130 MiB; un caso con OCR tarda 2,5–3,1 s. Con unas 30 h despierta al mes, cabe en lo incluido. El contenedor se duerme a los 30 minutos sin uso |
| R2 | Nivel gratuito | 10 GB-mes y un millón de escrituras incluidos; la mesa guarda kilobytes |
| Access | Zero Trust Free | Gratis para menos de 50 personas |

Son precios publicados, no una cotización (fuente: `developers.cloudflare.com/containers/platform/pricing/`). Lo que pase
de lo incluido se cobra por uso: con un experto, céntimos.

## Una vez (lo corre el laboratorio, con `!`)

Cada paso es un comando corto, con ruta relativa desde la raíz del worktree. Los que piden un secreto lo leen sin que
pase por el chat.

1. **La cuenta**: crea una cuenta de Cloudflare y activa **Workers Paid** (Workers & Pages → Plans). Es el único pago.
2. **Entra con wrangler**:

   ```
   ! npx wrangler@4.143.1 login
   ```

3. **El equipo de Zero Trust**: en el panel, Zero Trust → crea tu equipo (por ejemplo, `laboratorio-sap`). Guarda su
   nombre fuera del repo:

   ```
   ! printf 'ACCESS_EQUIPO=%s\n' TU-EQUIPO > ~/.soporte-sap-mesa.env && chmod 600 ~/.soporte-sap-mesa.env
   ```

4. **El almacén**:

   ```
   ! npx wrangler@4.143.1 r2 bucket create mesa-del-experto -J us
   ```

   Luego, en R2 → Manage API tokens, crea un token **Object Read & Write** solo para `mesa-del-experto`. Te da una llave
   de acceso, su secreto y el endpoint S3 de la jurisdicción. Los pones en el paso 7.
5. **El primer despliegue**, con Docker encendido y todo en un commit:

   ```
   ! bash scripts/laboratorio-alojado/despliega.sh
   ```

   Esto pasa:
   - construye la imagen del commit, la revisa por dentro, la sube al registro de Cloudflare y despliega el Worker;
   - termina en rojo si Access no está puesto, y la primera vez es lo esperado;
   - sin los secretos, la mesa no abre: falla cerrada.
6. **Access**: en Workers & Pages → `soporte-sap-laboratorio` → Settings → Domains & Routes → `workers.dev` → **Enable
   Cloudflare Access**.
   - En Zero Trust → Access → Applications, abre la aplicación que se creó y copia su **Application Audience (AUD)
     Tag**.
   - Añade una política **Allow** con los correos del experto y el tuyo, y método de inicio de sesión **One-time PIN**.
   - Para las pruebas automáticas, crea dos **Service Tokens** (experto-de-prueba y laboratorio-de-prueba) y una política
     **Service Auth** que los incluya.
7. **Los secretos** del Worker. Cada uno te pide el valor sin mostrarlo:

   ```
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put ACCESS_AUD
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_EXPERTOS
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_LABORATORIO
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_TOKENS
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_S3_ENDPOINT
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_S3_LLAVE
   ! npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado secret put MESA_S3_SECRETO
   ```

   Qué va en cada uno:
   - `MESA_EXPERTOS` y `MESA_LABORATORIO`: correos separados por comas.
   - `MESA_TOKENS`: `<client-id-1>=experto,<client-id-2>=laboratorio`.
8. **Los tokens de prueba**, en tu archivo local, para que el recorrido entre a la mesa alojada (una línea por valor):

   ```
   ! read -rsp 'experto, client id: ' V && printf 'CF_ACCESS_EXPERTO_ID=%s\n' "$V" >> ~/.soporte-sap-mesa.env && unset V
   ```

   Repite con `CF_ACCESS_EXPERTO_SECRETO`, `CF_ACCESS_LABORATORIO_ID` y `CF_ACCESS_LABORATORIO_SECRETO`.
9. **Comprueba** que sin sesión no abre:

   ```
   ! node scripts/laboratorio-alojado/candado.mjs access https://soporte-sap-laboratorio.<tu-subdominio>.workers.dev
   ```

## Invitar al experto, y quitarle el acceso

- **Invitar**: su correo, en la política de Access y en `MESA_EXPERTOS` (paso 7). Mándale la URL y dile que empiece por
  «Cómo se usa». Entra con su correo y un código: no hay contraseña.
- **Quitar**: sácalo de la política de Access y de `MESA_EXPERTOS`. Lo que ya dijo se queda en R2 hasta que lo borres o
  venza.

## Leer lo que dijo el experto

Entra con tu correo a `/mesa/soporte-sap/laboratorio`. Ahí verás:

- en qué paso falla más el agente;
- cuántas veces dijo «no lo sé»;
- los veredictos;
- las enseñanzas que esperan tu firma, caso por caso.

**Exportar para un PRP** te da un Markdown. Las enseñanzas son **propuestas**: una regla nueva se firma en
`tools/conocimiento` (D2, H-20). La mesa no siembra nada.

Lo de prueba (los tokens de servicio) se cuenta aparte. **Borrar este caso** lo quita del almacén, y no se puede deshacer.

## Apagar

- Sin sesiones, el contenedor **se duerme solo** a los 30 minutos: no corre ni cobra memoria. Al despertar, el
  laboratorio sintético se vuelve a sembrar; lo guardado sigue en R2.
- Para cerrar del todo: desactiva Access o borra el Worker (`npx wrangler@4.143.1 --cwd scripts/laboratorio-alojado
  delete`). R2 se queda hasta que borres el bucket.

## Probar en esta máquina, sin Cloudflare

La misma imagen corre con `docker run`, con una identidad de Access de prueba (llaves locales) y el almacén en disco:

```
docker build -f scripts/laboratorio-alojado/Dockerfile -t soporte-sap-laboratorio:$(git rev-parse --short=12 HEAD) .
node scripts/laboratorio-alojado/identidad-local.mjs <carpeta> http://host.docker.internal:8799/certs
docker run -d --name mesa-local -p 127.0.0.1:8090:8080 --add-host host.docker.internal:host-gateway \
  --env-file <carpeta>/app.env -e MESA_ALMACEN=disco -e MESA_ALMACEN_DIR=/datos -v <almacén>:/datos soporte-sap-laboratorio:<commit>
MESA_IDENTIDAD=local:<carpeta> MESA_LLAVES_HOST=0.0.0.0 node src/features/soporte-sap/mesa/pruebas/recorrido-mesa.mjs http://127.0.0.1:8090 <capturas>
```

`identidad-local.mjs` solo sirve en esta máquina: `ACCESS_CERTS_URL` no admite otra cosa que `127.0.0.1`, `localhost` o
`host.docker.internal`.

## La vitrina de Vercel

Sigue igual: su sección en vivo pasa al laboratorio de la máquina del laboratorio por el túnel, y hoy está apagada. **No
se conecta a la mesa.** El experto entra por Access, no por Vercel, y la vitrina conserva su contrato firmado
(revisión 10).

## Lo que la mesa no hace, o hace a medias

- **No es el producto**: la identidad es la de Access, el estado vive en memoria y los datos son sintéticos o los que
  escribe el experto, filtrados.
- **Un dato sin forma de dato pasa el filtro** (el nombre de una empresa). Se le pide al experto que no lo escriba, y
  queda declarado en la AISIA.
- **Cloudflare ve lo que pasa por la mesa**, porque termina el TLS.
- **El contenedor se fija en el este de Norteamérica**, que puede incluir Canadá: Containers no ofrece una jurisdicción
  «us». R2 sí la ofrece.
- **Un `wrangler deploy` a mano se salta el candado.**
