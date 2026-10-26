# Cerebro personal en dos lugares (`infra/cerebro-personal/`)

Dos instancias del Arbrain personal, «local» (Windows en la realidad) y «vps», con un job que sincroniza **solo el
cerebro** por una red privada simulada, y la puerta de Cloudflare como configuración validada sin conexión. Es la
demostración en contenedores de la fase 2 («instancias») del goal capa Arbrain: nada de esto se despliega.

## Qué hace y qué no

**Hace:**

- Construye la imagen de cada instancia con **Arbrain v0.2.10 de la etiqueta firmada**: el bundle sale del espejo de
  solo lectura, la firma se **re-verifica dentro de la imagen** con el ancla del lock (`tools/capa/upstream.lock.json`,
  su sha256 se comprueba) y el programa ya compilado se acepta **solo** si su sha256 y su tamaño son los de la línea
  `programa linux-x64 …` del mensaje de la etiqueta firmada. Imagen base pineada por versión y digest.
- Arranca el **servidor real** de Arbrain (modo servidor, edición cliente, instalado «a mano» como en Linux) en cada
  instancia, sin login de Claude, sin llaves y sin modelo. Escucha solo en `127.0.0.1`.
- Siembra la capa del alumno con el `sembrar.py` de la etiqueta (el PASO 7 de su instalador).
- Sincroniza el cerebro con el job (`job/sincroniza.mjs`) contra el **centro**, un repo git en el VPS: lista permitida
  explícita, calendario y hábitos **unidos por registro**, `now.md` regenerado en cada lado.
- Ante un choque **se detiene sin elegir lado**: conserva las dos versiones, las copia aparte y deja `AVISO.md`.
- Con versiones de Arbrain distintas **no sincroniza ni cambia nada**.
- Simula la red privada como Tailscale con su relevo DERP: los nodos **salen** hacia un relevo y nadie escucha en las
  instancias; ningún puerto publicado; la red no tiene salida a internet.
- Deja la puerta de Cloudflare como `cloudflared/config.yml` (túnel nombrado de ejemplo, Access obligatorio) con un
  validador propio que se pone rojo si una regla no exige Access.

**No hace:**

- No despliega, no contacta a Cloudflare ni a Tailscale, no contrata nada, no inicia sesión en Claude, no usa LLM.
- No toca la carpeta de datos de la app (conversaciones, lienzos, SQLite), las llaves ni las sesiones.
- No resuelve choques: los detiene y avisa; decide una persona (ver «Cuando hay choque»).
- No sincroniza `now.md`, `.claude/daily/`, `.claude/settings.local.json`, `.arbrain-sembrado.json` ni `mi-negocio/`
  (el porqué de cada una está en `job/lista-permitida.json`).
- No deja pasar contenido de un producto: del resumen de producto solo entran conteos y enlaces (ver abajo).
- No es Windows: «local» es Linux en un contenedor. Lo de Windows es fase aparte.

## Casos de uso

- **El gate del grafo** (`l-instancias`): demostrar que el job cumple sus reglas antes de encender lo real.
- **Cambiar el job o la lista permitida**: correr la prueba entera; si algo se rompe, sale en rojo con el punto.
- **Revisar la puerta de Cloudflare** antes de crear el túnel real: `node cloudflared/valida-access.mjs <config.yml>`.
- **Base del job real** del Arbrain personal en Windows y el VPS (fase aparte, la abre el laboratorio).

## Requerimientos de infraestructura

- **Runtime**: en el host, Node 22 (la prueba) y Docker 29 con compose v2 (aquí v5.5.1). Basta el builder clásico: no
  hace falta buildx. Dentro de las imágenes: Node 22.23.2 (bookworm-slim, pineado por digest) y el Node 22.23.3 que
  trae el programa de Arbrain.
- **Dependencias del sistema**: en la imagen, git 2.39, openssh-client (ssh-keygen verifica las firmas), python3
  (`sembrar.py`), iproute2 (`ss`) y procps. En el host, git, el espejo `~/.cache/capa-arbrain/fuente` y el ancla
  `~/.config/arbrain/firmas-permitidas` de la fase 1.
