# Modelo de amenazas (C3) — el Arbrain personal en dos lugares y las rutas nuevas de la capa

> Fecha: 2026-10-25 · Estado: **con la firma del laboratorio** · Plantilla `.claude/gobernanza/plantillas/modelo-amenazas.md`.
> Goal `docs/goals/capa-arbrain.md` (nodos `instancias` y `resumen`). Hoy todo es demostración en contenedores:
> nada está encendido, no hay VPS, ni Tailscale, ni túnel de Cloudflare.
> **Alcance de la firma**: esta versión cubre lo probado en contenedores (las dos instancias, la red simulada, el centro
> con su hook, la puerta de Cloudflare validada sin conexión y el resumen de solo conteos) y las rutas nuevas de la
> capa. Firmarla **no** enciende nada: encender el VPS, Tailscale, el túnel o Arbrain en Windows pide una revisión de
> este documento que cubra lo real (ver «Lo que firmar este documento NO abre»).
>
> **aprobación humana ☑** · **Aprobado por**: **lisagomez** (el laboratorio), 2026-10-26

**Activos que toca** (por daño): (1) el **cerebro personal** del laboratorio: memoria, metas, plan, diario,
conocimiento y skills propias, que son datos personales suyos; (2) los **datos de la app** de Arbrain en cada
instancia (conversaciones, lienzos, SQLite del daemon, adjuntos, configuración); (3) la **sesión de Claude** y las
llaves de cada instancia; (4) el **VPS** y su disco; (5) la **red privada** (tailnet) y el **túnel de Cloudflare** con
su política de Access; (6) los **datos de terceros** de los productos (clientes, el experto de Soporte SAP), que no
deben llegar nunca al cerebro personal; (7) la **cadena de suministro**: la versión de Arbrain que se instala.

**Superficies** (la tabla viva está en `docs/CEREBRO-PERSONAL.md` §Superficies, medida el 2026-10-25):

| Superficie | Dónde escucha | Quién llega | Qué la protege |
|---|---|---|---|
| Web de Arbrain | `127.0.0.1:4310` en cada instancia | solo la máquina; en el VPS, además, la puerta de Cloudflare | contraseña propia de Arbrain + Access (correo y PIN) en la puerta |
| Daemon y control de Arbrain | `127.0.0.1:<al azar>` | solo la máquina | tokens por arranque de Arbrain |
| Red privada (en la demo, el relevo `red`) | en la demo `:7443` de una red interna; en la realidad, WireGuard de Tailscale | los nodos del laboratorio | token de la red (demo) · WireGuard + ACL (realidad) |
| Centro del cerebro (`centro.git`) | no escucha: se alcanza por el túnel | el job de cada lado | hook de política, sin forzar ni borrar, versión declarada |
| Puerta de Cloudflare | saliente desde el VPS: el túnel no abre puertos | un navegador sin Tailscale | Access obligatorio en cada regla, solo `127.0.0.1`, final `http_status:404` |
| Entrada de resúmenes | carpeta del VPS | el job del resumen | esquema cerrado de solo conteos y enlaces |
| Lectura de conteos de un producto | ruta del producto (ver T-11) | el job del VPS | en la demo, abierta en local; en la realidad, token de servicio de solo lectura |
| Servicio de dictado: `/v1/audio/*` y `/v1/models` | `127.0.0.1` | la app de la misma máquina | Bearer del servicio |

## Amenazas y controles

