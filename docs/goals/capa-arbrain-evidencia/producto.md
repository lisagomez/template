# Evidencia · fase 5 «producto» (capa Arbrain)

> Nodo `producto` y lazo `l-recompone` de `docs/goals/capa-arbrain-grafo.json`; puntos 6 y 7 del HECHO. Corridas del
> 2026-10-25 en el worktree `capa/arbrain`, contra el servidor de desarrollo de ese worktree (`http://localhost:3011`).
> Datos 100 % sintéticos: un negocio ficticio (Barbería La Alameda) y clientes inventados. Sin LLM, sin desplegar.
>
> Construido por el agente del producto (cortado por el reinicio de la máquina a las 10:17); cerrado por el coordinador:
> la voz compuesta declarada en el manifiesto, las capturas repetidas tras el reinicio y la recomposición repetida
> sobre el commit (abajo). Reproducir: `node scripts/recepcion/capturas.ts --base http://localhost:3011`
> (y `--recomposicion antes|despues`).

## El producto: Recepción

El asistente de mostrador de un negocio de servicios. Compone, sin escribir lógica nueva en ningún módulo:

| Pieza | Activo | Qué hace en el producto |
|---|---|---|
| La capa (base) | `TPL-capa` | la ventana, la intención sin LLM, el freno, la memoria por inquilino, el primer arranque y la lectura de solo conteos |
| El calendario (base) | `TPL-calendario` | llena la ranura de plan y atiende «¿qué tengo hoy?», «aparta una cita…», «cancela la cita de mañana» (por el freno) |
| La voz local (componentes) | `TPL-feature-dictado`, `TPL-dictado`, `TPL-bucle-voz`, `TPL-voz` | la ranura de voz: dictar, «Escuchar» y Modo conversación con Parakeet, Piper y Silero; el audio no sale de la máquina |
| El crecimiento (componente) | `TPL-feature-estudio-pymes` | «¿qué pongo en mis redes este mes?» abre su pantalla por intención (entró en la recomposición) |
| Lo propio | `TPL-feature-recepcion` | el adaptador de sus módulos, los servicios y precios de ejemplo, y su lectura de conteos (882 líneas en total, con las capturas) |

- **Marca propia**: «Recepción», con su asistente **Nora** y su acento (`#b45309`). Ni «Arbrain» ni «Levy».
- **Composición**: `productos/composiciones/recepcion.json` (funciones, módulos, ranuras, memoria del inquilino en el
  navegador del mostrador, modelo `sin-llm` sin clase C8, motores de voz locales y `nube: []`, `datosSensibles: true`).
- **Manifiesto**: `productos/recepcion.json` (plantilla v4); la composición va en `noCupo` con su propuesta para la v5.
- **Rutas**: `/recepcion` (`src/app/(productos)/recepcion/`, dentro de la capa) y `/api/recepcion/resumen`.

```text
$ npm run verifica:productos
Recepción (productos/recepcion.json) · plantilla v4 · blueprint · propios 1 · componentes 5 · base 3 · terceros 0 · reuso de composición 88.9 %
  ✓ el manifiesto tiene todos los campos de la plantilla
  … (35 comprobaciones en verde)
  · no cupo: la composición en la capa: … qué motores de voz lleva (Parakeet, Piper y Silero, locales; nunca nube) …
Productos en verde (plantilla v4): 3 manifiesto(s), 10 pendiente(s) declarados, 5 cosa(s) que no cupieron, propuestas.
43/43 siembras cazadas
```

## Capturas (punto 6), repetidas tras el reinicio con la voz ya compuesta

