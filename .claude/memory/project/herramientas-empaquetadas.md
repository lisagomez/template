# El template sirve para dos cosas, no una

**Añadido:** 2026-08-23 · **Estado:** camino completo, cableado y con CDC firmado

Hasta hoy el template asumía **una app que se despliega**. El otro caso real, y el que
motivó esto, es **una herramienta que se construye una vez y se reusa** en los proyectos que
vengan después.

| | Una app | Una herramienta |
|---|---|---|
| Runbook | `docs/DEPLOY-HETZNER.md` | `docs/EMPAQUETAR-HERRAMIENTA.md` |
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

## Pendiente

- **ESM only.** Dar soporte a un consumidor CommonJS es un doble build y **un CDC propio**.
- El empaquetador prueba el contrato, **no el encaje con el proyecto de destino**: que se
  instale limpio no significa que cuadre con la versión de React o Next que ese proyecto
  tenga.
