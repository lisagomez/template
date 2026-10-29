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
                      con salida a internet (sin modelo; ver «Lo que la mesa no hace»)
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

## Una vez (lo corre el laboratorio)

Los pasos del panel se hacen en el navegador. Los comandos van en una **terminal WSL aparte**, no con `!`: el login abre
una URL que hay que ver a tiempo, el despliegue tarda minutos y los secretos se escriben en un aviso que no los muestra
(con `!` pasan a segundo plano a los 120 s). Desde `~/mesa-wt/scripts/laboratorio-alojado`, con
`export WRANGLER_SEND_METRICS=false`. Probado de punta a punta el 2026-10-21.

1. **La cuenta**: crea una cuenta de Cloudflare y activa **Workers Paid**. En el panel nuevo, los planes están en
   `https://dash.cloudflare.com/?to=/:account/workers/plans`; lo activo se ve en Billing → Subscriptions. Activa también
   **R2** (R2 Object Storage; el nivel gratuito basta). Es el único pago.
2. **Entra con wrangler**: `npx wrangler@4.143.1 login --browser=false`, y abre la URL que imprime en el navegador donde
   tienes la sesión de Cloudflare. La respuesta vuelve sola a la terminal.
3. **El equipo de Zero Trust**: entra a `https://one.dash.cloudflare.com/`. Cloudflare crea un equipo con un nombre al
   azar: cámbialo en Settings → Team domain → Edit (por ejemplo, `laboratorio-sap`), con el plan **Free**. Es la
   dirección que ve el experto al entrar. Guarda el nombre fuera del repo:

   ```
   printf 'ACCESS_EQUIPO=%s\n' TU-EQUIPO > ~/.soporte-sap-mesa.env && chmod 600 ~/.soporte-sap-mesa.env
   ```

   La lista de recomendaciones de Zero Trust (dispositivos, DNS, túnel) no hace falta.
4. **El almacén**: `npx wrangler@4.143.1 r2 bucket create mesa-del-experto -J us`.
5. **El subdominio** de Workers sale de tu correo: si no quieres que el experto lo vea en la URL, cámbialo antes de
   desplegar (Workers & Pages → Account details → Subdomain).
6. **El primer despliegue**, con Docker encendido y todo en un commit:

   ```
   bash ~/mesa-wt/scripts/laboratorio-alojado/despliega.sh 2>&1 | tee ~/mesa-despliegue.log
   ```

   Esto pasa:
   - construye la imagen del commit, la revisa por dentro, la sube al registro de Cloudflare y despliega el Worker;
   - termina en rojo si Access no está puesto, y la primera vez es lo esperado;
   - sin los secretos, la mesa no abre: falla cerrada.
7. **Access**: en Workers & Pages → `soporte-sap-laboratorio` → Domains → fila **Production** → **Enable Access** →
   **Protect this Worker behind Access**.
   - **Scope: All traffic** (viene marcado «Previews only», que deja sin puerta la dirección del experto).
   - **Política: Cloudflare account** (solo tú). **Nunca «Email domain»**: con Gmail, deja pasar a cualquier cuenta de
     Gmail.
   - **Sesión: 24 horas.**
   - El **AUD** está en Zero Trust → Access controls → Applications → la aplicación del Worker. No es un secreto (Access
     lo manda en una cabecera), pero va como secreto en el paso 9.
8. **Los tokens de prueba**, para que el recorrido entre a la mesa alojada. En Zero Trust → Access controls → Service
   credentials → Service Tokens, crea `experto-de-prueba` y `laboratorio-de-prueba`, con la duración más corta que
   ofrezca. **El secreto se muestra una vez**: guárdalo en el momento, un valor por línea (pega solo el valor, sin
   `CF-Access-Client-Id:` delante):

   ```
   read -rsp 'experto, client id: ' V && printf 'CF_ACCESS_EXPERTO_ID=%s\n' "$V" >> ~/.soporte-sap-mesa.env && unset V; echo
   ```

   Repite con `CF_ACCESS_EXPERTO_SECRETO`, `CF_ACCESS_LABORATORIO_ID` y `CF_ACCESS_LABORATORIO_SECRETO`. Luego, en Access
   controls → Policies, crea `mesa-pruebas` (**Service Auth**, Include → **Service Token** → los dos; nunca «Any Access
   Service Token») y añádela en la pestaña Access del Worker.
