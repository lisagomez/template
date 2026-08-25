# SDD — Alineacion de la imprenta (la premisa que ya era falsa)

**Estado:** **construido y medido el 2026-08-25**, el mismo dia que el SDD que corrige. Go
instalado, los cuatro CLIs de la libreria local medidos por primera vez, el manifiesto
declarandolos, el auditor sin su verde-en-vacio, 14 casos deterministas nuevos (42 en total)
y las reglas CLI-first con el escalon que faltaba. Todo dentro de `npm run validate`.
**Ambito:** el contrato, el auditor y las reglas viajan con el template. La libreria de
binarios sigue **fuera del repositorio** y debe seguir fuera: eso no cambia.

---

## 1. El problema

`docs/SDD-imprenta-de-clis.md` cerro con esta frase en §8, bajo *"NO cierra"*:

> *"Aqui no se imprime ningun CLI. No hay Go en esta maquina, y el repositorio no lleva
> libreria de binarios ni debe llevarla: es un boilerplate."*

La segunda mitad es doctrina y sigue en pie. La primera era **falsa el dia que se escribio**,
y no por poco:

| Lo que el template asumia | Lo que habia en la maquina |
|---|---|
| No hay imprenta | binario `cli-printing-press` **4.28.0** + **11 skills** `/printing-press*` |
| No hay CLIs impresos | **cuatro**, impresos por `lisagomez`: `digitalocean`, `hcloud`, `supabase`, `telegram-bot` |
| No hay Go | cierto — **y era lo unico que faltaba** |

La maquina podia **generar** y no podia **construir**. Con esa mitad ausente, nadie podia
medir grado a lo impreso, y sin grado el auditor no tenia nada que auditar. El SDD anterior
leyo ese silencio como "aqui no se imprime" y lo escribio como principio de diseno.

## 2. Lo que se descubrio al escribirlo

### 2.1 El verde en vacio — el hallazgo, no los cuatro CLIs

`npm run audita:imprenta` salia asi, con la libreria delante:

```
✓ Imprenta conforme: todo CLI del manifiesto esta impreso y con grado suficiente.
```

**Verdadero y vacio.** Ningun servicio del manifiesto estaba declarado `cli-impreso`, asi que
el bucle no iteraba sobre nada y la frase se cumplia sobre el conjunto vacio. Un humano leia
"la imprenta esta alineada" mientras el disco tenia cuatro CLIs que el contrato no conocia.

