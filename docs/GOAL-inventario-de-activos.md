# Inventario de activos del template — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-24. Este archivo es el spec completo; el bloque
> `/goal` corto que se pega en la sesión apunta aquí por ruta absoluta. Diagnóstico de forma:
> **LOOP** (1 de 4 en `loop-vs-grafo`: un solo agente lo resuelve sin perder nada; el cambio en
> `hermes-os-a2a` es una arista de salida, no un nodo aparte).
>
> Decisión del laboratorio (2026-09-24): el inventario de lo que genera este repo **no es una
> lista nueva**: es este repo convertido en **FUENTE del módulo `act` del ERP**, tal como lo
> manda `businessos/erp/ERP-MAESTRO.md`. La spec (SDD) y el plan (el papel del PRP) los escribe
> el ejecutor como primera fase, no esta compilación.

## MISION

Cuando termines, **ningún activo nace en este repo sin asiento**, y nadie cataloga a mano.

Hoy el template produce activos digitales en serie —cinco herramientas en `tools/`
(`extractor-documental` 0.7.0, `voz` 0.5.0, `dictado`, `asesor-ventas`, `ejemplo-herramienta`),
features en `src/features/`, 26 skills, 13 specs, gates en `scripts/`, CLIs declarados en
`.claude/imprenta/manifiesto.json`— y **ninguno aparece en el inventario de la fábrica**. El
detector `swm-act` (`~/code/a2aboths/businessos/detector-swm-act.py`) escanea `erp/{bin,reglas,
packs,migrations}`, el índice de CLIs y las ramas del trío; este repo no está entre sus fuentes.
Según la doctrina, eso significa que estos activos no existen para el margen, ni para la
contabilidad, ni para el catálogo de lo que se licencia en marca blanca.

La realidad que debe existir:

1. **Un índice versionado en el repo** —«el índice viaja en el repo», el mismo patrón que
   `cli-library-index.json`— con una entrada por activo: ID estable, nombre, tipo `act`
   (`software | config_agentica | datos | documento | infraestructura | licencia_suscripcion`),
   clase del catálogo (`PRODUCTO | FABRICA | CONOCIMIENTO | DISEÑO | COMERCIAL | INFRA`), estado
   (`produccion | beta | blueprint`), ubicación verificable (ruta), versión y hash o commit
   vigente, y responsable. Qué cuenta como activo y con qué granularidad (¿una skill es un
   activo, o lo es el catálogo de skills?) lo decides tú tras leer la definición operativa de
   `activos/CATALOGO.md`. Lo justificas en el SDD.
2. **Un detector de solo lectura** que compare las fuentes reales del repo con el índice y
   reporte, con el vocabulario del maestro, **NUEVO** (existe y no tiene asiento), **CAMBIADO**
   (el hash difiere de la versión vigente) y **HUÉRFANO** (tiene asiento pero ya no existe).
   Propone; no escribe.
3. **Un gate dentro de `npm run validate`** que falle en rojo, nombrando el activo, cuando algo
   nace sin asiento. Es la traducción literal de white-label §5: «sin asiento en el inventario
   no hay entrega». Un `sin-asignar` visible es válido; un hueco silencioso no.
4. **Costeo en los 4 componentes del catálogo** —construcción (hundido), operación mensual,
   réplica, reposición—, cada uno con `fuente` declarada. Se alimenta de lo que el repo ya mide
   (`src/lib/ai/contabilidad.ts`, `trayectorias/`, historial de git como proxy declarado) y usa
   `no_medido` cuando no hay dato. **Un costo inventado no es un valor; `no_medido` sí.**
5. **Clasificación en dos ejes, siempre como PROPUESTA**: D+I (`investigacion | desarrollo`,
   heredado del origen cuando se pueda leer, p. ej. de la spec o el PRP que lo parió) y
   defensibilidad (`defendible | reemplazable`) con la heurística D-12 por ubicación. En un repo
   público nada puede ser secreto industrial, así que la propuesta por defecto es `reemplazable`,
   con el porqué escrito. Ratificar es decisión del laboratorio (humano), nunca de un agente.