| # | Amenaza | Control (probado) | Brecha que queda |
|---|---|---|---|
| T-1 | **La web de Arbrain del VPS, expuesta a internet** (puerto abierto, regla del túnel sin Access) | Escucha solo en `127.0.0.1`; ningún puerto publicado (`docker ps` y `docker inspect` sin puertos); la puerta es un `cloudflared` saliente con Access **obligatorio en cada regla**, servicios solo a `127.0.0.1` y regla final `404`. `cloudflared` 2026.10.0 (pineado por digest) da `OK` también a una regla SIN Access: por eso el validador propio (`valida-access.mjs`) da `ACCESS_OK` y, con la copia saboteada, `ACCESS_FALLA` (probado, `instancias.md` (e) y (f)) | El validador mira el YAML, no la política de Access en el panel (quién entra, con qué PIN y cuánto dura la sesión): se revisa al encender. Sin dominio propio verificado en Cloudflare |
| T-2 | **Un nodo ajeno llega al centro del cerebro** | En la demo: el centro no escucha; el agente del VPS sale hacia el relevo y por cada flujo ejecuta solo `git upload-pack`/`receive-pack` del centro (ruta fija); el relevo rechaza un flujo sin token (probado, (e)) | El relevo simulado **no cifra** ni da identidad por nodo. En la realidad: WireGuard y la **ACL de Tailscale**, que debe limitar qué nodos llegan al VPS (no medido). Leer el centro no distingue nodo |
| T-3 | **Un lado pisa al otro** y se pierde memoria | El job nunca elige lado: une con `merge-tree` fuera del árbol; ante un choque sale con `2`, conserva las dos versiones (y la base) aparte y deja `AVISO.md`; sin empuje forzado ni reescritura; el centro rechaza historias reescritas. Hashes de local, vps y centro iguales antes y después del choque; repetir da `2` sin cambios (probado, (b) y (g)) | Una persona resuelve el choque a mano (procedimiento en el README): puede decidir mal, pero lo decide ella |
| T-4 | **Dos versiones de Arbrain mezcladas** en el cerebro | El centro declara la versión verificada; el lado con otra versión no sincroniza ni crea su repo (exit `3`); el hook del centro rechaza empujes de otra versión, de código de la app, de `now.md` y el borrado de `main` (probado, (c)) | Subir de versión exige actualizar las dos instancias por el procedimiento oficial: mientras tanto, un lado no sincroniza (es lo buscado) |
| T-5 | **El job toca lo que no es cerebro** (datos de la app, llaves, sesiones) | Lista permitida explícita y repo del cerebro aparte con exclusiones; nunca `.env*`, `*.key`, `*.pem`, bases, enlaces simbólicos ni submódulos; la carpeta de datos con el mismo hash antes y después de todo el trabajo del job; `daily/`, `settings.local.json` y un `.env` no viajan (probado, (a) y (d)) | `logs/` y `programa/` quedan fuera del hash (declarado). `mi-negocio/` no viaja: si un día se quiere, es otra decisión de C4 |
| T-6 | **Datos de terceros en el cerebro personal** (lo que escribe un cliente o el experto) | Ningún producto lee el cerebro y el cerebro no lee productos. El único canal de un producto hacia él es el **resumen de solo conteos**: esquema estricto de la capa (`validaResumen`), claves que el producto declaró, enteros y enlaces sin consulta. Un archivo con cualquier texto libre se rechaza entero (probado, evidencia del nodo `resumen`) | **No firmable** (límite de C5): ningún riesgo aceptado abre este canal a contenido |
| T-7 | **Texto colado en el resumen** (en una clave, en un enlace `?nota=`, en un campo de más) | Claves `kebab-case` y solo las declaradas; enlaces en minúsculas, sin consulta ni fragmento; un campo de más se rechaza (siembras de la capa: 6 de 6 caen) | Un conteo puede revelar actividad (cuántos casos al día): por eso la mesa real entra solo con la revisión 14 de la AISIA de Soporte SAP |
| T-8 | **Un resumen falso** (alguien manda conteos inventados) | En la demo, el resumen entra por la carpeta del VPS (lo deja el script de la prueba): el daño posible es una tarea falsa en la agenda, nunca una acción | En la realidad: token de servicio de solo lectura por producto y origen fijo (FUERA DEL HECHO §2); no construido |
| T-9 | **El VPS de un tercero** guarda el cerebro personal | El cerebro es sintético en la demo; no hay VPS | Proveedor, región, cifrado en reposo y respaldo (GitHub privado o R2) los decide el laboratorio al encender, con su C4; RPO y RTO **desconocidos** hasta GATE 3 |
| T-10 | **Una versión de Arbrain no firmada** (cadena de suministro) | Ancla fuera de los dos repos; etiqueta `vX.Y.Z` anotada y firmada; HEAD = etiqueta; la firma se re-verifica dentro de cada imagen; el programa compilado se acepta solo si su sha256 y su tamaño son los del mensaje de la etiqueta firmada; subir de versión es CDC; la skill propuesta falla con una etiqueta sin firma o con una llave ajena sin escribir nada (probado, `skill.md`) | Si el autor pierde su llave, el ancla tiene una segunda (`arbrain-reserva`); cambiar el ancla es un CDC, nunca un arreglo para que algo pase |
| T-11 | **Rutas nuevas de la app** | La capa no abre rutas nuevas propias. Las del producto nuevo (`src/app/(productos)/<slug>`) son de laboratorio, con datos sintéticos; su lectura de conteos devuelve solo números y enlaces (probado con `validaResumen`). El servicio de dictado gana `/v1/audio/transcriptions`, `/v1/audio/speech` y `/v1/models`, en `127.0.0.1` y con su Bearer. La conversación de la mesa **no abre rutas**: va por la misma API de la mesa (`GET` y `POST` de `/api/mesa/soporte-sap`, medido: 51 peticiones del navegador, todas al origen local), detrás de la misma identidad de Access | Abuso de CPU del ASR/TTS local (como T-4 de la clínica): mismo origen y límites por IP no medidos aquí. La lectura de conteos no lleva autenticación en local |
| T-12 | **Voz en la nube encendida sin gobierno** (audio o texto hacia un tercero) | Los adaptadores de nube vienen apagados; la ranura de voz no se llena sola con la nube; un producto con datos sensibles nunca los enciende; el reconocimiento del navegador cuenta como nube (probado: `decideRanuraVoz`, 4 casos) | Encender uno exige su C4 (`docs/goals/capa-arbrain-propuestas/c4-voz-nube.md`) y la firma del producto |

## Lo que firmar este documento NO abre

- Encender el VPS, Tailscale, el túnel o Arbrain en Windows: es la fase aparte §1, con su propia revisión de este C3.
- La lectura de conteos de la mesa alojada (FUERA DEL HECHO §2): pide además la revisión 14 de la AISIA de Soporte SAP.
- Un adaptador de voz en la nube: pide su C4.