- **CPU, GPU y memoria**: sin GPU. Medido el 2026-10-25 con la app arrancada y en reposo: ~150 MiB por instancia,
  ~12 MiB el relevo. La prueba entera tarda 44 s con las imágenes en caché y 269 s reconstruyéndolo todo (incluye bajar
  los 350 MB del programa; depende de la red).
- **Servicios externos**: solo al construir: los paquetes de Debian, el release de la etiqueta en GitHub (el programa,
  350 MB, aceptado solo con la huella firmada) y Docker Hub (la imagen pineada de cloudflared). En ejecución, ninguno:
  la red es interna. Nada hacia Cloudflare ni Tailscale.
- **Variables de entorno**: las fija la prueba (`ARBRAIN_ETIQUETA`, `ARBRAIN_ETIQUETA_ANTIGUA`,
  `CEREBRO_RED_TOKEN_ARCHIVO`) y compose (`CEREBRO_LADO`, `CEREBRO_CENTRO_URL`, `CEREBRO_CENTRO_DIR`,
  `CEREBRO_RED_TOKEN`, `TZ`). Opcionales del job: `CEREBRO_ARBRAIN`, `CEREBRO_ESTADO`, `ARBRAIN_ANCLA`,
  `CEREBRO_ENTRADA_RESUMENES`, `CEREBRO_RED_HOST`, `CEREBRO_RED_PUERTO`.
- **Almacenamiento**: imágenes en la caché de Docker, con capas compartidas: instancia 2 GB, la etapa del programa
  2,7 GB (lleva nombre para que un `docker image prune` no la tire y obligue a bajarlo otra vez), antigua 742 MB y relevo
  541 MB. Un contexto temporal de ~85 MB que la prueba borra. Los contenedores no usan volúmenes: todo se va con `down`.
- **Salida del perímetro (C4)**: en la demostración, ninguna en ejecución; el cerebro (sintético) solo viaja entre
  contenedores por la red interna. En la realidad, el cerebro personal sale de Windows hacia un VPS de un tercero:
  esa decisión es del laboratorio, con su C3 y su C4, en la fase de encender.

## Cómo se corre la prueba

```bash
node infra/cerebro-personal/prueba.mjs              # construye, levanta, demuestra (a)-(g) y limpia
node infra/cerebro-personal/prueba.mjs --conserva   # deja los contenedores arriba para mirar a mano
node --test infra/cerebro-personal/job/*.test.mjs   # solo el driver de merge y la lista permitida (sin Docker)
```

Exit 0 = todo en verde (`PRUEBA_OK`). Al final baja contenedores y red y borra el temporal; las imágenes se quedan.
La evidencia de una corrida real está en `docs/goals/capa-arbrain-evidencia/instancias.md`.

Qué demuestra:

| Punto | Qué se ve |
|---|---|
| (a) | Una nota de memoria hecha en local aparece en vps y una hecha en vps aparece en local (hashes iguales). El calendario se une por registro (eventos de los dos lados), una skill propia viaja, y `daily/`, `settings.local.json` y un `.env` no. `now.md` se regenera en cada lado y no está en el repo. |
| (b) | El mismo evento y la misma nota cambiados distinto: exit 2, hashes de local, vps y centro iguales antes y después, el aviso, las copias. Después una persona decide y el job vuelve a sincronizar. |
| (c) | Una instancia con Arbrain v0.2.9 (verificada) no sincroniza: exit 3, nada cambia (ni siquiera crea su repo). Y el centro rechaza por su cuenta cuatro empujes a mano. |
| (d) | La carpeta de datos de la app de cada instancia, con el mismo hash antes y después de todo. |
| (e) | `ss -ltn` (solo `127.0.0.1` en las instancias), `docker ps` sin puertos, red interna, sin DNS ni salida, relevo con token. |
| (f) | `cloudflared` 2026.10.0 (pineado por digest) valida sin red; el validador propio da `ACCESS_OK` y, con una regla sin Access, `ACCESS_FALLA`. |
| (g) | El código del job no contiene `reset --hard`, `push --force`, `clean`, `checkout --ours/--theirs`, `-X ours/theirs`, `stash` ni refspecs con `+`. |