```text
$ node scripts/recepcion/capturas.ts --base http://localhost:3011
✓ 01-primer-arranque: la guía abre en la bienvenida con el asistente del producto (Nora) y su marca
✓ 02-primer-arranque-cuanto-pregunta: un paso, una decisión: lo irreversible pide el clic en los tres niveles
✓ 03-intencion-calendario: calendario.consulta-hoy → «Hoy tienes 3 citas: 10:30 Corte · Mario R.; 12:00 Arreglo de barba · Luis P.; 13:30 Corte y barba · Andrés G.»
✓ 04-intencion-mostrador: recepcion.servicios → «Corte: $180, unos 45 minutos. Son precios de ejemplo de un negocio ficticio.»
✓ 05-ranura-plan-calendario
✓ 06-memoria-recuerda: Lo recuerdo: «los martes llega el proveedor de navajas».
✓ 07-memoria-tras-recargar: Me pediste recordar: «los martes llega el proveedor de navajas». · claves: conversacion, primer-arranque, recuerdos
✓ 08-freno-pide: tarjeta con la cita «cancela la cita de mañana» y el botón Confirmar
✓ 09-freno-bloquea: «sí, confírmalo» no confirma; el Enter sobre Confirmar → «Sigue en pausa»; la ranura de plan aún tiene Corte · Daniela M.
✓ 10-freno-avanza: Cancelada «Corte · Daniela M.» de mañana a las 12:00. Le avisé a Daniela M.; es el simulador de tools/calendario: no salió ningún correo de verdad.
✓ 11-reserva: Listo: apartada una cita mañana (lunes, 26 de octubre) de 10:00 a 10:45.

Capturas de Recepción en verde: 11 pasos comprobados, 0 errores de consola · docs/goals/capa-arbrain-capturas/producto
```

| Lo que pide el HECHO | Captura |
|---|---|
| el primer arranque | `docs/goals/capa-arbrain-capturas/producto/01-primer-arranque.png`, `02-primer-arranque-cuanto-pregunta.png` |
| una petición por intención resuelta por un módulo | `03-intencion-calendario.png` (tools/calendario), `04-intencion-mostrador.png` (el propio) |
| el freno bloqueando sin confirmación y avanzando con ella | `08-freno-pide.png`, `09-freno-bloquea.png`, `10-freno-avanza.png` |
| la memoria del producto recordada tras recargar | `06-memoria-recuerda.png`, `07-memoria-tras-recargar.png` |
| la ranura de calendario llenada por `tools/calendario` | `05-ranura-plan-calendario.png` (`data-capa-llena="calendario"`) |
| la ranura de voz dictando | `12-voz-dictando.png` (la toma el agente de voz con el micrófono falso; ver `voz.md`) |

## Lectura de solo conteos (para la fase 6)

```text
$ curl -s http://localhost:3011/api/recepcion/resumen
{"resumen":1,"producto":"recepcion","generado":"2026-10-25T17:47:07.119Z","conteos":{"citas-hoy":3,"citas-manana":1},"enlaces":{"mostrador":"/recepcion"}}
```

La ruta devuelve solo lo que declara la composición (`resumen.conteos` y `resumen.enlaces`), validado con
`validaResumen` de la capa antes de salir. Lo que hace el job del VPS con esto, y el rechazo del texto libre, está en
`resumen.md`.

## Recomposición (punto 7)

El agente del producto intercambió un módulo REAL: `crecimiento-demostrado` (el «¿de dónde salió el crecimiento?» de
una pyme) por `estudio-pymes` (el «¿qué pongo en mis redes?»). Ninguno de los dos llama a un modelo (el estudio solo
pide el render local de su MP4). El intercambio toca dos datos, la lista `modulos` de la composición y el componente del
manifiesto, y nada de la capa.

Antes y después, en el recorrido de Recepción (los dos con 0 errores de consola):

| Lado | Captura | Lo comprobado |
|---|---|---|
| antes | `20-recomposicion-antes.png` | explorador: recepcion, crecimiento demostrado · «¿qué pongo en mis redes este mes?» → «Eso todavía no lo sé hacer…» (estudio-pymes no está) |
| antes | `21-recomposicion-antes-modulo.png` | «¿de dónde salió el crecimiento del trimestre?» → `/crecimiento` (pantalla de crecimiento-demostrado, en la ventana de la capa) |
| después | `22-recomposicion-despues.png` | explorador: recepcion, estudio pymes · «¿de dónde salió el crecimiento del trimestre?» → «Eso todavía no lo sé hacer…» |
| después | `23-recomposicion-despues-modulo.png` | «¿qué pongo en mis redes este mes?» → `/estudio` (pantalla de estudio-pymes, en la ventana de la capa) |

En esa corrida `tools/capa` no estaba rastreado todavía, así que el agente comparó con un índice temporal: la huella del
árbol de `tools/capa` fue `87b330b72d0dbccc` antes y después. La prueba con `git diff --stat` sobre el commit va abajo.

### Sobre el commit: `git diff --stat` de la capa vacío

