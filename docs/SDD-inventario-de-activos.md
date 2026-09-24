# SDD — Inventario de activos del template

> Diseño de la spec [014](../.claude/specs/014-inventario-de-activos/spec.md). Origen:
> [`GOAL-inventario-de-activos.md`](GOAL-inventario-de-activos.md). Fuentes de doctrina (repo
> `hermes-os-a2a`, privado): `businessos/departamentos/white-label.md` §5,
> `businessos/erp/ERP-MAESTRO.md` §1.6, §1.7 y ERP-4 §4B, `businessos/activos/CATALOGO.md`,
> `businessos/detector-swm-act.py` y `businessos/erp/migrations/005_activos.sql`.

## 1. La idea en una frase

El template no lleva un inventario propio: se convierte en **una fuente más** del módulo `act`,
con la misma forma que las fuentes que el detector `swm-act` ya lee (el índice de CLIs viaja en el
repo; el detector compara; el alta la hace otro).

```
repo real ──descubre──► unidades ──cubre──► inventario/activos.json (identidad, en git)
                                   │
                                   ├─► verifica:inventario   (gate: NUEVO/HUÉRFANO/AMBIGUO → rojo)
                                   ├─► INVENTARIO.md         (vista, sin costos)
                                   └─► inventario:exporta ──► inventario/salida/ (ignorado por git)
                                            + trayectorias      ├─ activos.jsonl  (formato del catálogo)
                                            + git log           ├─ erp-act.sql    (act_activo/version/costo)
                                                                └─ detector.json  (lo lee swm-act)
```

## 2. Decisiones

### 2.1 Identidad en git; costo y clasificación, no
El repo es público. §1.7 nombra los costos reales por operación como activo defendible y la
defensibilidad decide qué se protege. El índice lleva solo identidad (qué, dónde, clase, estado,
responsable, origen). El gate **rechaza** los campos de costo, `eje_dei`, `defensibilidad` y
`clasificacion` si alguien los añade al índice: la regla está en código, no en disciplina.

### 2.2 Unidades y activos son cosas distintas
- **Unidad**: algo que existe en el repo y que una fuente declarada descubre (una carpeta de
  `tools/`, una feature, una skill, un script de `scripts/`, una migración, un CLI impreso).
- **Activo**: la fila del inventario. Cubre una o más unidades con patrones (`cubre`).

Así una skill nueva cae en el activo «catálogo de skills» y no hace ruido, mientras que una carpeta
nueva en `tools/` no la cubre nadie y el gate se pone rojo. Las fuentes viven en el mismo JSON:
añadir una es un cambio de datos. **Cada unidad la cubre exactamente un activo** (AMBIGUO si dos):
sin eso el costo de un commit se contaría dos veces.

### 2.3 Granularidad
Una fila por herramienta y por feature (son lo que se instala o se vende). Agrupados: skills
(precedente A2A-013), specs+PRPs+SDD+GOAL, gates de gobernanza, imprenta, trayectorias, doctrina,
design systems, infraestructura de despliegue. Es un cambio de datos si el laboratorio lo quiere
más fino (duda abierta de la spec).

### 2.4 CLIs impresos: un escritor por origen
El manifiesto de la imprenta declara CLIs `cli-impreso`, pero el ERP ya los cataloga desde
`cli-library-index.json` con ubicación `cli:<slug>`. Aquí se cubren con un activo `externo: true`
de ubicación `cli:<slug>`: cuentan como cubiertos y **no se exportan**. Los estados `mcp` y
`cli-oficial` son código de terceros y no se descubren (el catálogo los excluye por definición).

### 2.5 Identificadores
El template no puede acuñar `ACT-NNNN` (lo hace el ERP) ni `A2A-NNN` (lo hace el catálogo). Usa
`TPL-<slug>`, que viaja como `ref_catalogo` (único por cliente en `act_activo`). La ubicación se
exporta con prefijo `template/` para que no choque con las del businessos en el catálogo, que el
detector indexa por ubicación.

### 2.6 Hash y CAMBIADO
El hash de un activo es sha256 sobre (ruta, sha256 del contenido) de los archivos rastreados por
git bajo sus unidades, en orden. No se guarda en el índice: si lo hiciera, cada commit tendría que
tocar el índice. CAMBIADO se calcula contra el último export de la máquina
(`inventario/salida/detector.json`) y en el ERP contra `hash_vigente`; es informativo, no rojo,
porque la versión nueva la registra `act_version`.

### 2.7 Costeo: medir, no estimar
| Componente del catálogo | Fuente en el template | Si no hay dato |
|---|---|---|
| Construcción | Trayectorias `fabrica` (tokens y `costoUsd` por sesión) repartidas entre los activos cuyos archivos se commitearon dentro de la ventana de la sesión, en proporción a los archivos tocados | `no_medido`, con la cobertura: commits del activo dentro de una sesión registrada / total |
| Operación mensual | Trayectorias `aplicacion` y `herramientas` por feature o herramienta, prorrateadas por mes | `no_medido` (corre en la infra del consumidor) |
| Réplica | — | `no_estimado`: no hay dogfood de instalación medido |
| Reposición | — | `no_estimado`: no hay reconstrucción medida |
| Horas humanas | — | `no_medido`: se declaran en el ERP (`cosechar-activos.py ajustar`) |