## Cómo funciona

### Las piezas

| Archivo | Qué es |
|---|---|
| `Dockerfile` | Etapas: base pineada, relevo, verificación de la etiqueta, copia verificada, descarga verificada del programa, instancia. |
| `compose.yml` | Red interna sin salida, relevo, `vps`, `local` y `antigua` (perfil `versiones`). Ningún puerto publicado. |
| `job/sincroniza.mjs` | El job: una pasada, `crea-centro`, `declara-version`, `estado`. |
| `job/lista-permitida.json` | Qué viaja, qué no y por qué; esquema de registros; nombres negados. |
| `job/politica.mjs` | La política compartida: ruta que viaja, versión verificada, CAPAS.json cubierto. |
| `job/fusiona-registros.mjs` | Driver de merge `registros` para `calendario.json` y `habitos.json`. |
| `job/centro-pre-receive.mjs` | Hook del centro: la misma política, sin confiar en el otro lado. |
| `job/tunel.mjs` | Relevo, agente saliente del VPS y cliente del transporte `ext::` de git. |
| `job/regenera-now.mjs` | `now.md` por lado (la edición cliente no trae `now-snapshot.py`). |
| `imagen/` | Arranque de la instancia, descarga verificada, huellas y la «escena» sintética de la prueba. |
| `cloudflared/` | `config.yml` de ejemplo y `valida-access.mjs`. |
| `prueba*.mjs` | La prueba. |

### Qué viaja y qué no

Sale de `CAPAS.json` («alumno» + skills propias). Si una versión nueva trae una ruta de alumno sin clasificar o cambia
las skills del autor, el job **se niega** (exit 5): clasificarla es una decisión, no un default.

| Viaja | No viaja (y por qué) |
|---|---|
| `.claude/memory/`, `.claude/plan/` (calendario y hábitos por registro), `.claude/diario/`, `.claude/knowledge/`, `CLAUDE.local.md`, `.claude/skills/<propia>/` | `now.md` (proyección: cada lado la regenera) · `daily/` (extractos de conversaciones: viaja su destilado) · `settings.local.json` (permisos de esa máquina) · `.arbrain-sembrado.json` (marca de esa instalación; el daemon la reescribe) · `mi-negocio/` (puede traer datos de terceros y archivos grandes: es otra decisión de C4) |

Nunca, aunque estén dentro de una ruta que viaja: `.env*`, `*.pem`, `*.key`, `llaves.json`, `acceso.json`,
`servidor.json`, bases (`*.db`, `*.sqlite*`), temporales y candados. Y nunca enlaces simbólicos ni submódulos.

### El job, paso a paso

1. **Candado**: una pasada a la vez por instancia.
2. **Versión**: la de este lado con la firma verificada contra el ancla, y la que declara el centro (`ls-remote` de la
   ref `refs/meta/version-arbrain`, que apunta a un blob «versión commit»). Si difieren: exit 3, antes de tocar nada.
3. **CAPAS.json** cubierto por la lista permitida, o exit 5.
4. **Repo del cerebro** aparte (`~/.cerebro-sync/cerebro.git`, árbol = la copia de Arbrain), con exclusiones en lista
   blanca y el driver de registros. Solo contiene rutas que viajan: una unión no puede escribir fuera de ellas.
5. **Resumen de producto** (solo en el VPS, `job/resumenes.mjs`): cada lectura de conteos de un producto permitido entra a
   la agenda como tarea; la que trae cualquier texto se queda en cuarentena, fuera del cerebro.
6. **Commit local** de lo que viaja, con el trailer `Arbrain-Version`.
7. **Trae el centro** (sin `+`: si el centro reescribiera su historia, el fetch falla) y revisa cada commit que llega:
   versión y rutas.