> **Un control que se aprueba a si mismo cuando no hay nada que comprobar no es un control.**
> Es la version estructural del fallo del 2026-08-23 (*"un control escrito solo en el
> documento NO dispara"*): alli la regla no llegaba a quien decide; aqui el gate se pasaba a
> si mismo por falta de sujeto.

Y era **exactamente el modo de falla que ese auditor existia para no cometer**: su propia
cabecera documenta `fuente_impresos` porque *"un auditor que reportaba 0 porque no encontro
nada que mirar"* fue el bug del origen. Se defendio de no encontrar la libreria; no se
defendio de no encontrar nada en el manifiesto.

**Arreglado, y sin convertirlo en rojo:** con cero declarados dice `○ Nada que auditar` y
lista lo que hay impreso sin declarar. Rojo permanente seria injusto —un clon del boilerplate
en una maquina que imprime no tiene por que declarar la libreria ajena, que es doctrina de
`INCIDENTES.md`— pero callarlo es como nacio el hueco.

### 2.2 Go: `apt` no alcanzaba, y el detalle importa

La press exige **Go >= 1.26.6**. Ubuntu 26.04 ofrece `golang-1.26` en **1.26.0-1**: por
debajo del piso, y a simple vista parece la version correcta. Ademas `sudo` pide autenticacion
interactiva, que un agente no puede teclear.

Instalado el tarball oficial **go1.27.0** bajo `$HOME/.local/go` (sin `sudo`), con el sha256
leido en vivo de `https://go.dev/dl/?mode=json` y comparado con `sha256sum`. `$HOME/go/bin`
—que ya contenia el binario de la press— **no estaba en el PATH**: funcionaba solo por una
copia en `~/.local/bin`. Ambos van ahora en `~/.bashrc`.

Canario: `go build ./...` sobre `hcloud`, el peor caso conocido. **Compila en 16 s.**

### 2.3 Los cuatro CLIs, medidos por primera vez

Con Go ya presente se pudo correr `cli-printing-press scorecard` sobre la libreria real:

| CLI | grade | total | dimensiones sin puntuar | dogfood | anti-reimplementacion |
|---|---|---:|---:|---|---|
| `hcloud` | A | 96 | 5 | PASS | **comprobada** (5 llamadas) |
| `supabase` | A | 87 | 4 | PASS | `skipped` |
| `telegram-bot` | A | 85 | 4 | WARN | `skipped` |
| `digitalocean` | A | 84 | 5 | WARN | `skipped` |

Ninguno tenia `scorecard.json` en disco. El grado **no existia** hasta hoy: no estaba perdido,
no se habia calculado nunca, porque calcularlo exigia el Go que no habia.

### 2.4 Cuatro "grade A" que no dicen lo mismo

Los cuatro puntuan A. Los cuatro tienen dimensiones **sin puntuar**, y entre ellas
`auth_protocol` y `live_api_verification` en los cuatro. El grado se calcula sobre lo que se
pudo medir, asi que un A completo y un A al que le faltan cinco dimensiones **se leen igual**.

Es `sin_grado` un nivel mas abajo: la doctrina *"no medido != aprobado"* ya estaba, pero
operaba a grano grueso —hay grado o no lo hay— y se le colaba el caso intermedio. Ahora
`escaneaLibreria()` arrastra `unscored_dimensions` y el auditor imprime `GRADO PARCIAL` con la
lista. No es fallo del gate (auth y verificacion viva exigen credenciales que aqui no hay);
es un hecho que antes no se veia.

### 2.5 Tres de cuatro nunca comprobaron la regla que mas importa

`reimplementation_check` sale `skipped` (`checked: 0`) en `digitalocean`, `supabase` y
`telegram-bot`. Es la regla inline mas dura de las cuatro de los CLIs:

> *"anti-reimplementacion: un CLI llama a la API real o lee del store local, **jamas inventa
> una respuesta**"*

Y es el **vector 1** del modelo de amenazas del SDD anterior. En tres de los cuatro no esta
descartado: esta **sin mirar**. Va escrito en la `nota` de cada entrada del manifiesto, porque
el sitio donde eso tiene que aparecer es donde alguien vaya a decidir usarlos.

### 2.6 El lector de grados acertaba por casualidad

`escaneaLibreria()` sacaba el grado con `crudo.slice(0, 2000).match(/\b([A-F][+-]?)\b/)`. Con
el JSON real de la press funciona — porque la primera letra suelta A-F del archivo resulta ser
`overall_grade`. Un campo nuevo antes de ese, con una `E` o una `C` sueltas, y el auditor
habria leido un grado equivocado **en silencio**. El `.json` se parsea ahora de verdad; la
regex queda para el `.md` y como red. Hay un caso que planta una `"region": "E"` delante a
proposito.

### 2.7 El nombre del entorno era el propio, no el de upstream

El auditor conocia `CLI_PRESS_LIBRARY`. La imprenta de verdad usa `PRESS_LIBRARY`,
`PRESS_HOME`, `PRESS_MANUSCRIPTS` y `PRESS_RUNSTATE`. En una maquina configurada segun
upstream, el auditor habria ignorado lo declarado y caido al `~/printing-press/library` por
defecto **sin decirlo**. Aprende los tres nombres; el propio sigue mandando por
compatibilidad.

### 2.8 Una fila del SDD anterior que el disco no sostiene

§2.5 de `SDD-imprenta-de-clis.md` presenta, bajo *"Probado contra la libreria real"*:

> `hcloud` sin `scorecard`, con `dogfood` FAIL → `sin_grado`, exit 1

Lo de "sin scorecard" era cierto. Lo del veredicto no: `~/printing-press/library/hcloud/dogfood-results.json`,
fechado el 26 de julio, dice **`PASS`** con cero `issues`. O la fila describe un caso sintetico
presentado como medicion real, o se anoto mal.

No cambia ninguna conclusion de aquel SDD — pero es su propia leccion aplicada a el mismo:
**una tabla titulada "resultado medido" es donde una afirmacion mas se parece a un hecho.** Es
el mismo mecanismo del "~100x" que ese documento refuto.

### 2.9 `supabase-pp-cli` no sustituye al MCP de Supabase

Tentacion evidente: hay CLI impreso de `supabase`, luego se retira el MCP y se ahorra. **No.**
Son superficies distintas: el MCP hace `list_tables` / `apply_migration` / `get_advisors`
(host y desarrollo), y el CLI impreso es **PostgREST sobre el schema publico** de un proyecto
concreto, con **cero novel features**. Sustituir uno por otro no es ahorrar: es perder la
capacidad y quedarse con otra cosa.

Va declarado como servicio aparte (`supabase-data-api`) y **no habilitado**: es superficie de
datos de clientes, y ahi mandan C7 y C4, no la comodidad.

### 2.10 Se imprimio, y la impresion fue el mejor test de la alineacion

Horas despues de escribir lo anterior se imprimio el primer CLI del proyecto. El resultado
importa menos que lo que el intento midio.

**El escalon nuevo funciono antes de imprimir nada.** El primer candidato era Resend (esta en
el golden path via `add-emails`). La comprobacion contra la libreria publica lo encontro
**ya publicado desde el 2026-08-17**, con 100 endpoints. Sin ese escalon la sesion habria
gastado 30-60 minutos reimprimiendo trabajo ajeno. El segundo candidato, **Polar**, no existia
en ninguna parte: ni local, ni entre los 455 publicados, ni como MCP — y es con lo que cobra
el golden path. Ese si se imprimio.

**Tres cosas que solo aparecen al ejecutar:**

| Lo descubierto | Por que no se veia leyendo |
|---|---|
| **Go 1.27.0 rompe la imprenta**: `enetx/http2` trae un archivo con build-tag `go127` que usa `http.Server.DisableClientPriority`, ausente en 1.27.0 | Elegir "la version mas nueva" parecia la decision segura. Con 1.26.7 compila |
| **`generate --force` trunco un archivo generado**: `perms_unix.go` salio sin su funcion y el arbol no compilaba. En directorio limpio sale perfecto | Es la reconciliacion regen-merge, no el spec. Un bug del generador que solo se ve en el reprint |
| **El spec de Polar declara `security` solo por operacion** → el CLI salio con `Auth: not required` contra una API que devuelve 401 a todo | `--auth-preference pat` lo arregla. El `security` en raiz que se probo primero era innecesario, y se comprobo retirandolo |

**Y dos fallos del auditor escrito esa misma manana**, que son el hallazgo real de §2.10:

1. **La press 4.31.1 dejo de escribir `"A"`** en `overall_grade` y empezo a escribir
   `"A (1 of 25 dimensions unverified: live_api_verification)"`. La comparacion contra
   `min_grade` es de **cadenas**, asi que el CLI recien impreso salia como
   `REVISA: grado < minimo A`. Un falso hallazgo con pinta de hallazgo — peor que ninguno,
   porque entrena a ignorar el bucket. Normalizado, con caso, y con su propio subfallo
   anotado: `\b` devolvia `"A"` por `"A+"` porque entre `+` y el fin de cadena no hay
   frontera de palabra.
2. **`verdict` del dogfood se leia desde el primer dia y no se usaba para nada.** Un CLI
   **medido y fallando** pasaba como conforme. Es la simetria que faltaba: la doctrina cubria
   "no medido != aprobado" y no cubria "medido en rojo != aprobado". Ahora un `FAIL` que el
   manifiesto no reconoce **es fallo del gate**; reconocerlo lo baja a defecto conocido y
   visible. Ni rojo perpetuo ni silencio: apagarlo obliga a escribirlo en el contrato.

**El estado de `polar`, sin adornos:** grade **A, 96/100**, tres dimensiones sin puntuar
—`live_api_verification` entre ellas, porque no hay credencial de Polar aqui— y **dogfood FAIL
conocido** (`OAuth scope coverage missing for 126 endpoint(s)`: el spec cuelga scopes de un
esquema `http/bearer` y el generador no los mapea). Esta **declarado, no aprobado**. Mueve
dinero de terceros; ese dano no es firmable.

## 3. Principio de diseno

1. **Un verde tiene que tener sujeto.** Si no hay nada que comprobar, se dice "nada que
   auditar" — nunca "conforme".
2. **Declarar no es conectar, ni usar.** El manifiesto es un mapa de lo que existe; habilitar
   cada cosa es una decision aparte, con su gate.
3. **Una afirmacion que el disco desmiente es peor que un hueco.** El hueco no se lee como un
   hecho. Por eso la divergencia de version es fallo y la ausencia de dato no lo es.
4. **El grado parcial se nombra.** "No medido != aprobado" tambien dentro de un grado.
   Y su simetria, que faltaba: **medido en rojo tampoco es aprobado.** Un defecto se reconoce
   en el contrato o el gate lo trata como escondido.
5. **La libreria sigue fuera del repo.** Lo que viaja es el contrato.

## 4. Que se mide, y que no

`scorecard` y `dogfood` corren **a mano**, en la maquina que imprime, y dejan artefacto
fechado junto al CLI. El gate lee el artefacto — mismo contrato que `mide-mcp.mjs`: el gate
tiene que seguir pasando sin red, sin Go y sin credenciales.

**No medido, y declarado como tal:**

- `auth_protocol` y `live_api_verification` en los cuatro: exigen credenciales vivas.
- El *currency floor* de la press (`PRESS_REQUIRED_MIN`): se obtiene del contrato de setup de
  las skills, con red. `~/printing-press/.version-check/` esta vacio. Lo que si se sabe: los
  cuatro se imprimieron con **4.27.0** y el binario va por **4.28.0**.
- Si el agente **obedece** la escalera CLI-first. Sigue siendo capa B, y sigue sin correrse.

## 5. Modelo de amenazas (C3)

| Vector | Mitigacion |
|---|---|
| El gate se aprueba a si mismo sobre el conjunto vacio | `auditados === 0` → `○ Nada que auditar` + lista de lo no declarado; caso determinista |
| El manifiesto declara una version que el disco desmiente | Bucket `divergentes` → exit 1. Control negativo ejecutado: `9.9.9` vs `4.27.0` puso el gate en rojo |
| Un "A" parcial se lee como aprobado completo | `GRADO PARCIAL` con las dimensiones nombradas |
| Un CLI inventa respuestas en vez de llamar a la API | `skipped` en tres de cuatro: **escrito en la nota de cada entrada**, no en un anexo |
| Se conecta Telegram "porque el CLI ya existe" | `vertical: canal de chat externo — NO conectado`; declarar != conectar; C3 + C4 + gate humano |
| Se retira el MCP de Supabase "porque hay CLI" | §2.9: superficies distintas, declarado en el manifiesto |
| Un CLI publicado de la libreria ajena entra sin revision | Instalar uno es **CDC (C1)**, escrito en la escalera |

## 6. Evaluacion de impacto (C4)

Quien puede salir danado **sin que haya atacante**:

- **El dueno**, si lee "Imprenta conforme" y entiende que la palanca esta alineada. Es el dano
  que ya estaba ocurriendo: el verde llevaba desde el 2026-08-25 diciendo eso.
- **Un usuario final**, si alguien habilita `supabase-data-api` sobre datos reales creyendo
  que "grade A, dogfood PASS" cubre el aislamiento entre inquilinos. No lo cubre: eso es C7, y
  el `auth_protocol` de ese CLI esta **sin puntuar**. Este dano **no es firmable** (limite de
  C5): recae sobre quien no firmo.
- **El siguiente que lea el repo**, si toma la tabla de §2.3 por permanente. Los grados son del
  2026-08-25 sobre CLIs impresos con 4.27.0; se remiden, no se heredan.

## 7. Que cierra y que no

**Cierra:**

- **Go instalado y probado**: `go1.27.0`, checksum verificado, `hcloud` compilando. La maquina
  ya puede terminar una impresion, que era la mitad que faltaba.
- **El verde en vacio**, con caso determinista que lo caza si vuelve.
- **Los cuatro CLIs medidos y declarados**, con grado, veredicto de dogfood, dimensiones sin
  puntuar y estado de la anti-reimplementacion.
- **La divergencia de version** vigilada, con control negativo ejecutado (exit 1).
- **El lector de grados**, que ahora parsea en vez de acertar.
- **Los nombres de entorno de upstream**, sin romper el propio.
- **La escalera CLI-first con el escalon publico** (~455 CLIs), marcado como CDC.
- **14 casos deterministas nuevos** (42 en total) dentro de `npm run validate`.

**NO cierra:**

- **La capa B sigue sin ejecutarse.** Es la misma linea que abria el §8 anterior, y sigue
  igual de abierta: que el agente PREFIERA el CLI es expectativa, no hecho, hasta correrlo en
  sesion fria. Esta alineacion **anade** superficie a esa deuda, no la reduce: ahora hay un
  escalon mas (la libreria publica) que tampoco esta medido.
- **`auth_protocol` y `live_api_verification` sin puntuar en los cuatro.** Ninguno esta
  aprobado para produccion; estan declarados, que es otra cosa.
- **Anti-reimplementacion `skipped` en tres de cuatro.** Se cierra reimprimiendo o corriendo
  el chequeo con la press actual — y reimprimir es CDC.
- **Los cuatro originales siguen a 4.27.0**, ahora con el binario en **4.31.1** — cuatro
  versiones menores por detras, no una. `polar` es el unico impreso con la press actual.
  Ponerlos al dia es otra decision, con su diff y su firma, y el bug de truncado de
  `generate --force` (§2.10) dice que hay que hacerlo en directorio limpio.
- **`polar` no esta aprobado para produccion.** Le faltan `live_api_verification` (necesita
  credencial) y la cobertura de scopes (126 endpoints). Declarado, no aprobado.
- **No se construyo capa de transcendencia.** `polar-pp-cli` es la superficie generada mas el
  mirror SQLite: cero comandos novel. No es un "GOAT CLI" y no se vende como tal.
- **El skill global `pp-polar` no se instalo.** Eso amplia la superficie del agente en TODA
  sesion, que es justo el coste que esta palanca existe para vigilar: es otra decision.
- **Los cuatro servidores MCP con credenciales siguen sin medir.** El total real sigue siendo
  mayor que 20 363 y seguimos sin saber cuanto.
