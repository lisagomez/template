# El template sirve para dos cosas, no una

**Añadido:** 2026-08-23 · **Actualizado:** 2026-08-27 · **Estado:** camino completo y
cableado; la **puerta de entrada** está commiteada pero **sin PR y con el CDC sin firmar**

Hasta 2026-08-23 el template asumía **una app que se despliega**. El otro caso real, y el
que motivó esto, es **una herramienta que se construye una vez y se reusa** en los proyectos
que vengan después.

| | Una app | Una herramienta |
|---|---|---|
| Puerta (humano) | — | `docs/CREAR-UNA-HERRAMIENTA.md` |
| Runbook (técnico) | `docs/DEPLOY-HETZNER.md` | `docs/EMPAQUETAR-HERRAMIENTA.md` |
| Comando | `npm run configura:deploy` + `deploy` | `npm run empaqueta <nombre>` |
| Vive en | `src/` | `tools/<nombre>/` |

## Lo que de verdad falla en una herramienta

No es el código: eso lo cazan `typecheck` y los tests. Es el **contrato del paquete**, y
todos sus fallos comparten la misma forma — **compilan en verde y revientan en el proyecto
de destino**:

- `exports` sin `types` → el consumidor pierde el typecheck **en silencio**.
- `files` sin `dist` → publicas fuentes, o nada.
- React en `dependencies` en vez de `peer` → dos Reacts en el árbol, el bug de hooks que
  nadie encuentra.
- `'use client'` perdida en el build → Next intenta renderizar en el servidor y **el error
  no menciona tu paquete**.

Por eso el paso que cierra `npm run empaqueta` **no es una aserción**: instala el tarball en
un proyecto temporal limpio y lo importa. Ahí "es compatible" deja de ser una opinión.

## Decisiones que no se deducen del código

- **El núcleo no importa nada.** Ni React, ni Next, ni Supabase. Si lo hace, no es una
  herramienta: es un trozo de una app con otro nombre. Lo que los necesite va en un entry
  point aparte (`./react`) con `peerDependency` **opcional**.
- **Tarball, no `npm link`.** `npm link` resuelve por symlink y hace funcionar cosas que en
  una instalación real fallan (deps hoisted, React duplicado que el symlink oculta).
- **El empaquetador no publica.** Publicar es irreversible en la práctica: un `unpublish` no
  borra lo que ya se descargó. Gate humano, no paso de script.
- **C1 aplica a los paquetes propios**: el consumidor pinea versión exacta. Un rango `^`
  convierte una publicación tuya de un martes en un cambio de comportamiento simultáneo en
  varios proyectos, sin diff y sin aprobación. Ver [[gobernanza-agentica]].

## La puerta de entrada (2026-08-26)

El runbook técnico estaba escrito para **quien teclea**, y `AGENTS.md` exige lo contrario:
el humano habla y el agente construye. Media fábrica era inaccesible para su propio usuario
objetivo. `docs/CREAR-UNA-HERRAMIENTA.md` cierra ese hueco y **delega** el contrato técnico
en `EMPAQUETAR-HERRAMIENTA.md`, que no se tocó.

Lo que aporta y no estaba en ningún sitio:

- **El "todavía no".** Sin reúso real **3+ veces**, empaquetar solo suma una versión que
  mantener. El documento tiene que poder decir *no lo hagas todavía*.
- **La frontera de decisiones.** El agente decide arquitectura, partición núcleo/entry
  point, `exports` y tipos. El humano decide tres: si debe existir, **si se publica**, y con
  qué versión exacta entra en cada proyecto.
- **Registro Agent-First cableado, no aspiracional**: el verificador comprueba que el
  documento existe, que delega en vez de duplicar, que declara *"no vas a teclear nada"* y
  que nombra el gate de publicación. Verificador **127 → 133**.

**El control negativo destapó un bug propio** y esa es la lección transferible: las tres
comprobaciones del contenido vivían dentro de un `if (documento !== null)`, así que al
borrar el documento **se saltaban en silencio** — el total bajaba a 130 y fallaba una sola.
Un gate que se encoge cuando desaparece lo que vigila parece casi verde. Ahora fallan las
cuatro sobre 133 constantes. **Comprobación que se salta = comprobación que miente.**

## Pendiente

- ~~El tipo de proyecto no se preguntaba: `/new-app` asumía "aplicación".~~ **Cerrado el
  2026-08-27** (CDC de radio skill): la entrevista tiene pregunta 8 "El Destino"
  (aplicación | herramienta) y `BUSINESS_LOGIC.md` §7 nace con "Tipo de proyecto" y la entrega
  según el tipo (`deploy` vs `empaqueta`). PRP-002 lo guarda además en `project_settings`.
- ~~El CDC sin firmar.~~ **Firmado el 2026-08-28** por lisagomez, las dos entradas (puerta
  y skill). **PR #31 abierto el
  2026-08-28** con los gates re-corridos de cero y en verde; falta la firma para fusionar.
  Rama `puerta-de-herramientas`, **rebasada sobre `main` el 2026-08-28** tras 22 commits de
  distancia: los conflictos fueron los tres esperables de un log y un índice —`BITACORA-CDC.md`
  (unión: entradas de `main` + la de la puerta), `MEMORY.md` (se conserva el índice comprimido
  vivo, no el viejo de la rama) y el pendiente de `new-app`, ya cerrado en `main`.
  **La cifra del verificador que declaraba el CDC (133) era de otra base**: sobre `main` al día
  la puerta suma 6 comprobaciones a 130 → **136**. El worktree **no tiene `node_modules`**; los
  gates de gobernanza y regresión corren con `node` pelado, `build`/`lint` no.
- **Solo está probado el cableado, no la conducta.** Que un agente frío *llegue* a la puerta
  está demostrado; que **obedezca** el registro Agent-First es capa B (casos-trampa en
  `golden-sets`) y **no está medido**. Es la lección del 2026-08-23 aplicada a este cambio.
- **Presupuesto de contexto al límite**: `CLAUDE.md` queda al **93 % de 8000** y el total de
  sesión al **94 % de 12000**. Este cambio costó +59 tokens. Quedan pocas ramas de decision
  tree antes de que `mide:contexto` se ponga rojo. Ver [[eficiencia-tokens]].
- **ESM only.** Dar soporte a un consumidor CommonJS es un doble build y **un CDC propio**.
  Declarado explícitamente en el runbook (§7) el 2026-08-26: no es un flag, es una decisión.
- ~~El empaquetador prueba el contrato, **no el encaje con el proyecto de destino**.~~
  **Cerrado el 2026-08-26**: `npm run empaqueta <nombre> -- --en <ruta>` instala el tarball en
  el proyecto de destino con `--no-save` (sin tocar su `package.json` ni su lockfile), deja que
  **npm dictamine los peers contra el árbol real** (React 18 frente a `^19` → `ERESOLVE` con la
  razón de npm), importa desde ahí y lo retira. Probado con dos consumidores (React 19 encaja,
  React 18 avisa). Gotcha que cazó: `--en` sin valor resolvía al cwd — este mismo repo — y se
  instalaba aquí; ahora se rechaza. Lo que sigue sin probar es la lógica en el runtime del
  destino: eso es un test del consumidor.