8. **Une**: avance rápido si se puede; si no, `git merge-tree --write-tree` calcula la unión **fuera del árbol**. Si hay
   choque, se detiene sin haber tocado nada; si no, el árbol se actualiza solo en las rutas que cambiaron.
9. **Empuja** sin forzar. Si el centro avanzó mientras tanto, se reintenta en la próxima pasada (exit 4).
10. **`now.md`** de este lado, estado y archivo del aviso anterior si ya se resolvió.

Códigos de salida: 0 al día · 2 choque · 3 versión distinta o sin verificar · 4 centro inalcanzable o empuje rechazado
· 5 política · 75 otra pasada en curso · 1 error.

### Cuando hay choque: lo resuelve una persona

El job deja `~/.cerebro-sync/AVISO.md` y las tres versiones de cada archivo (`.local`, `.centro`, `.base`) en
`~/.cerebro-sync/choques/<commit local>-contra-<commit del centro>/`. La versión local sigue en el disco y en la rama
del cerebro; la del centro, en el centro. Para resolver (lo prueba el punto (b)):

```bash
G="git --git-dir=$HOME/.cerebro-sync/cerebro.git --work-tree=$HOME/Arbrain"
cd ~/Arbrain
$G merge --no-ff --no-commit refs/remotes/centro/main      # se detiene en el choque, como debe
# Decidir el contenido y escribirlo. En calendario.json y habitos.json no hay marcas de conflicto: el archivo queda
# con la versión local; las otras dos están en choques/.
$G add -- <archivos decididos>
$G commit -m "cerebro (local): choque resuelto a mano" -m "Arbrain-Version: $(cat VERSION) $(git rev-parse v$(cat VERSION)^{commit})
Lado: local"
node /opt/cerebro-sync/sincroniza.mjs                      # empuja la decisión; el otro lado la recibe en su pasada
```

### Versiones

El centro declara una versión (`sincroniza.mjs declara-version`, solo en el VPS y en local, nunca por el túnel). Subir
de versión es un CDC: se actualizan las dos instancias con el procedimiento oficial (`actualizar-arbrain`), se declara
la nueva en el VPS y, mientras tanto, el lado que quede atrás no sincroniza.

### Red privada simulada

`red` es el relevo: el único proceso que escucha en la red interna (puerto 7443). `vps` corre un agente que **sale**
hacia el relevo y, por cada flujo, ejecuta solo `git upload-pack` o `git receive-pack` del centro (ruta fija). `local`
llega al centro con el transporte `ext::` de git (`ext::node /opt/cerebro-sync/tunel.mjs conecta vps %S`). Cada
conexión al relevo lleva un token de la red, generado por la prueba y montado como secreto (nunca se imprime). En las
instancias, `ss -ltn` muestra solo `127.0.0.1` (la web de Arbrain, su daemon y su control) y el DNS interno de Docker en
`127.0.0.11`, que en la realidad no existe.

## Superficies (las del C3)

| Superficie | Dónde escucha | Quién llega | Qué la protege |
|---|---|---|---|
| Web de Arbrain | `127.0.0.1:4310` en cada instancia | Solo la máquina; en el VPS, además, la puerta de Cloudflare | Contraseña propia de Arbrain + Access (correo y PIN) en la puerta |
| Daemon y control de Arbrain | `127.0.0.1:<al azar>` | Solo la máquina | Tokens por arranque de Arbrain |
| Relevo (`red`) | `:7443` de la red interna | Los nodos de la red privada | Token de la red (en la realidad: WireGuard y ACL de Tailscale) |
| Centro (`/srv/cerebro/centro.git`) | No escucha: se alcanza por el túnel | El job de cada lado | Hook de política, sin forzar ni borrar, versión declarada |
| Puerta de Cloudflare | Saliente desde el VPS (el túnel no abre puertos) | Un navegador sin Tailscale | Access obligatorio en cada regla, solo `127.0.0.1`, final `http_status:404` |
| Entrada de resúmenes | Carpeta `/srv/cerebro/entrada-resumenes` | El job del VPS | Lista de productos del laboratorio y el esquema cerrado de la capa: solo conteos y enlaces |