6. **Un export compatible con el ERP**: filas que respetan las columnas y los `check` de
   `erp.act_activo`, `act_version` y `act_costo` (`erp/migrations/005_activos.sql`) y el formato
   de `activos/activos.jsonl`, listas para que el cosechador o una persona las den de alta.
7. **La arista hacia `swm-act`**: un PR **sin merge** en `hermes-os-a2a` que agrega este repo
   como fuente del detector (lee el índice, no el árbol completo), con su `--dry-run` probado.
8. **Una vista legible** del inventario (qué existe, en qué estado, qué falta por medir), para
   que el laboratorio la consulte sin leer JSON.
9. **Enganche con la fábrica**: el skill `crear-herramienta` y `npm run empaqueta` dejan de
   poder producir una herramienta sin asiento (o el gate la atrapa en el siguiente validate).
   Si tocar el skill es la vía, es un CDC (C1): se redacta la entrada en
   `.claude/gobernanza/BITACORA-CDC.md` con aprobación **pendiente**, no se autoaprueba.

## LIBERTAD TECNICA

Tú eliges formato del índice (JSON, YAML, frontmatter en cada `tools/*/README.md`…), lenguaje
de los scripts, forma del detector y de la vista, y granularidad del inventario. Todo lo que
este spec nombra es sugerencia descartable salvo **RESTRICCIONES REALES**. Optimiza para que
el inventario **se mantenga solo** y sea barato en contexto (`npm run mide:contexto` es un gate:
no lo revientes con un índice gigante).

## INVESTIGA ANTES DE CONSTRUIR

Lee enteras, en este orden:

- `~/code/a2aboths/businessos/departamentos/white-label.md` §5 (la regla: asiento doble, costeo
  obligatorio, el cliente recibe USO).
- `~/code/a2aboths/businessos/erp/ERP-MAESTRO.md` §1.6, §1.7, ERP-4 §4B y ERP-6 (inventario
  dinámico, dos ejes, detector que propone, fuga de defendibles).
- `~/code/a2aboths/businessos/activos/CATALOGO.md` y `activos/activos.jsonl` (definición
  operativa, clases, esquema de costeo, datos base medidos).
- `~/code/a2aboths/businessos/detector-swm-act.py` y `cosechar-activos.py` (cómo detecta y cómo
  cosecha hoy; reutiliza su vocabulario).
- `~/code/a2aboths/businessos/erp/migrations/005_activos.sql` (el contrato real del export).
- En este repo: `scripts/audita-imprenta.mjs` + `.claude/imprenta/manifiesto.json` (un
  manifiesto auditado con estado `sin-asignar` visible: el patrón más cercano),
  `scripts/empaqueta-herramienta.mjs`, `src/lib/ai/contabilidad.ts`, `scripts/trayectorias/`,
  `docs/CREAR-UNA-HERRAMIENTA.md`, `docs/EMPAQUETAR-HERRAMIENTA.md`.

Revisa también 2 o 3 referencias externas de inventario de software vivo (catálogos de
servicios tipo Backstage, SBOM/CycloneDX, registros de activos de TI) y toma de ellas solo lo
que baje la fricción de mantenerlo. Reafirma el objetivo en una línea antes de cada edición
grande.

Tensión conocida que debes resolver y documentar: `erp.act_activo.costo_acumulado` es
`not null default 0`, pero la doctrina dice que `no_medido` **no es cero**. El export no puede
convertir un hueco en un 0 que parezca medición: decide cómo lo expresas (p. ej. costo en
`act_costo` con `fuente`, y `costo_acumulado` solo con lo medido, declarado) y escríbelo en el SDD.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación: todo se demuestra con output pegado.