9. **Los secretos** del Worker. Cada `secret put` pide el valor sin mostrarlo:

   ```
   npx wrangler@4.143.1 secret put ACCESS_AUD
   npx wrangler@4.143.1 secret put MESA_LABORATORIO
   npx wrangler@4.143.1 secret put MESA_S3_ENDPOINT
   npx wrangler@4.143.1 secret put MESA_S3_LLAVE
   npx wrangler@4.143.1 secret put MESA_S3_SECRETO
   ```

   - `MESA_LABORATORIO`: tu correo, **el mismo con el que entras a Access**, sin comillas. `MESA_EXPERTOS` va al invitar
     (abajo), no antes.
   - Los tres de R2 salen de R2 → Manage API tokens → **Create Account API token**: **Object Read & Write**, solo para
     `mesa-del-experto`. `MESA_S3_ENDPOINT` es la URL «S3 API» del bucket (Settings), con `.us.`.
   - `MESA_TOKENS` se arma con los dos Client ID de tu archivo, sin que pasen por la pantalla (tres líneas cortas: una
     línea larga se parte al copiarla):

   ```
   E=$(grep '^CF_ACCESS_EXPERTO_ID=' ~/.soporte-sap-mesa.env | cut -d= -f2-)
   L=$(grep '^CF_ACCESS_LABORATORIO_ID=' ~/.soporte-sap-mesa.env | cut -d= -f2-)
   printf '%s=experto,%s=laboratorio' "$E" "$L" | npx wrangler@4.143.1 secret put MESA_TOKENS
   ```

10. **Redespliega** (el paso 6 otra vez): **un contenedor encendido no ve los secretos nuevos**, y hasta que arranca de
    nuevo la mesa responde «no tiene dónde guardar». Esta vez termina en verde. El contenedor anterior atiende unos
    minutos más mientras Cloudflare lo reemplaza.
11. **Comprueba** con el recorrido (lo corre Claude): `MESA_IDENTIDAD=servicio node --env-file=$HOME/.soporte-sap-mesa.env
    src/features/soporte-sap/mesa/pruebas/recorrido-mesa.mjs <url> docs/goals/soporte-sap-capturas/mesa-alojada`.
    **Una corrida por contenedor despierto.** El simulador vive en la memoria del contenedor. Cuando el paso 4 aprueba el
    plan, el periodo 2026/10 de MM queda abierto, y una segunda corrida antes de que el contenedor duerma (30 min sin
    peticiones) ya no reproduce el error del caso conocido: el supervisor frena el plan y no hay «aprobar» (medido el
    2026-10-29). Lo guardado en el almacén sí persiste entre corridas: por eso el recorrido valida MIRO y la nota 3797111
    con «Todos» y «Cambiar», y en el paso 14 cuenta la corrección de los tokens como «de prueba, aparte», no en «Corregidos».

## Invitar al experto, y quitarle el acceso

Solo después de firmar la revisión 11 de la AISIA.

- **Para probarla tú como experto** no hace falta nada de esto: con tu correo usas la misma mesa y ves solo tus casos. Un
  correo en las dos listas cuenta como laboratorio.
- **Invitar**:
  - en Zero Trust → Integrations → Identity providers, añade **One-time PIN** si no está: el panel solo lo da por
    defecto cuando no hay ningún proveedor, y «Cloudflare» (tu entrada) ya cuenta como uno;
  - en Zero Trust → Access controls → Policies, crea `mesa-personas` (**Allow**, Include → **Emails** → su correo y el
    tuyo; nunca «Emails ending in») y añádela al Worker: Domains → «An Access policy applies to this URL» → **Manage**.
    Es reutilizable: lo que cambies en ella después llega solo;
  - `npx wrangler@4.143.1 secret put MESA_EXPERTOS` con su correo (varios, separados por comas);
  - redespliega o espera 30 minutos sin uso: el contenedor ve la lista nueva al arrancar;
  - mándale la URL y dile que empiece por «Cómo se usa». Entra con su correo y un código: no hay contraseña.
- **Si con sesión ve «Not Found» en texto plano**, Access lo dejó pasar y el Worker no encontró su correo en las listas.
  En `<url>/cdn-cgi/access/get-identity` se ve con qué correo entró: reemplaza el secreto con ese correo exacto (el
  valor no se puede leer, ni hace falta) y redespliega. Le pasó al laboratorio el 2026-10-22 con `MESA_LABORATORIO`.
- **Quitar**: sácalo de la política y de `MESA_EXPERTOS`. La puerta del Worker lo deja fuera al momento; lo que ya dijo
  se queda en R2 hasta que lo borres o venza.

## Leer lo que dijo el experto

Entra con tu correo a `/mesa/soporte-sap/laboratorio`: abre en **el mapa** (abajo). Lo que dijo el experto caso por caso
está en «Lo que dijo el experto» (`?pestana=casos`). Ahí verás:

- en qué paso falla más el agente;
- cuántas veces dijo «no lo sé»;
- los veredictos;
- las enseñanzas que esperan tu firma, caso por caso.

**Exportar para un PRP** te da un Markdown. Las enseñanzas son **propuestas**: una regla nueva se firma en
`tools/conocimiento` (D2, H-20). La mesa no siembra nada.

Lo de prueba (los tokens de servicio) se cuenta aparte. **Borrar este caso** lo quita del almacén, y no se puede deshacer.

## Validar conocimiento y el mapa (revisión 12 de la AISIA)

Va con la revisión 12 de la AISIA, firmada el 2026-10-22.

- **Validar conocimiento** (`/mesa/soporte-sap?pestana=candidatos`, para el experto y para ti): hipótesis que salen de
  sapstack (T-codes y punteros a SAP Notes), cada una con su archivo y su línea en el SHA fijado. El experto dice si es
  correcta, si está mal, la corrige o dice «no lo sé». Lo que dice es una **propuesta**: pasa el filtro, se guarda en el
  mismo almacén y vence igual que los casos. Cada identidad ve solo sus validaciones.