Repetida por el coordinador sobre un commit de la rama `capa/arbrain`, con la capa ya rastreada: el árbol de `tools/capa` era
`8019a63e86050c56538ad68141e94ecbd63b8d8f`, el mismo que el del commit final (`git rev-parse HEAD:tools/capa`). El commit lleva
`estudio-pymes`; el intercambio vuelve a `crecimiento-demostrado` editando SOLO dos datos. Las capturas de los dos
lados se tomaron de nuevo (por eso cambian sus PNG y sus JSON en el diff: ahora el explorador lleva el nombre del
módulo y la voz compuesta).

Lado del commit (`estudio-pymes`), antes de tocar nada:

```text
$ node scripts/recepcion/capturas.ts --base http://localhost:3011 --recomposicion despues
✓ 22-recomposicion-despues: explorador: recepcion, dictado, estudio-pymes · «¿de dónde salió el crecimiento del trimestre?» → «Eso todavía no lo sé hacer…» (crecimiento-demostrado no está)
✓ 23-recomposicion-despues-modulo: ¿qué pongo en mis redes este mes? → /estudio (pantalla de estudio-pymes, en la ventana de (main))

Capturas de Recepción en verde: 2 pasos comprobados, 0 errores de consola · docs/goals/capa-arbrain-capturas/producto
```

El intercambio y lo que toca:

```text
$ git diff --stat
 .../producto/22-recomposicion-despues.png          | Bin 143478 -> 156936 bytes
 .../producto/23-recomposicion-despues-modulo.png   | Bin 158363 -> 171354 bytes
 .../producto/recomposicion-despues.json            |   4 ++--
 productos/composiciones/recepcion.json             |   2 +-
 productos/recepcion.json                           |   2 +-
 5 files changed, 4 insertions(+), 4 deletions(-)

$ git diff --stat -- tools/capa
(vacío)

$ git diff
-  "fecha": "2026-10-25T16:15:23.155Z",
+  "fecha": "2026-10-25T18:58:43.812Z",
-      "comprobado": "explorador: recepcion, estudio pymes · «¿de dónde salió el crecimiento del trimestre?» → «Eso todavía no lo sé hacer…» (crecimiento-demostrado no está)"
+      "comprobado": "explorador: recepcion, dictado, estudio-pymes · «¿de dónde salió el crecimiento del trimestre?» → «Eso todavía no lo sé hacer…» (crecimiento-demostrado no está)"
-    "estudio-pymes"
+    "crecimiento-demostrado"
-   { "id": "TPL-feature-estudio-pymes", "para": "el crecimiento del negocio: qué publicar este mes en sus redes, abierto por intención desde el mostrador (sus pantallas, sin LLM y sin que nada salga de la máquina); reemplazó a crecimiento-demostrado en la recomposición" },
+   { "id": "TPL-feature-crecimiento-demostrado", "para": "el crecimiento del negocio: de dónde salió lo que creció, abierto por intención desde el mostrador (sus pantallas, sin LLM y sin que nada salga de la máquina); módulo de la recomposición" },
Recepción (productos/recepcion.json) · plantilla v4 · blueprint · propios 1 · componentes 5 · base 3 · terceros 0 · reuso de composición 88.9 %
Productos en verde (plantilla v4): 3 manifiesto(s), 10 pendiente(s) declarados, 5 cosa(s) que no cupieron, propuestas.
Enchufes en verde: 23/23 activos con pantalla.
```

Lado intercambiado (`crecimiento-demostrado`) y su ruta en el recorrido:

```text
$ node scripts/recepcion/capturas.ts --base http://localhost:3011 --recomposicion antes
✓ 20-recomposicion-antes: explorador: recepcion, dictado, crecimiento-demostrado · «¿qué pongo en mis redes este mes?» → «Eso todavía no lo sé hacer…» (estudio-pymes no está)
✓ 21-recomposicion-antes-modulo: ¿de dónde salió el crecimiento del trimestre? → /crecimiento (pantalla de crecimiento-demostrado, en la ventana de (main))

Capturas de Recepción en verde: 2 pasos comprobados, 0 errores de consola · docs/goals/capa-arbrain-capturas/producto

$ node scripts/capa/recorrido.ts --base http://localhost:3011 --solo /recepcion
✓  1 /recepcion                                 recepcion · HTTP 200 · lienzo 1105 caracteres
Recorrido de la capa: 1/1 rutas dentro de la capa · 0 error(es) de consola · <scratchpad>/rec-recepcion/resumen.json
```

Después se devolvieron los dos datos al estado del commit (`git checkout -- productos/composiciones/recepcion.json
productos/recepcion.json`). **Intercambiar un módulo tocó dos líneas de datos y cero de `tools/capa`.**