1. **Primero, la spec y el diseño.** `.claude/specs/014-inventario-de-activos/` con `spec.md`
   (el QUÉ en EARS, fuera de alcance, impacto sobre terceros C4), `plan.md` (fases con gate;
   hace el papel del PRP) y `tareas.md`, más `docs/SDD-inventario-de-activos.md` (decisiones y
   su porqué). `npm run verifica:specs` en verde, pegado.
2. **Cobertura**: el output del detector muestra cada `tools/*` y cada activo real del repo con
   asiento, con cero NUEVO sin resolver (resolver puede ser `sin-asignar` declarado).
3. **Prueba de dientes**: en una rama de prueba creas una herramienta ficticia en `tools/`; el
   gate falla en ROJO nombrándola; la quitas y vuelve a verde. Pegas ambos outputs. Haces lo
   mismo con un HUÉRFANO (asiento de algo que borras).
4. **Export**: las filas generadas se validan contra las columnas y los `check` de
   `005_activos.sql` (por ejemplo, levantando esa migración en un Postgres local desechable o con
   un validador derivado del SQL, no de memoria). Pegas el output.
5. **Costeo honesto**: tabla por activo con los 4 componentes y su `fuente`; ningún cero sin
   medición detrás.
6. **Repo público limpio**: el diff muestra que ningún costo ni clasificación estratégica quedó
   commiteado, y que el export sale a una ruta fuera de git (o ignorada) al generarse.
7. **La arista**: el PR en `hermes-os-a2a` abierto sin merge, con el `--dry-run` del detector
   leyendo el índice del template (output pegado, o el bloqueo exacto si necesita credenciales
   de BD que aquí no hay).
8. **`npm run validate` completo en verde**, output pegado.
9. **Autocrítica**: lista de las formas en que esto podría estar mal o incompleto, cada una
   resuelta o declarada como pendiente con su razón.

## COMANDO DE VALIDACION

Infraestructura conocida:

```
npm run <tu-gate-nuevo>     # decláralo en el primer checkpoint; córrelo tras cada cambio grande
npm run verifica:specs      # tras escribir la spec 014
npm run validate            # al cierre, el gate completo con tu gate dentro
```

Pega el output de cada corrida.

## RESTRICCIONES REALES

- **Proponer, no catalogar**: nada escribe en el ERP ni en ningún Supabase. Dar de alta en
  `erp.act_activo` es trabajo del cosechador o de una persona, con sus compuertas.
- **Sin `service_role`** en ningún camino (C7).
- **Los ejes son PROPUESTA**: D+I y defensibilidad las ratifica el laboratorio (humano). Ningún
  script marca `ratificada`.
- **El repo es PÚBLICO**: según §1.7, los costos reales (`token_usage`) son un activo defendible, y
  la clasificación de defensibilidad es el mapa del foso. **Ninguno de los dos se commitea.** Al
  repo entra la identidad del activo (qué, dónde, versión, clase); el costo y la clasificación se
  calculan al exportar y viajan al ERP.
- **Nada de contenido de terceros** en el índice ni en el export (C4): el inventario habla de
  activos, no de los datos que procesan.
- **CDC (C1)** si tocas un skill, `settings.json`, `AGENTS.md` o una plantilla: entrada en
  `BITACORA-CDC.md` con aprobación pendiente, y `npm run regresion` en verde. `AGENTS.md` se toca
  una sola vez, al final, porque cada cambio invalida la caché de prefijo.
- **El PR en `hermes-os-a2a` no se mergea**: cruzar al repo del ERP es gate humano.

## RED DE SEGURIDAD

Si tras 40 turnos no converges, detente y reporta qué puntos de HECHO están en verde y cuáles
no. Y un límite que no es de turnos: **si el único camino para avanzar exige escribir en el ERP,
commitear costos o clasificación en el repo público, o autoaprobar un CDC, para y repórtalo.**
No hay atajo ahí.
