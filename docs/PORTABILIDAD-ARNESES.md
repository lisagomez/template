# Portabilidad entre arneses — medido, no afirmado

> **Si un gate solo pasa desde Claude Code, no es un gate del repo: es una costumbre de un
> arnes.** Este documento es la prueba de que no lo es, con lo que se midio el 2026-08-24 y
> lo que sigue sin poder medirse aqui.

El repo se escribio para dos lectores desde el principio: `AGENTS.md` es la **fuente unica**
de las instrucciones y `CLAUDE.md` son 17 lineas que la importan. Hasta hoy eso estaba
verificado contra la **documentacion** de opencode. Ahora esta verificado contra **el
binario que se ejecuta** y contra una corrida real del gate.

## 1. Como resuelve opencode las instrucciones (verificado en el binario, no en la doc)

El servicio `Instruction` del binario `opencode-linux-x64@1.18.21` busca, **hacia arriba
desde el directorio de trabajo**, esta lista y **para en el primer nombre que encuentra**:

```
AGENTS.md  →  CLAUDE.md  →  CONTEXT.md
```

Consecuencias para este repo, que no son opinion:

- **`AGENTS.md` gana siempre.** En un arbol donde existen los dos, `CLAUDE.md` **no se lee**
  — por eso todo lo que obliga vive en `AGENTS.md` y lo especifico del arnes se queda en el
  archivo de cada arnes.
- **opencode NO expande los imports `@ruta`** como hace Claude Code. Da igual aqui porque
  `AGENTS.md` es autocontenido; **dejaria de dar igual** el dia que alguien mueva una regla
  a un archivo importado. Si eso pasa, la regla existe para Claude Code y **no existe** para
  opencode: mismo repo, dos comportamientos.
- **`.claude/rules/` NO existe para opencode.** Cero apariciones en su binario; lo unico
  parecido, `.cursor/rules/`, vive dentro de un prompt que le dice al agente que los *lea*
  al escribir un `AGENTS.md` — no en su ruta de carga. Importa porque el siguiente ahorro de
  contexto que este repo tiene apuntado es justo mover parte de `AGENTS.md` ahi: **una regla
  obligatoria movida a `rules/` deja de existir en este arnes.** Mitigacion con su propio
  precio: `opencode.json` con `instructions: [".claude/rules/*.md"]` las carga, pero
  **siempre** —sin el `paths:` que es de donde sale el ahorro—, asi que la regla se conserva
  en los dos y **el ahorro solo se materializa en Claude Code**. Es un intercambio, no un
  ahorro gratis, y se mide antes de comprometerlo.
- Ademas lee `~/.claude/CLAUDE.md` (el global del usuario) salvo que se desactive con
  `disableClaudeCodePrompt`. Eso es del entorno de cada quien, no del repo.

## 2. Los 22 skills se cargan (medido)

`opencode debug skill` desde la raiz del repo: **23 skills, 22 de ellos los de
`.claude/skills/`** —la lista completa, ninguno perdido— mas el propio de opencode. El
directorio `.claude/skills/` no es una convencion de un solo arnes.

## 3. El gate corre desde el arnes ajeno (corrido, no supuesto)

`npm run validate` ejecutado **dentro de una PTY creada por el servidor de opencode**, con
el propio servidor como proceso padre:

```
padre:  5579  /...:/node_modules/.bin/opencode serve --port 4096
Gobernanza cableada: 113/113 comprobaciones en verde.
C2 capa A (contratos): 92/92 en verde — promovible.
✓ Limpio: ningun blob de la historia lleva una credencial con forma de viva.
✓ Contexto dentro de presupuesto.
✓ Routing coherente: cada clase con su nivel, cada nivel pineado y con precio.
✓ Contabilidad correcta.
== EXIT: 0 ==
```

Ningun paso del gate invoca a un arnes: son scripts de `npm` sobre Node. **El verificador lo
vigila** — si algun dia un script del gate llama a `claude`, `opencode` o similar, se pone
en rojo.

## 4. Lo que este repo NO puede medir — y por que no es deuda suya

Aqui se acaba el ambito del template, y la frontera importa mas que el dato.

