# Construir una herramienta, empaquetarla y reusarla

Este template sirve para dos cosas distintas, y conviene saber en cuál estás:

| | **Una app** | **Una herramienta** |
|---|---|---|
| Qué produces | Un sitio que se despliega | Un paquete que se instala |
| Dónde acaba | Un VPS con Docker y TLS | El `node_modules` de otros proyectos tuyos |
| Runbook | [`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md) | este |
| Qué la rompe | Que el servidor se quede sin RAM | Que **el contrato del paquete** esté mal |

Lo segundo es lo que casi nadie prueba: el código funciona, los tests pasan, y el paquete
**revienta en el proyecto de destino** — que es el peor sitio para enterarse.

---

## 1. Dónde vive

```
tools/
└── mi-herramienta/
    ├── package.json      # el contrato: exports, files, peerDependencies
    ├── tsconfig.json     # build propio, con declaration: true
    ├── src/
    │   ├── index.ts      # nucleo: TypeScript puro, CERO dependencias
    │   └── react.tsx     # opcional: lo que necesite React, aparte
    └── dist/             # generado; esta en .gitignore
```

Copia **`tools/ejemplo-herramienta/`** como andamio. No es un ejemplo de mentira: es el que
pasa el empaquetador en verde, así que su `package.json` ya tiene el contrato correcto.

---

## 2. La regla que decide si tu herramienta es reusable

> **El núcleo no importa nada.** Ni React, ni Next, ni Supabase.

Si el núcleo importa React, ya no es una herramienta: es un trozo de una app concreta con
otro nombre. Lo que necesite React vive en un **entry point aparte** (`./react`), detrás de
un `peerDependency` **opcional**. Así:

- quien solo usa la lógica no arrastra React;
- quien usa el componente aporta **su** versión de React — nunca se empaqueta una copia.

Dos Reacts en el mismo árbol es el bug de hooks que nadie encuentra en toda una tarde.

---

## 3. Empaquetar

```bash
npm run empaqueta mi-herramienta
```

Hace cuatro cosas, y **ninguna es opcional**:

| Paso | Qué caza |
|---|---|
| **Contrato del `package.json`** | `exports` sin `types` (el consumidor pierde el typecheck **en silencio**), `files` sin `dist` (publicas fuentes o nada), React en `dependencies` en vez de `peer`, versión que no es semver |
| **Build** | Lo obvio |
| **`'use client'` sobrevive** | Si se pierde, el consumidor recibe un componente que Next intenta renderizar en el servidor y **el error no menciona tu paquete** |
| **Integración real** | Proyecto temporal limpio → `npm install <tarball>` → importar y ejecutar. Aquí "compatible" deja de ser una opinión |

Ese último paso es el que importa. Todo lo demás lo puedes tener verde con un paquete que
no se instala.

---

## 4. Integrarla en otro proyecto

**Durante el desarrollo** — el tarball, no `npm link`:

```bash
npm install /ruta/a/este-repo/tools/mi-herramienta/mi-herramienta-0.1.0.tgz
```

`npm link` te miente: resuelve por symlink y hace que funcionen cosas que en una instalación
real fallan (dependencias hoisted que en el destino no existen, un React duplicado que el
symlink oculta). El tarball es exactamente lo que instalará el consumidor.

**Antes de instalarla a mano, deja que el empaquetador pruebe el encaje con TU proyecto:**

```bash
npm run empaqueta mi-herramienta -- --en /ruta/a/mi-otro-proyecto
```

El proyecto limpio del paso de integración no tiene React ni Next, así que no puede ver lo
que más duele: un peer que tu proyecto tiene en otra *major*. Con `--en` el tarball se
instala en ese proyecto **sin tocar su `package.json` ni su lockfile** (`--no-save`), npm
dictamina los peers contra el árbol real (un React 18 frente a un peer `^19` sale como
`ERESOLVE`, con la razón de npm delante), se importa desde ahí, y se retira. El destino
queda como estaba. Lo que sigue sin probar es tu lógica en su runtime — eso es un test tuyo.

**Ya en serio** — publicado en un registro:

```bash
npm publish --access restricted     # o el registro privado que uses
```

Y en el proyecto que la consume, **pinea la versión exacta**:

```jsonc
"dependencies": { "@tu-scope/mi-herramienta": "0.3.1" }   // no "^0.3.1", no "latest"
```

C1 aplica igual a tus propios paquetes: **`latest` es anti-patrón aquí también.** Un rango
`^` convierte una publicación tuya de un martes en un cambio de comportamiento en tres
proyectos a la vez, sin diff y sin aprobación.

---

## 5. Compatibilidad: lo que hay que declarar

| En `package.json` | Por qué |
|---|---|
| `engines.node` | El consumidor sabe en qué Node corre. Sin esto se entera al desplegar |
| `peerDependencies` con rango **amplio** (`^19.0.0`) | Un rango estrecho te obliga a publicar cada vez que el consumidor sube de menor |
| `peerDependenciesMeta.<dep>.optional` | Para lo que solo necesita el entry point de React |
| `type: "module"` | Sin esto Node adivina si es ESM o CJS, y acierta la mitad de las veces |
| `sideEffects: false` | Deja que el bundler del consumidor elimine lo que no usa |

**Este template es ESM.** Si necesitas dar soporte a un consumidor CommonJS, eso es una
decisión aparte (doble build) y **un CDC**: cambia lo que tu paquete promete.

---

## 6. Versionar

Semver, y con una lectura concreta para herramientas:

- **patch** — arreglas algo sin cambiar la superficie.
- **minor** — añades API. Lo que ya existía sigue igual.
- **major** — cambias o quitas algo que alguien ya usa. **Cambiar la forma de un `export` o
  quitar un subpath de `exports` es major**, aunque el código "haga lo mismo".

Antes de publicar un major, `npm run empaqueta` en verde no basta: instala el tarball en un
proyecto que ya la use y comprueba que compila. El empaquetador prueba que el paquete se
instala; **solo tú sabes quién lo consume**.

---

## 7. Qué NO hace el empaquetador

- **No publica.** Publicar es irreversible en la práctica (un `unpublish` no borra lo que ya
  se descargó), así que es un gate humano, no un paso de script.
- **No prueba tu lógica.** Prueba el *contrato*: que se instale, se importe y traiga tipos.
  Los tests de lo que hace tu herramienta son tuyos.
- **No comprueba el proyecto de destino salvo que se lo pidas.** Que el paquete se instale
  limpio no significa que encaje con la versión de React o de Next que tenga tu otro
  proyecto; `--en <ruta>` (§4) lo instala ahí y deja que npm lo dictamine. Sin `--en`, el
  veredicto es solo sobre el contrato.
- **No hace doble build ESM/CJS.** El template es ESM-only (§5): un consumidor CommonJS es
  una decisión aparte y un CDC, no un flag.
