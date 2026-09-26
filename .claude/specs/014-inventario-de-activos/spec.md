# Spec 014 — Inventario de activos: el template como fuente del módulo `act` del ERP

> **Origen**: [`docs/GOAL-inventario-de-activos.md`](../../../docs/GOAL-inventario-de-activos.md),
> compilado con `/goal-compiler` el 2026-09-24 a partir de `businessos/departamentos/white-label.md`
> §5 y `businessos/erp/ERP-MAESTRO.md` §1.6, §1.7 y ERP-4 §4B. Diseño en
> [`docs/SDD-inventario-de-activos.md`](../../../docs/SDD-inventario-de-activos.md).
> Decisión del laboratorio: el inventario no es una lista nueva; es este repo convertido en
> **fuente** del inventario que ya existe (`erp.act_activo`).
> **Modificada por el PRP-004 (2026-09-24):** el ERP se mudó a `erp/` de este monorepo, ahora
> privado. El detector `swm-act` vive aquí (`erp/bin/`) y el ERP es fuente interna: la arista
> hacia `hermes-os-a2a` (PR #316) se retira.

## Contexto y objetivo

El template produce activos digitales en serie: herramientas empaquetables en `tools/`, features
en `src/features/`, skills, specs, gates y la capa de gobernanza. El ERP de la fábrica ya tiene
dónde inventariarlos (módulo `act`: `act_activo`, `act_version`, `act_costo`) y un detector de solo
lectura (`swm-act`) que descubre activos nuevos, cambiados o huérfanos. Pero ese detector revisa
`businessos/erp/`, el índice de CLIs y las ramas del trío: **este repo no está entre sus fuentes**,
así que nada de lo que nace aquí existe para el margen, la contabilidad ni el catálogo de marca
blanca. white-label §5 lo dice sin matices: sin asiento en el inventario no hay entrega.

El objetivo es que **ningún activo nazca en este repo sin asiento, y que nadie catalogue a mano**:
un índice versionado de identidad, un detector que compara el repo real con el índice, un gate
que falla cuando algo nace sin asiento, un costeo honesto con fuente declarada, un export que el
ERP acepta tal cual, y la arista para que `swm-act` lea este repo.

## Usuarios / actores

- **El laboratorio**: decide qué es un activo cuando la heurística duda; es el único que ratifica
  los ejes D+I y de defensibilidad y que da de alta en el ERP (directo o por el cosechador).
- **El agente que construye** (en esta sesión o en un `/goal`): crea herramientas y features; el
  gate lo frena si no deja asiento.
- **El detector `swm-act`** del ERP: lee el índice de este repo como una fuente más. Propone; no
  cataloga.
- **El contador**: consume el costeo y la clasificación D+I desde el ERP, nunca desde este repo.
- **Los terceros**: competidores y cualquier lector del repo público. Pueden leer qué existe, pero
  no cuánto costó ni qué protege el negocio.

## Historias de usuario

- H1: Como laboratorio quiero ver qué activos produce este repo, en qué estado y qué falta por
  medir, sin leer JSON.
- H2: Como laboratorio quiero que una herramienta nueva no se pueda entregar sin asiento, para no
  tener piezas huérfanas que nadie mantiene.
- H3: Como laboratorio quiero que el costo de cada activo venga de datos que el repo ya mide y que
  lo no medido se diga como tal, para conocer el margen por activo medido.
- H4: Como operador del ERP quiero importar los activos del template con los mismos campos y
  restricciones de `erp.act_activo`, sin transformar nada a mano.
- H5: Como laboratorio quiero que el repo público no revele costos ni el mapa de lo defendible.

## Requisitos funcionales (criterios de aceptación en EARS)

### Índice

- RF-1: EL SISTEMA mantendrá en el repo un índice versionado de activos con, por activo,
  identificador estable, nombre, tipo `act`, clase del catálogo, estado, ubicación verificable,
  responsable, origen y las rutas que cubre.
- RF-2: EL SISTEMA declarará en el mismo índice las fuentes que se escanean para descubrir
  unidades (directorios de herramientas, features, skills, specs, scripts, migraciones y CLIs
  impresos), de modo que añadir una fuente sea un cambio de datos y no de código.
- RF-3: SI el índice contiene un campo de costo, de clasificación D+I o de defensibilidad, ENTONCES
  EL SISTEMA fallará el gate nombrando el campo.

### Detector y gate

- RF-4: CUANDO se corra el detector, EL SISTEMA reportará cada unidad descubierta con el activo que
  la cubre y marcará NUEVO (unidad sin activo), HUÉRFANO (activo que no cubre ninguna unidad o cuya
  ubicación no existe) y AMBIGUO (unidad cubierta por más de un activo).
- RF-5: SI hay al menos un NUEVO, HUÉRFANO o AMBIGUO, ENTONCES EL SISTEMA saldrá con error y
  nombrará cada uno.
- RF-6: CUANDO exista un export anterior en la máquina, EL SISTEMA reportará como CAMBIADO el activo
  cuyo hash de contenido difiere del exportado, sin fallar por ello.
- RF-7: EL SISTEMA correrá el detector y sus pruebas dentro de `npm run validate`.
- RF-8: SI se intenta empaquetar una herramienta de `tools/` sin asiento en el índice, ENTONCES EL
  SISTEMA rechazará el empaquetado nombrando la herramienta.

### Costeo y clasificación (solo al exportar)

- RF-9: CUANDO se exporte, EL SISTEMA calculará por activo los cuatro componentes del catálogo
  (construcción, operación mensual, réplica, reposición), cada uno con `fuente` declarada.
- RF-10: SI un componente no tiene medición detrás, ENTONCES EL SISTEMA lo exportará como
  `no_medido` o `no_estimado` con la razón, y nunca como cero.
- RF-11: EL SISTEMA atribuirá el costo de construcción desde las trayectorias de la fábrica y el
  historial de git, declarando el método y la cobertura (qué parte de los commits del activo cae
  dentro de una sesión registrada).
- RF-12: CUANDO se exporte, EL SISTEMA propondrá el eje D+I heredado del origen y la defensibilidad
  por la heurística de ubicación, siempre en estado `propuesta` y con el porqué.

### Export y vista

- RF-13: CUANDO se exporte, EL SISTEMA escribirá fuera de git un ledger con el formato de
  `activos/activos.jsonl` y un SQL de filas para `erp.act_activo`, `erp.act_version` y
  `erp.act_costo` que respete sus columnas y restricciones.
- RF-14: EL SISTEMA ofrecerá un validador que aplique las migraciones de `erp/migrations/` en un
  Postgres desechable, cargue el SQL exportado y reporte el resultado sin dejar nada escrito.
- RF-15: EL SISTEMA generará una vista legible del inventario (identidad, estado y cobertura, sin
  costos) y el gate fallará si está desactualizada respecto al índice; lo que falta medir irá en el
  reporte de costeo del export, fuera de git, porque cambia con cada sesión registrada.

### Arista al ERP

- RF-16: EL SISTEMA expondrá el resultado del detector en JSON para que `swm-act`
  (`erp/bin/detector-swm-act.py`) lo lea como fuente, con la ubicación de cada activo en el mismo
  espacio de nombres que usa el catálogo, y cubrirá el ERP como activo externo que ese detector
  cataloga archivo por archivo.

## Requisitos no funcionales

- Sin red, sin credenciales y sin dependencias nuevas en el gate, como el resto de gates del repo.
  El validador contra Postgres necesita Docker y vive fuera de `validate`.
- El índice es pequeño y vive fuera de `.claude/`: no entra al presupuesto de contexto.
- El detector corre en menos de 5 segundos en este repo.
- Nada escribe en el ERP ni en Supabase, y ningún camino usa `service_role` (C7).

## Casos límite

- Una skill, spec o script nuevo que cae dentro de un activo agrupado (p. ej. el catálogo de
  skills) no es NUEVO: queda cubierto por el grupo. Una carpeta nueva en `tools/` o
  `src/features/` sí lo es.
- Un CLI impreso ya lo cataloga su propia fuente en el ERP (`cli-library-index.json`): aquí se
  cubre como activo externo y no se exporta, para no tener dos escritores del mismo activo.
- Una sesión registrada puede haber trabajado en otro repo en la misma ventana: la atribución por
  ventana de tiempo es un proxy y se declara como tal.
- Una trayectoria sin `costoUsd` aporta tokens pero no dólares: el componente queda con los tokens
  y `usd: null`, y no genera fila en `act_costo` (su `monto` es obligatorio).
- `erp.act_activo.costo_acumulado` es `not null default 0`, pero lo calcula un trigger desde
  `act_costo`. El export nunca lo escribe: un activo sin filas de costo queda en 0 en la BD y el
  ledger dice `no_medido`.
- Un activo cuya ruta se borra pasa a HUÉRFANO; darlo de baja en el ERP es decisión humana.

## Impacto sobre terceros

**¿A quién dañamos sin atacante?** El repo es público. §1.7 del maestro dice que los costos reales
por operación (`token_usage`) son un activo defendible —«benchmark que nadie más tiene»— y que la
clasificación de defensibilidad dice dónde se invierte en protección. Publicarlos regala el mapa
del foso. Por eso el índice solo lleva identidad; el costo y la clasificación se calculan al
exportar y viajan al ERP (RF-3, RF-13). El inventario habla de activos, nunca de los datos de
clientes que esos activos procesan (C4). El export se escribe en una ruta ignorada por git.

## Fuera de alcance

- Escribir en `erp.act_activo` o en cualquier Supabase: eso es del cosechador o del laboratorio.
- Ratificar ejes, capitalizar o dar de baja: decisiones humanas (D-07, D-10).
- Asignar folios `ACT-NNNN` o identificadores `A2A-NNN`: los acuña el ERP y el catálogo.
- Mergear el cambio del detector en `hermes-os-a2a`.
- Cambiar `AGENTS.md`, skills o `settings.json` (serían CDC).
- Re-evaluar qué datos de trayectorias ya estaban publicados antes de esta spec (ver Dudas).

## Criterios de finalización

- `npm run verifica:specs` en verde con esta spec.
- El detector reporta cada `tools/*` y cada unidad real con asiento y cero NUEVO, HUÉRFANO o
  AMBIGUO.
- Una herramienta ficticia en `tools/` pone el gate en rojo nombrándola; al quitarla vuelve a
  verde. Lo mismo con un asiento huérfano.
- El SQL exportado carga sin errores sobre `005_activos.sql` en un Postgres desechable.
- Cada componente de costo tiene fuente o `no_medido`/`no_estimado`; ningún cero sin medición.
- `git diff` de la rama no contiene costos ni clasificación estratégica.
- `npm run validate` en verde.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Las trayectorias de la fábrica (`trayectorias/datos/`) ya están
  commiteadas con tokens y `costoUsd` por sesión desde la spec 011. Con la lectura de §1.7 que
  hace esta spec, ¿deben seguir en el repo público? Decide el laboratorio; esta spec no las toca.
- [NECESITA ACLARACIÓN] Granularidad: las skills, las specs y los gates se inventarían como
  activos agrupados (precedente: A2A-013 «Skills de la fábrica»). Si el laboratorio quiere una
  fila por skill, es un cambio de datos en el índice.
- [NECESITA ACLARACIÓN] Responsable por defecto `dep-sw` para todo lo del template: el maestro usa
  `dep-*`, pero ningún documento nombra al departamento de software con ese código.