Lo medido arriba es que opencode **carga** las reglas y **puede correr** el gate. Lo que no
esta medido es que un agente conducido por opencode las **obedezca**, porque eso exige una
sesion conducida por un LLM, y eso exige una **credencial de proveedor**.

**Un boilerplate no tiene credenciales.** No las tiene por diseño, no por descuido: no esta
provisionado, no corre gates de operacion y ninguno de sus gates puede depender de red ni de
una llave (por eso el vigilante de frescura vive **fuera** de `validate`). Pedir una
credencial para cerrar un pendiente *del template* seria mezclar dos ambitos que este repo
mantiene separados a proposito — ver `.claude/memory/project/gobernanza-agentica.md`, "Dos
ambitos que NO se mezclan".

Asi que esto **no es deuda del template**: es de quien lo use. Un proyecto derivado —que si
tiene llaves, proveedor y presupuesto— lo cierra en una tarde. Y el spec ya lo habia
previsto: pedia *"opencode instalado si se puede, **o** un informe medido de que lo impide y
que costaria"*. Esto es ese informe.

### Lo que costaria, para quien lo cierre

Con las cifras de este repo (calibracion de `.claude/presupuesto-contexto.json`, 3.644
chars/token, margen ~±8 % por archivo):

| Concepto | Medido |
|---|---|
| `AGENTS.md` | 6.826 tokens |
| 22 descripciones de skills | 2.508 tokens |
| **Suelo por turno** | **9.334 tokens** |

Precio calculado con el modulo del propio repo (`costeUsd`, nivel `capaz`), **supuestos
declarados**: 1.500 tokens de salida por turno y 10 turnos.

| | Coste |
|---|---|
| Turno 1 (prefijo frio) | $0,0337 |
| Turnos 2-10 (prefijo cacheado) | $0,0169 c/u |
| **Sesion de 10 turnos** | **$0,19** |
| La misma sin cache de prefijo | $0,34 |

Una sesion de evaluacion cuesta **centimos**: lo que falta nunca fue presupuesto. Y el 44 %
entre las dos ultimas filas es la leccion de siempre — el cache de prefijo es la palanca, no
el modelo.

**Si lo cierras en tu proyecto**, la medicion que vale no es "¿arranca?", es **capa B con
otro arnes al volante**: los casos-trampa del corpus, en sesion fria, midiendo si los
controles disparan igual. Eso tiene su propio protocolo (el corpus vive en la rama
`golden-sets`, nunca en el arbol) y merece su propia entrada en la bitacora.

## 5. Como conducir este repo desde opencode

```bash
npm install -g opencode-ai@1.18.21   # PINEADO: `latest` es anti-patron tambien aqui (C1)
opencode providers login             # interactivo, lo hace una persona
cd <el repo> && opencode             # lee AGENTS.md y ve los 22 skills
```

Dentro de la sesion, el gate es el mismo de siempre: `npm run validate`. **El cambio de
arnes no relaja ningun control** — el CDC (C1), el registro de riesgo (C5) y el resto siguen
viviendo en `AGENTS.md`, que es justo lo que opencode lee primero.

---

## Actualizacion 2026-08-26 — `.claude/rules/` ya existe, y opencode las carga por `opencode.json`

El ahorro apuntado arriba se ejecuto: `AGENTS.md` conserva solo lo que obliga y lo informativo
vive en `.claude/rules/*.md` con `paths:`. La mitigacion descrita en esta pagina es ahora
codigo: `opencode.json` con `instructions: [".claude/rules/*.md"]`, asi que **ninguna regla
existe en un arnes y no en el otro**. El precio tambien se cumplio tal cual estaba previsto:
en opencode las rules cargan siempre (3335 tokens medidos), el suelo ahi queda ~igual que
antes; en Claude Code baja de 11313 a 8437. `npm run mide:contexto` lo separa como nivel
*condicional*. Y `GEMINI.md` dejo de ser copia a mano: `npm run sincroniza:gemini` lo deriva de
`AGENTS.md` y el verificador falla si diverge — Gemini no carga rules, y se le dice donde estan.