La atribución por ventana es un **proxy declarado**: una sesión que trabajó en otro repo a la vez
puede sumar aquí. Se dice en la fuente, junto con la cobertura.

### 2.8 El `0` de `costo_acumulado`
`erp.act_activo.costo_acumulado` es `not null default 0`, pero lo mantiene un trigger desde
`act_costo`. El export **nunca lo escribe** y solo inserta filas de `act_costo` cuando hay un monto
medido en USD (`monto` es obligatorio). Un activo sin mediciones queda en 0 en la BD por
construcción del ERP, y el ledger `activos.jsonl`, que es el que lee el humano, dice `no_medido`.
Las filas con tokens pero sin USD viajan en el ledger (`tokens`, `usd: null`) para que el ERP las
precie con su `token_usage`.

### 2.9 Clasificación propuesta
- **D+I**: `desarrollo` si el activo tiene origen en una spec, un PRP o un GOAL (hay beneficio
  identificable declarado); `investigacion` si su estado es `blueprint` sin origen o se declara
  experimento. Siempre `propuesta`.
- **Defensibilidad**: `reemplazable` para todo lo del template. Heurística D-12 por ubicación: un
  repo público no puede sostener secreto industrial (no hay «medidas razonables» demostrables), y
  un competidor con Claude Code lo clona. La nota lo explica en cada fila.

### 2.10 Export fuera de git
`inventario/salida/` está en `.gitignore`. El SQL usa la variable psql `:'cliente_id'`, así el UUID
del tenant de la casa no se escribe en este repo.

### 2.11 Arista hacia `swm-act`
El detector del ERP llama `node <template>/scripts/inventario/detecta.mjs --json` si
`REPO_TEMPLATE` está definido, y compara `template/<ubicación>` con el catálogo. No reimplementa
la cobertura en Python: una sola implementación. Se añade `--catalogo-json` para probarlo sin BD.

## 3. Descartado

- **Hash en el índice**: obliga a tocar el índice en cada commit; ruido y conflictos de merge.
- **Una fila por skill/script**: 60+ filas cuyo valor es el conjunto (A2A-013 ya lo decidió así).
- **Frontmatter en cada `README.md`**: disperso; el detector necesitaría leer N archivos y un
  activo agrupado no tiene README propio.
- **Escribir el export en `activos/activos.jsonl` del businessos**: cruzaría repos escribiendo;
  el alta es del cosechador o del laboratorio.
- **Validar el export dentro de `validate`**: necesita Docker y la migración del repo privado; el
  gate corre sin red ni dependencias. Las pruebas sí fijan los valores permitidos de los `check`.

## 4. Operación

```
npm run verifica:inventario            # gate (dentro de validate)
npm run inventario:vista               # regenera INVENTARIO.md tras tocar el índice
npm run inventario:exporta             # costeo + ledger + SQL en inventario/salida/
npm run inventario:valida-erp -- --migracion <ruta a 005_activos.sql>
```

Alta de un activo nuevo: añadir su fila en `inventario/activos.json`, `npm run inventario:vista`,
y el gate vuelve a verde. La clasificación y el costo no se tocan a mano en ningún sitio.

## 5. Límites conocidos (autocrítica del 2026-09-24)

Resueltos en la misma sesión:
- **Hash inestable entre máquinas**: incluía archivos no rastreados, así que el servidor vería un
  CAMBIADO falso. Ahora el hash solo mira `git ls-files`; los no rastreados siguen contando para
  descubrir un NUEVO.
- **Deploy sin gate de inventario**: `predeploy` (sin sello) no lo corría, y desplegar es entregar.
  Ahora lo corre.
- **Operación sin dueño silenciosa**: las trayectorias de la app de la feature `chat` no las
  reclama ningún activo; el reporte lo dice en vez de tirarlas.
- **AMBIGUO ruidoso**: marcaba además HUÉRFANOS a sus dueños. Lo cazaron las pruebas.

Declarados, sin arreglo desde aquí:
- **La atribución es un proxy**: reparte por archivos tocados, así que favorece a los activos con
  muchos archivos, y una sesión de otro repo en la misma ventana sumaría aquí (la trayectoria no
  guarda el directorio). Cada fuente lo dice y marca PARCIAL.
- **`git log --all`** cuenta también el trabajo de ramas sin mergear: fue costo real de construcción.
- **El export es alta inicial**: con `ref_catalogo` ya dado de alta no inserta versiones ni costos
  nuevos. El costo incremental y las versiones son del cosechador y de `swm-act` (CAMBIADO).
- **`version_vigente` es `template@<fecha>`**, no la versión semver de cada herramienta.
- **El árbol de decisiones de `AGENTS.md` no enruta al inventario**. Tocarlo es CDC (C1): el gate
  y el empaquetador ya cubren el «sin asiento no hay entrega».
