# SDD — La imprenta de CLIs (tercera palanca de eficiencia)

**Estado:** **construido y medido el 2026-08-25.** Manifiesto, auditor (con deteccion de
libreria local), medidor de MCP, nivel `mcp` en el presupuesto, skill `cli-audit` y reglas
inline, todo dentro de `npm run validate` (125 comprobaciones, 99 contratos). El "~100x" del
material de origen queda **refutado** y sustituido por un rango medido.
**Falta — y no es menor**: los casos-trampa de las reglas CLI ya existen en `golden-sets`, pero
**nadie los ha ejecutado en sesion fria** (§8). Que las reglas disparen de verdad sigue sin
medir, que es exactamente la distincion que esta capa aprendio a la mala el 2026-08-23.
**Ambito:** el contrato, la medicion, el auditor y las reglas viajan con el template.
**Imprimir, mejorar y regenerar el indice son acciones de un proyecto derivado en su
maquina**: el *repositorio* no lleva libreria de binarios ni debe llevarla (aunque la
maquina de desarrollo pueda tener la suya — §2.5).

---

## 1. El problema

La fabrica ya tiene dos palancas de eficiencia medidas: el **routing por nivel**
(`routing-modelos.json`, 3 niveles x 17 clases con precio pineado) y el **cache de prefijo**
(90% del coste de entrada si el prefijo aguanta). Ambas vigiladas por `npm run validate`.

Falta la tercera, y es la unica que ataca un coste que **ningun gate veia**: un servidor MCP
inyecta los esquemas de sus herramientas en **cada sesion, se usen o no**. Un CLI se paga
cuando se invoca.

`mide-contexto.mjs` vigilaba `CLAUDE.md`, `GEMINI.md`, los skills y la memoria — todo lo que
esta escrito en markdown. **No vigilaba los MCP**, que es donde estaba el gasto grande.

## 2. Lo que se descubrio al escribirlo

### 2.1 El "~100x" no tenia respaldo

La spec sospechaba de la cifra heredada. La sospecha era correcta. El origen es
`04-politica-cli-first.md` (Hermes OS), y dice literalmente:

> *"Un CLI gasta ~100x menos tokens que razonar la llamada o usar un MCP pesado."*

Sin medicion, sin metodo, sin fuente. Una afirmacion pelada dentro de un documento de
politica — es decir, en el sitio donde mas se parece a un hecho.

### 2.2 Los MCP cuestan mas que TODAS las instrucciones juntas

Medido el 2026-08-25 arrancando cada servidor por stdio y pidiendole `tools/list`:

| Servidor | Tokens/sesion | Herramientas |
|---|---:|---:|
| chrome-devtools | 6 382 | 29 |
| firebase | 6 083 | 19 |
| playwright | 5 077 | 24 |
| next-devtools | 1 562 | 4 |
| sequential-thinking | 1 259 | 1 |
| **Total medido** | **20 363** | **77** |
| supabase, brave-search, firecrawl, n8n | *no medidos* | requieren credenciales |

**El total real es MAYOR**: cuatro servidores no se pudieron medir sin credenciales, y se
declara asi en el artefacto en vez de contarlos como cero.

Para dimensionarlo: **todo** el contexto siempre-presente de la fabrica —`CLAUDE.md`
expandido, `MEMORY.md` y las descripciones de los 22 skills— son **11 083 tokens**. Cinco
servidores MCP cuestan **casi el doble**, y hasta hoy no aparecian en ningun presupuesto.

### 2.3 El ratio real, y por que el numero unico es la pregunta equivocada

Comparando el caso mejor documentado (Playwright, que tiene MCP **y** CLI):

| Escenario | Coste | Ratio vs MCP |
|---|---:|---:|
| MCP cargado, se use o no | 5 077 / sesion | — |
| CLI: releer el `--help` completo cada sesion | 1 836 | **2.8x** |
| CLI: consultar un subcomando (`click --help`) | 91 | **55.8x** |
| CLI: no usar Playwright en esa sesion | **0** | ∞ |

**Veredicto sobre el "~100x": refutado como cifra general.** El rango medido va de **2.8x**
(uso ingenuo: el agente reescanea el catalogo entero en cada sesion) a **55.8x** (consulta
puntual). Ni un solo escenario medido llega a 100x.

Pero el ratio es la pregunta equivocada, y esta es la aportacion propia de este SDD:

> **El coste del MCP es incondicional; el del CLI es condicional.**

Un proyecto que usa Playwright en 1 de cada 20 sesiones paga **101 540 tokens** por el MCP
(5 077 x 20) y ~2 081 por el skill del CLI, una sola vez, en la sesion que lo necesita. Ahi
el factor no es 2.8x ni 55.8x: es **~49x**, y sube cuanto menos se use la herramienta.

**La palanca no es "el CLI es mas barato por llamada". Es "el CLI no se paga cuando no se
usa".** Por eso la decision correcta no es global sino por servidor, y depende de la
frecuencia de uso — no de un factor heredado.