- **El mapa** (`/mesa/soporte-sap/laboratorio`, solo tú): de dónde sale el conocimiento (sapstack, el experto, las SAP
  Notes), dónde vive (la base `sap-soporte`) y quién lo usa (triage, motor, léxico, CLIs). Debajo, las métricas, las
  propuestas por firmar, las versiones de la base y los pins. Cada número sale de algo que existe; si no, dice «sin
  datos». El export en Markdown lleva las validaciones, como propuestas.
- **Una regla nueva** se firma fuera de la mesa, en `tools/conocimiento`, con una fuente citable. sapstack no lo es.

Mantenerlo al día (lo corre el laboratorio, en `~/mesa-wt` o el worktree que toque):

```
node src/features/soporte-sap/mesa/fuentes/extrae.mjs revisa              # ¿commit nuevo en sapstack? Avisa, no mueve
node src/features/soporte-sap/mesa/fuentes/extrae.mjs sapstack <copia>    # regenera los candidatos (copia en el SHA del pin)
node src/features/soporte-sap/mesa/fuentes/extrae.mjs base                # la foto de la base, después de cada npm run registra
```

Mover el pin es tu decisión: se cambia `sha` en `fuentes/sapstack/fuente.json`, se regeneran los candidatos y el diff va
a la mesa. Los archivos generados llevan `_ALTO` y huella: editados a mano, la mesa no los carga y una prueba lo dice.

## La web de BASIS (revisión 13 de la AISIA)

Va con la revisión 13 de la AISIA, firmada el 2026-10-24.

- **Qué entra**: notas de seguridad de los registros que SAP publica como CNA en el CVE List (con CVSS, versiones y, si
  CISA la tiene en KEV, «explotada»), y las transacciones y SAP Notes que cita la documentación de SAP en SAP-docs. Cada
  candidato lleva su cita, el día de su captura y su huella. A cada candidato de BASIS/BC de sapstack, la mesa le enseña
  si una fuente citable lo corrobora, lo contradice o no lo encuentra.
- **Qué no entra**: nada que se baje de help.sap.com, support.sap.com, me.sap.com ni de la PAM. Su robots.txt y los
  términos de SAP no dejan extraerlos en automático, o piden S-user. De una SAP Note solo van el número, el título y el
  enlace.
- **La mesa alojada no sale a la web**: lee el catálogo y el pin que van en la imagen. Capturar y revisar lo haces tú, en
  tu máquina, y la captura vive fuera del repo.

El ciclo de cada mes, el miércoles después del Patch Day (el segundo martes):

```
C=~/.soporte-sap/captura-web                                          # fuera del repo
node src/features/soporte-sap/mesa/fuentes/extrae.mjs revisa          # ¿hay versión nueva? Avisa, no mueve
node src/features/soporte-sap/mesa/fuentes/extrae.mjs web descubre $C # propuesta de pin en $C/pin-propuesto.json
#   revisas el diff contra fuentes/web/pin.json y, si lo apruebas, lo copias encima (mover el pin es tu decisión)
node src/features/soporte-sap/mesa/fuentes/extrae.mjs web captura $C  # baja cada fuente por su SHA (unos 15 s)
node src/features/soporte-sap/mesa/fuentes/extrae.mjs web $C          # regenera candidatos-web.json; se niega si algo no cuadra
node docs/goals/soporte-sap-basis-web-evidencia/mide.mjs $C           # cobertura, cruce y grafo, para revisar el diff
```

El diff de `candidatos-web.json` es lo que llega a la mesa. Lo que no esté en las fuentes automáticas (el procedimiento
de una tarea en SAP Help, una nota sin CVE del Patch Day, una fecha de fin de mantenimiento) lo trae una persona: el
experto, en la mesa, como su experiencia.

## La conversación (revisión 14 de la AISIA, parte 1)

Va con la revisión 14 de la AISIA, parte 1, firmada el 2026-10-26. El código ya está en `main`, así que el próximo
despliegue la sube.

- **Qué hace**: la mesa se ve dentro de la capa común, con una ranura de conversación que resuelve sin modelo, con el
  enrutador de intención de la capa: «prueba este caso: …», «¿por qué dijiste no lo sé en el paso 3?» y «muéstrame lo que
  te enseñé». Corre los casos con el mismo agente sin modelo y los guarda en el almacén de la mesa, con la misma
  retención.
- **Qué no hace**: no habla con ningún modelo ni con otra API que la de la mesa, no guarda en el navegador del experto lo
  que escribe (solo el estado de la guía), no borra (eso es tuyo) y no lleva voz.
- **Lo que sigue abierto**: lo que el experto cuente con palabras, sin forma de dato, pasa el filtro igual que en el
  formulario.

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
- **El contenedor tiene salida a internet.** Cerrarla a las llaves de Access y al almacén pide interceptar el TLS con el
  CA de Cloudflare. No se dio por bueno sin probarlo: queda como brecha en el C3.