## El resumen de producto (fase «resumen»)

- **Entrada**: `/srv/cerebro/entrada-resumenes` en el VPS (la crea `crea-centro`; `CEREBRO_ENTRADA_RESUMENES`).
- **Quién informa**: `job/resumenes-permitidos.json`, la lista que decide el laboratorio (hoy solo `recepcion`, un
  producto sintético). Lo que cada uno puede contar sale de SU composición (`productos/composiciones/<slug>.json`,
  campo `resumen`), que la prueba copia a `job/composiciones/`.
- **Cómo valida**: con `validaResumen` de la capa empaquetada (`@tu-scope/capa` y su `zod` dentro de la imagen, sin red),
  el mismo esquema que usa el producto. Rechaza el archivo ENTERO ante un campo de más, una clave no declarada, texto
  en un conteo o una consulta en un enlace, y lo deja en `rechazados/` con su motivo, fuera del cerebro.
- **Qué escribe**: una tarea `resumen-<producto>-<fecha>` en `.claude/plan/calendario.json`, con el texto que genera el
  job (`lineaDeAgenda`: números y claves declaradas). Viaja a local con el cerebro, unida por registro.
- **Prueba**: el caso (h) de `prueba.mjs` (con `CAPA_RESUMEN_URL`) y `job/resumenes.test.mjs` sin Docker. La evidencia
  está en `docs/goals/capa-arbrain-evidencia/resumen.md`.

## Qué cambia en la realidad (fase aparte, la abre el laboratorio)

- **Tailscale de verdad** en Windows, el VPS y el teléfono: el relevo y el token desaparecen. El centro se alcanza por
  SSH sobre Tailscale (por ejemplo `tailscale ssh`, o un `sshd` que escucha solo en la interfaz de Tailscale) con un
  comando forzado que ejecute solo `git-upload-pack`/`git-receive-pack` del centro y fije `CEREBRO_VIA=tunel`.
  El remoto del job pasa de `ext::…` a `ssh://…`.
- **Windows por la vía oficial** (el instalador de Arbrain, con escritorio y manos) y el job como tarea programada; el
  job es Node y git, sin nada de Linux. Cuidar los saltos de línea: el repo del cerebro fija `core.autocrlf=false`.
- **El VPS que contrata el laboratorio** (separado de Hermes y el ERP), con Arbrain instalado «a mano», `claude auth
  login` hecho por el laboratorio, el centro creado con `crea-centro` y su respaldo (GitHub privado o R2) en el
  inventario §4, con RPO y RTO «desconocidos» hasta el GATE 3.
- **Cloudflare real**: dominio, `cloudflared tunnel create`, DNS, la aplicación de Access con su política (correo y PIN)
  y su `audTag` real en `config.yml`. Antes, una revisión del C3 que cubra lo real: la versión firmada el 2026-10-26
  (`docs/goals/capa-arbrain-propuestas/c3-instancias.md`) cubre solo los contenedores.
- **Actualizar Arbrain** con el procedimiento oficial en las dos máquinas y `declara-version` en el VPS (CDC).

## Brechas declaradas

- El relevo y el token simulan Tailscale: los bytes van sin cifrar dentro de la red interna y no hay identidad por nodo.
- «local» es Linux: Windows (rutas, saltos de línea, tarea programada, llavero) no se probó.
- La medición de la carpeta de datos deja fuera `logs/` (los escribe el propio servidor en marcha) y `programa/` (el
  binario verificado). Ninguna ruta del job los alcanza, pero su hash no se compara.
- La app real se probó sin chats: los datos de la app son los lienzos que siembra ella misma, la SQLite del daemon y su
  configuración. No se crearon conversaciones porque hacerlo pide la sesión de la web (su contraseña).
- El acceso de lectura al centro no distingue nodos: cualquier nodo con el token puede leerlo (en la realidad lo decide
  la ACL de Tailscale).
- `now.md` es una proyección mínima: no expande repeticiones (RRULE) ni lee calendarios conectados.