### 2.4 El CLI que preferiamos nunca se habia ejecutado

Al ir a medir el lado CLI aparecio esto: `AGENTS.md` declaraba *"CLI (preferido, menos
tokens)"* y el skill `playwright-cli` montaba un flujo QA de 6 fases sobre `npx playwright
navigate | click | fill | snapshot`. **Ninguno existe en ese nivel.** Los verbos con estado
viven bajo el subcomando `playwright cli`; `navigate` se llama `goto`; `--output` no existe.
Playwright ni figuraba en `package.json`.

Los cuatro nombres coinciden **exactamente** con las herramientas del MCP
(`playwright_navigate`, `playwright_click`...): se dedujo el CLI del MCP en vez de
consultarlo. Corregido y probado de punta a punta el 2026-08-25; dos contratos `prohibido`
en el corpus impiden que la forma inventada vuelva.

> Es el caso de estudio de este SDD: **la fabrica ya habia elegido CLI sobre MCP, y la
> eleccion no valia nada porque el CLI no existia.** Preferir un CLI inexistente cuesta mas
> tokens que el MCP que reemplaza — el agente gasta la sesion descubriendo que no funciona.

### 2.5 Esta maquina SI imprime — y el indice ajeno no se instala

`~/printing-press/library` **existe en esta maquina**, con cuatro CLIs (`digitalocean`,
`hcloud`, `supabase`, `telegram-bot`). Y en `Downloads` estaba su indice,
`cli-library-index.json`, generado el 2026-07-26.

**No se instala en el repo, y la razon importa.** Instalarlo puso `fuente_impresos: indice`
—es decir, el auditor **afirmando saber** lo que hay impreso— y con ello reporto `FALTA`
sobre `playwright` y `gog`, que existen. `validate` en rojo permanente sobre una premisa
falsa. Es la doctrina de `INCIDENTES.md` aplicada aqui: *"nace vacio en cada proyecto...
heredar los de otro no aporta nada y si confunde"*. Un boilerplate que se clona no puede
declarar impresos los CLIs de otra instancia.

Lo que si salio de ahi: **el auditor ahora detecta la libreria local** (`CLI_PRESS_LIBRARY`
o `~/printing-press/library`), que es la fuente de maxima fidelidad porque lee el disco en
vez de creerse un JSON. Probado contra la libreria real:

| Conducta portada | Resultado medido |
|---|---|
| `hcloud` sin `scorecard`, con `dogfood` FAIL | `sin_grado`, exit 1 — **no medido != aprobado** |
| `telegram` casa con el dir `telegram-bot` | casado por tolerancia de sufijo |
| `telegram` sin grado + indice con grade A | **heredado** del indice, marcado como tal |
| `hcloud` sin grado + indice con grade `null` | **NO** heredado — el bug del `or` encadenado no se reprodujo |

### 2.6 Un CLI oficial no es un CLI impreso

Modelar `playwright` y `gog` como `estado: cli` puso el gate en rojo: el auditor les exigia
aparecer en la libreria de Printing Press, donde nunca van a estar porque **existen
upstream**. El manifiesto de origen no necesitaba la distincion (alli todo CLI era impreso);
aqui si. Estados: `mcp` · `cli-oficial` (mejor caso: nada que imprimir) · `cli-impreso`
(se audita) · `sin-asignar` (se reporta).

## 3. Principio de diseno

1. **Se mide o se declara desconocido.** Ninguna cifra heredada se repite como propia.
2. **No medido != aprobado.** Un servidor sin credenciales no cuenta como cero: cuenta como
   no medido, y el artefacto dice que el total real es mayor.
3. **La decision es por servidor, no global.** Depende de la frecuencia de uso y de si el
   CLI existe de verdad.
4. **Aqui no se imprime.** El contrato y la medicion viajan; la impresion es de la maquina
   que tiene Go y la libreria.

## 4. Que se mide, y que no

`scripts/mide-mcp.mjs` arranca cada servidor de `.claude/example.mcp.json` por stdio, hace
el handshake `initialize` y cuenta los tokens del JSON de `tools/list`.

**No corre en `npm run validate`**: necesita red y `npx`, y el gate tiene que seguir pasando
sin red, sin Go y sin credenciales. Corre a mano, deja artefacto fechado, y el gate lee el
artefacto. Si no puede medir **ningun** servidor no escribe artefacto y sale con `2`: un
artefacto vacio se leeria despues como "los MCP no cuestan nada", que es lo contrario.

Limite declarado: se cuenta el JSON de `tools/list`. El arnes puede envolver los esquemas de
otra forma, asi que la cifra sirve para **comparar y controlar crecimiento**, no para
facturar. Es el mismo contrato que la calibracion de `presupuesto-contexto.json`.

## 5. El hueco que se cerro de paso

`.mcp.json` —el archivo **vivo**, el que carga los esquemas en cada sesion— pineaba sus tres
servidores con `@latest`, mientras `example.mcp.json` los tenia correctamente pineados. El
verificador solo comprobaba el espejo.

Con `@latest`, esos 5 077 tokens de Playwright pueden convertirse en 8 000 sin diff, sin
regresion y sin aprobacion — la superficie que este SDD acaba de medir, entrando por una
puerta sin vigilancia. Cerrado: comprobacion nueva en `verifica-gobernanza.mjs` (116/116),
que degrada con gracia si el archivo no existe, porque **una maquina sin `.mcp.json` no es
una maquina en falta**.

## 6. Modelo de amenazas (C3)

| Vector | Mitigacion |
|---|---|
| Un CLI impreso **inventa** respuestas en vez de llamar a la API | Regla anti-reimplementacion inline; grade A antes de produccion |
| Un CLI que mueve dinero se marca `readOnly` por error | Dry-run por defecto; escrituras marcadas destructivas. **No es firmable** (limite de C5: el dano recae sobre terceros) |
| Un servidor MCP se auto-actualiza y amplia lo que el agente puede hacer | Pineo verificado en el espejo **y** en el vivo (§5) |
| El manifiesto declara impreso algo que no existe | El auditor declara `fuente_impresos`; sin libreria ni indice dice "no se", nunca "0 faltantes" |
| Un CLI de canal de chat se conecta "rapido" | Que exista no autoriza a conectarlo: C3 + C4 + gate humano, sin excepcion |

## 7. Evaluacion de impacto (C4)

Quien puede salir danado **sin que haya atacante**:

- **El dueno del proyecto**, si confia en una cifra de ahorro inventada y desmonta un MCP que
  si necesitaba. Mitigado: el rango medido esta declarado con sus escenarios, no como factor
  unico.
- **Un usuario final**, si un CLI de cobros ejecuta una escritura que se creia de lectura.
  Mitigado: dry-run por defecto. **Este dano no es firmable** — no se redisena por firma, se
  redisena o no se hace.
- **El siguiente que lea el repo**, si asume que la palanca esta completa. Mitigado: §8.

## 8. Que cierra y que no

**Cierra:**
- La mitad izquierda de la comparacion, medida y con metodo declarado (§2.2, §2.3).
- El "~100x" heredado: refutado, con el rango real en su lugar.
- El pineo del `.mcp.json` vivo (§5).
- La sintaxis de Playwright, corregida y probada, con contratos que impiden la recaida (§2.4).
- **El manifiesto, el auditor y el skill `cli-audit`**: construidos, en `validate`, con seis
  controles negativos ejecutados (incluido el indice ilegible -> exit 2, no exit 0).
- **La deteccion de libreria local** y la herencia de grados, probadas contra la libreria
  real de esta maquina (§2.5).
- **Los ocho fallos del origen, convertidos en 28 casos deterministas**
  (`scripts/prueba-imprenta.mjs`, en `validate`), con cuatro controles negativos: romper el
  filtro de subdominios, el `or` encadenado de la herencia, el silenciado de `sin_grado` o
  el degradado de una entrada malformada pone la suite en rojo. Un bug ajeno del que solo
  copias la conclusion se repite; uno que conviertes en caso, no.

**NO cierra — y esto es lo que hay que leer antes de darlo por hecho:**

- **La capa B no se ha ejecutado.** Los casos ya existen —uno donde (ofrecen el MCP "porque
  es mas comodo" existiendo el CLI), otro de imprimir amparado en un presupuesto: mide que
  un tope de GASTO no se confunda con autorizacion de RADIO) y y otro de "¿que CLIs tenemos?"
  sin libreria ni indice: mide que responda "no puedo saberlo")— pero
  `npm run regresion -- --trampa` solo verifica que el corpus este COMPLETO. La ejecucion
  real exige **sesiones frias**, y quien escribio el cambio no puede correrlas sin
  contaminarlas.

  Por que importa aqui mas que en otros sitios: la primera corrida de capa B mostro que
  **C7 y C4 disparaban y C1 y C5 no**, y todos estaban igual de bien escritos. La diferencia
  no se ve leyendo — solo midiendo. Hasta que eso se corra, *"el agente prefiere el CLI"* es
  una expectativa, no un hecho.

*(Ya no aplica: los ocho fallos del origen son **28 casos deterministas** en
`scripts/prueba-imprenta.mjs`, dentro de `validate`. Van ahi y no en la capa B porque son
fallos de CODIGO: la capa B mide si el AGENTE obedece, y eso exige invocar al modelo.)*

- **Los cuatro servidores con credenciales siguen sin medir.** El total real es mayor que
  20 363 y no sabemos cuanto.

- **Aqui no se imprime ningun CLI.** No hay Go en esta maquina, y el repositorio no lleva
  libreria de binarios ni debe llevarla: es un boilerplate.

- **La mitad derecha no es un numero unico.** Depende de cuantas veces el agente relea el
  `--help`, que es una conducta, no una constante.
