# PRP-004: El ERP se muda al template, que pasa a ser el monorepo privado

> **Estado**: APROBADO (2026-09-24, el laboratorio)
> **Fecha**: 2026-09-24
> **Proyecto**: template (fábrica) · origen: `lisagomez/hermes-os-a2a`
> **Spec**: sin spec propia. El QUÉ se acuerda aquí; hereda y **modifica** la spec 014
> (`.claude/specs/014-inventario-de-activos/`): el ERP entra como fuente interna del inventario
> y la arista hacia `hermes-os-a2a` (PR #316) deja de hacer falta.
> **CDC aplicable**: **sí, acotado a la Fase 7** (anotar en `AGENTS.md` que el ERP vive aquí
> cambia el prompt de todos los agentes → control C1, diff + `npm run regresion` + aprobación +
> `BITACORA-CDC.md`). Las fases 0-6 no tocan modelo, skills, prompts, plantillas ni `settings.json`.

---

## Objetivo

Que el ERP de la fábrica —`businessos/erp/` completo y el módulo `act` (`cosechar-activos.py`,
`detector-swm-act.py`)— viva en este repo, ya **privado**, como una pieza más del monorepo donde
se controlan el ERP, las apps, las herramientas y el laboratorio antes de empaquetar para
producción; y que el inventario de la spec 014 lo cubra como fuente interna, sin cruzar a otro repo.
Trío, CRM y verticales se quedan en `hermes-os-a2a`.

## Por Qué

| Problema | Solución |
|----------|----------|
| El ERP (esquema, reglas contables, doctrina D+I y de defensibilidad, tenant de la casa) vive en un repo **público**. §1.7 del maestro dice que eso es el mapa del foso. | Vive en un repo privado; lo público deja de crecer. |
| El inventario del template tiene que cruzar a otro repo para existir en el ERP (PR #316): dos lógicas de cobertura, dos repos, un gate humano de por medio. | Una sola lógica —la del template— y el ERP la lee en casa. El PR #316 se cierra sin merge. |
| Las piezas reutilizables (tools/) y el ERP que las cataloga y costea evolucionan en repos distintos: un cambio de esquema en `005_activos.sql` rompe el export del template sin que ningún gate lo vea. | `inventario:valida-erp` corre contra las migraciones del mismo árbol, sin `--migraciones` externo. |
| La spec 014 tuvo que diseñar alrededor de «el repo es público» (campos prohibidos, defensibilidad siempre `reemplazable`). | Privado cambia la premisa; esta PRP decide qué se relaja y qué no (ver Gotchas). |

**Valor de negocio**: el ERP y la fábrica que lo alimenta se controlan en un solo sitio privado;
lo que se entrega a producción sale empaquetado desde aquí, con asiento en el inventario (white-label §5).

## Qué

### Criterios de Éxito

- [ ] `gh repo view lisagomez/template --json isPrivate` devuelve `true` **antes** del primer
      commit que contenga un archivo del ERP, y el commit de importación lo registra como evidencia.
- [ ] `erp/` existe en el template con `ERP-MAESTRO.md`, `integracion-arkham.md`, `reglas/`,
      `migrations/001..005` y `bin/{cosechar-activos,detector-swm-act}.py`, con su historial de git
      importado (no una copia plana), y **byte a byte iguales** al `origin/master` de `hermes-os-a2a`
      en el momento del corte (sha256 por archivo, registrado).
- [ ] `npm run verifica:inventario` en verde con el ERP cubierto: cero NUEVO, HUÉRFANO o AMBIGUO.
- [ ] `npm run inventario:valida-erp` corre **sin** `--migraciones`: toma `erp/migrations/` del propio
      árbol, y el SQL exportado carga sobre 001-005 en Postgres desechable.
- [ ] `detector-swm-act.py --dry-run` corre desde el template y reporta el catálogo real **sin**
      HUÉRFANO/NUEVO espurios por el cambio de ruta (las ubicaciones `businessos/erp/…` se
      re-ubican, no se dan de baja y de alta: folios y `costo_acumulado` intactos).
- [ ] En `hermes-os-a2a`: PR que retira `businessos/erp/` y los dos scripts, deja un puntero y
      deja de invocarlos desde `weekly-jobs.sh`/cron; el PR #316 cerrado sin merge con enlace a este PRP.
- [ ] El servidor corre el detector semanal y el cosechador desde un clon del template con
      **llave de despliegue de solo lectura**, y la primera corrida post-corte está en `host-jobs.log`
      con `rc=0`.
- [ ] `npm run validate` en verde.

### Comportamiento Esperado

1. La dueña cambia la visibilidad del template a privado. El agente lo comprueba con `gh` y no
   avanza si no ve `isPrivate: true`.
2. Se importan las rutas del ERP de `hermes-os-a2a` con su historial a `erp/`, en una rama.
   Antes de mergear se audita ese historial importado en busca de secretos.
3. El índice `inventario/activos.json` gana las fuentes y los activos del ERP; el detector del
   template los cubre como cualquier otra unidad.
4. Los scripts Python leen su ruta del ERP desde el nuevo sitio; el detector deja de necesitar
   `REPO_TEMPLATE` porque el template **es** su repo.
5. Con gate humano: se re-ubican en `erp.act_activo` las filas `businessos/erp/…` → `template/erp/…`
   y el servidor pasa a correr los jobs desde el template.
6. `hermes-os-a2a` retira lo migrado y deja un puntero. Nada del trío ni del CRM cambia de sitio.

---

## Contexto

### Referencias

- `hermes-os-a2a` (`~/code/a2aboths`, `origin/master` 97d9f9e): `businessos/erp/` (9 archivos,
  3.751 líneas: `ERP-MAESTRO.md` 2.453, `migrations/001..005` + README, `reglas/act-contable.md`,
  `integracion-arkham.md`), `businessos/cosechar-activos.py` (442), `businessos/detector-swm-act.py` (211).
- PR #316 de `hermes-os-a2a` (`feat/swm-act-fuente-template`, abierto): la arista que este PRP
  vuelve innecesaria.
- Spec 014 y `docs/SDD-inventario-de-activos.md`: índice, detector, costeo, export, validador.
- `scripts/inventario/{nucleo,detecta,exporta,costeo,vista,valida-erp}.mjs`,
  `inventario/activos.json` (36 fuentes, patrón `tools/*/` etc.).
- `.claude/gobernanza/GOBERNANZA.md` §8 (C7), plantillas `modelo-amenazas.md` y `aisia.md`.
- `docs/DEPLOY-HETZNER.md`, `docs/FASE0-INFRAESTRUCTURA.md` §9.1 (inventario de respaldo).

**Acoplamientos medidos** que se quedan en `hermes-os-a2a` y apuntan al ERP (hay que dejarles puntero,
no moverlos): `weekly-jobs.sh` (invoca el detector), cron del cosechador (cada 10 min),
`exportar-polizas.py` (cita `erp/reglas/act-contable.md`), `ingest-token-usage.py`,
`cosechar-prediscovery.py`, `trio-contrato/contrato.py`, `tenancy/orden.txt`,
`.github/workflows/tenencia.yml`, `migrations/README.md`, `frontends/meeting-copilot/src/features/activos/types.ts`,
su `CLAUDE.md` y su `.claude/memory/project/erp-modulo-act.md`.

### Arquitectura Propuesta (monorepo)

```
template/                 (privado)
├── src/                  apps (Next.js) — sin cambios
├── tools/                herramientas empaquetables — sin cambios
├── erp/                  NUEVO: el ERP es un hermano de tools/, no una herramienta
│   ├── ERP-MAESTRO.md
│   ├── integracion-arkham.md
│   ├── reglas/
│   ├── migrations/       001..005 (+ README) — la fuente de verdad del esquema `erp`
│   └── bin/              cosechar-activos.py, detector-swm-act.py (el detector ya
│                         escanea `erp/bin`: la ruta encaja con su DIRS_ERP)
├── inventario/           el índice gana fuentes `erp/…`
└── scripts/inventario/   valida-erp toma `erp/migrations` por defecto
```

Decisiones clave:

- **`erp/` en la raíz y no en `tools/`**: `tools/` es para lo que se empaqueta y se instala en otros
  proyectos (`docs/EMPAQUETAR-HERRAMIENTA.md`). El ERP es un sistema que opera la casa; meterlo a
  `tools/` le exigiría el contrato de empaquetado y una versión npm que nadie consume.
- **Importar con historial** (`git filter-repo --path businessos/erp --path …` sobre un clon
  desechable + `--path-rename businessos/erp:erp`, luego merge con historias no relacionadas). El
  costeo de la spec 014 atribuye por commits (RF-11): una copia plana dejaría al ERP con un solo commit
  y costo de construcción `no_medido`, y perdería el `blame` de las decisiones D-07…D-31.
- **Python se queda en Python**. No se reescriben a Node: el gate de `validate` no ejecuta los `.py`
  (necesitan BD y Slack); solo se inventarían y se prueban en seco. Reescribir es otro PRP.
- **Una sola lógica de cobertura**: el detector del template es la fuente; `detector-swm-act.py`
  consume su `--json` en local (lo que el PR #316 hacía cruzando repos) y conserva su escaneo de
  CLIs (`cli-library-index.json` sigue siendo de `hermes-os-a2a`: un escritor por origen).
- **El cosechador sigue leyendo el trío**: su fuente es la tabla `tareas` y `token_usage` del
  Supabase compartido y `TRIO_REPO_DIR`. Se muda el código, no la frontera: sigue siendo el adaptador
  trío → ERP y queda **declarado** como job de plataforma bajo C7 (ver Gobernanza).

### Modelo de Datos

Sin tablas nuevas. Cambios de **datos** en producción, ambos con gate humano:

```sql
-- Re-ubicación (no baja + alta): conserva folio, costo_acumulado y versiones.
begin;
set local role rol_exe_fin;
set local app.cliente_id = '<ERP_CLIENTE_CASA>';
update erp.act_activo
   set ubicacion = 'template/' || substr(ubicacion, length('businessos/') + 1)
 where ubicacion like 'businessos/erp/%';
-- + fila en sis_bitacora con traza_id (NOT NULL): la re-ubicación queda auditada
commit;
```

Se valida primero en el Postgres desechable de `inventario:valida-erp`. El inventario de respaldo
(`FASE0-INFRAESTRUCTURA.md` §9.1) no cambia: el esquema `erp` ya está en el Supabase compartido; lo
que cambia es de qué repo se restaura el DDL, y eso se anota ahí.

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*

- **Activos que toca**: (1) la doctrina del ERP —defensibilidad, D+I, política contable, costos
  reales— que §1.7 declara activo defendible; (2) identificadores de producción que viven en los
  archivos (`ref` del Supabase compartido, UUID del tenant de la casa, canal de Slack); (3) la
  cadena de escritura al ERP (`cli_fin`/`rol_exe_fin`) y la llave `service_role` que usa el
  cosechador para leer `tareas`; (4) la integridad del catálogo `act` (folios, costo acumulado).
- **Fronteras que cruza**: `hermes-os-a2a` (público) → template (privado): el historial importado es
  dato no confiable hasta auditarlo. Servidor ← GitHub: el clon del template en producción necesita
  una credencial nueva. Template → BD de producción: la re-ubicación y el corte de jobs.
- **Atacante relevante**:
  - **O5 cadena de suministro**: el historial importado puede traer un secreto que alguna vez se
    commiteó en esas rutas; al mergearlo, entra al árbol de la fábrica.
  - **O6 compromiso de servicio**: la llave de despliegue del servidor. Si es de escritura o de
    cuenta, comprometer el servidor da escritura sobre la fábrica entera (skills, gates, `AGENTS.md`).
  - **O3 fatiga de aprobación**: este PRP pide varias aprobaciones seguidas (visibilidad, merge de
    importación, re-ubicación, corte de cron, retiro en hermes). Por eso cada una va en su fase con su
    evidencia, no en un solo «sí» al final.
  - **Premisa rota por error**: el gate «privado antes de subir» es de configuración, y una
    configuración se revierte sin síntoma (alguien vuelve a hacerlo público).
- **Controles**:
  - Gate de visibilidad comprobado con `gh` (no con la palabra de nadie) antes del push de la rama de
    importación; y un chequeo `scripts/verifica-privado.mjs` en `predeploy` y en el hook de push que
    falla si el repo deja de ser privado. **No en `validate`**: `validate` es sin red por diseño.
  - `npm run audita:secretos` sobre **todo el historial importado** (no solo HEAD), en la rama, antes
    del merge.
  - Llave de despliegue **de solo lectura**, por repo, en el servidor; nunca un PAT de la cuenta.
  - C7: el cosechador se declara como job de plataforma que usa `service_role` para **leer** `tareas`
    y hacer el CAS `aprobada → concretada`; su escritura en `erp` sigue siendo con `cli_fin`, sin
    `service_role`. La declaración va en `GOBERNANZA.md` §8.
  - **Brecha abierta a propósito**: lo que ya se publicó en `hermes-os-a2a` sigue público en su
    historial, cachés y clones ajenos. Este PRP **no** la cierra (ver AISIA y Dudas).

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*

- **Partes afectadas**: la dueña y el laboratorio (operan el ERP); el contador, que consume la
  clasificación D+I y la política contable desde el ERP; el cliente de la casa y los tenants futuros
  del esquema `erp` (el ERP guarda facturas, cobros y clientes); quien lea `hermes-os-a2a` esperando
  encontrar ahí el ERP.
- **Daño posible con el sistema operando bien**:
  - Una re-ubicación mal hecha genera HUÉRFANO + NUEVO: el cosechador daría de alta activos
    duplicados con costo en cero, y el costo por activo —lo que alimenta pólizas y capitalización
    (D-07)— se partiría en dos filas. Daño contable, no de seguridad.
  - Un corte de cron sin solapamiento deja semanas sin detector ni cosecha: activos vendibles del
    trío sin asiento, que white-label §5 convierte en «no hay entrega».
  - La falsa sensación de privacidad: tratar la doctrina como secreta desde hoy cuando ya circuló.
    Si se usara «es privado» para reclamar secreto industrial sobre lo ya publicado, el reclamo no
    se sostiene.
- **Reversibilidad**: la importación y el retiro en hermes son reversibles por git. La re-ubicación
  es un `update` reversible con el `update` inverso (y queda en `sis_bitacora`). El corte de cron se
  revierte restaurando la línea. **Lo único irreversible es lo ya publicado.**
- **Decisión**: **mitigar**. Re-ubicación en seco primero y contra el Postgres desechable; corte de
  jobs con una corrida en paralelo en `--dry-run` antes de apagar la vieja; la premisa «privado» no
  relaja por sí sola los controles de la spec 014 (ver Gotchas).

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada una (bucle agéntico).

### Fase 0: Gate de visibilidad — ✅ CERRADA 2026-09-24
> `gh api -X PATCH repos/lisagomez/template -F private=true` → `private: true`; `verifica:privado` en verde
> (el primer intento dio 200 unos segundos: la API sin token tarda en reflejar el cambio).
**Objetivo**: el template es privado y queda un chequeo que lo sostiene. Acción humana: la dueña
cambia la visibilidad. El agente comprueba y añade `verifica-privado` a `predeploy` y al hook de push.
**Validación**: `gh repo view --json isPrivate` → `true`, registrado; el chequeo falla en un
simulacro (repo de prueba público o respuesta simulada) y pasa en el real. **Nada del ERP se ha
subido todavía.**

### Fase 1: Importación con historial y auditoría — ✅ CERRADA 2026-09-24
> Corte `hermes-os-a2a@97d9f9e`; git-filter-repo 2.47.0; 11 archivos sha256 idénticos; 11 commits
> de historia; `audita:secretos` limpio (2027 blobs, 449 commits). Merge aprobado por el laboratorio.
**Objetivo**: rama con `erp/` (maestro, reglas, migraciones, `bin/` con los dos scripts) y su
historial reescrito a la nueva ruta, desde `origin/master` de `hermes-os-a2a` en un commit fijo.
**Validación**: sha256 por archivo igual al del commit de origen; `audita:secretos` sobre el
historial importado en verde; `git log --follow` muestra los commits de origen. Gate humano: merge.

### Fase 2: Scripts en su nuevo sitio (en seco) — ✅ CERRADA 2026-09-24
> Detector: escanea `erp/` del monorepo (`template/erp/…`), usa el detector del template sin
> `REPO_TEMPLATE`, índice de CLIs solo con `REPO_BUSINESSOS`; trae los arreglos de la revisión del
> #316. Ensayo: catálogo de hoy → 9 NUEVO + 9 `REUBICAR` (tipo nuevo: la fila vieja ya no queda
> ignorada en silencio); catálogo re-ubicado → **0** hallazgos del ERP. Cazados y corregidos:
> `__pycache__` escaneado como activo, y la fuente template marcando HUÉRFANOS los `template/erp/…`.
**Objetivo**: `detector-swm-act.py` escanea `erp/` del template y consume el `--json` del detector
del template (lo que hacía el PR #316, sin cruzar repos); el cosechador lee su configuración sin
rutas de `businessos/`. Sin tocar producción.
**Validación**: `detector-swm-act.py --dry-run --catalogo-json <copia del catálogo>` reproduce los
hallazgos esperados (NUEVO/CAMBIADO/HUÉRFANO sembrados) y, con el catálogo real re-ubicado en la
copia, **cero** hallazgos espurios por la ruta. `python3 -m py_compile` en verde.

### Fase 3: El inventario cubre el ERP — ✅ CERRADA 2026-09-24
> Fuentes `erp/*/` y `erp/*.md`; activo `TPL-erp` externo (lo cataloga swm-act archivo por
> archivo). 176 unidades, 0 hallazgos. `inventario:valida-erp` sin argumentos sobre
> `erp/migrations/`: 23 altas, 0 en la segunda carga, 7/7. Spec 014 (RF-14, RF-16) y SDD §2.11 al día.
**Objetivo**: fuentes y activos `erp/…` en `inventario/activos.json`; `valida-erp` toma
`erp/migrations/` por defecto; la vista `INVENTARIO.md` al día; la spec 014 y el SDD actualizados
(el ERP es fuente interna, la arista externa se retira).
**Validación**: `verifica:inventario` y `prueba:inventario` en verde; `inventario:valida-erp` sin
argumentos carga el export sobre 001-005; `verifica:specs` en verde.

### Fase 4: Re-ubicación en el catálogo de producción
**Objetivo**: las filas `businessos/erp/…` de `erp.act_activo` pasan a `template/erp/…` con su
traza en `sis_bitacora`. Gate humano: la dueña aprueba viendo el diff de filas (antes/después).
**Validación**: ensayo en Postgres desechable con el catálogo copiado; en producción, mismo número
de folios, mismo `costo_acumulado` total antes y después, y el detector en `--dry-run` sin HUÉRFANOS.

### Fase 5: Corte de los jobs en el servidor
**Objetivo**: clon del template en el servidor con llave de despliegue de solo lectura;
`weekly-jobs.sh` y el cron del cosechador apuntan a `erp/bin/`. Una semana (o una corrida manual
acordada) en paralelo: el nuevo en `--dry-run`, el viejo operando; luego se apaga el viejo.
Gate humano: el corte.
**Validación**: primera corrida real en `host-jobs.log` con `rc=0` y mismos hallazgos que la
corrida en paralelo; `.env` del servidor confirmado por presencia (enmascarado), nunca impreso.

### Fase 6: Retiro en `hermes-os-a2a`
**Objetivo**: PR que borra `businessos/erp/` y los dos scripts, deja `businessos/erp/README.md` como
puntero («vive en el monorepo privado de la fábrica»), actualiza los acoplamientos listados en
Contexto y cierra el PR #316 sin merge con enlace a este PRP. Trío, CRM y verticales intactos.
**Validación**: su CI (`tenencia.yml`) en verde; `grep` de `businessos/erp/` sin referencias vivas
salvo el puntero. Gate humano: merge en el otro repo.

### Fase 7: Declararlo en la fábrica (CDC)
**Objetivo**: una línea en el decision tree de `AGENTS.md` («el ERP vive en `erp/`; esquema,
reglas y act») + `GEMINI.md` regenerado + declaración C7 del cosechador en `GOBERNANZA.md` §8 +
memoria del proyecto actualizada (la regla «lo nuevo nace en `tools/`» gana su excepción: el ERP).
**Validación**: diff enseñado antes de pedir el sí; `npm run regresion` y `--trampa` en verde;
entrada en `BITACORA-CDC.md`; `verify:gobernanza` en verde.

### Fase 8: Validación final
**Objetivo**: todo el sistema en verde end-to-end.
**Validación**:
- [ ] `npm run validate` pasa
- [ ] Criterios de éxito cumplidos, cada uno con su evidencia
- [ ] (Sin UI: no aplica screenshot de Playwright)

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.

---

## Gotchas

- [ ] **Mudar no es despublicar.** `hermes-os-a2a` es público: el maestro, la doctrina de
      defensibilidad, el `ref` del Supabase compartido y el UUID del tenant ya están en su historial.
      Hacer privado el template protege lo que se escriba **de aquí en adelante**. Purgar el historial
      de hermes (filter-repo + force-push) o rotar identificadores es otra decisión, humana, fuera de
      este PRP.
- [ ] **Privado no apaga los controles de la spec 014.** Las herramientas de `tools/` se empaquetan y
      salen a otros proyectos; el índice sigue sin costos ni clasificación (RF-3) y el export sigue
      fuera de git. Lo que sí puede revisarse es la heurística D-12 (`reemplazable` «por vivir en un
      repo público»): con repo privado ya hay una medida razonable demostrable. Eso es una decisión
      del laboratorio, no un efecto automático del cambio de visibilidad.
- [ ] **Las trayectorias commiteadas** (`trayectorias/datos/`, con `costoUsd` por sesión) y la duda
      abierta de la spec 014 sobre ellas: con repo privado la pregunta cambia de respuesta, pero lo
      que ya se publicó sigue publicado.
- [ ] **Un repo que pasa a privado**: los forks públicos se quedarían públicos (hoy hay 0, medido);
      en plan gratuito se pierden protecciones de rama para privados (hoy `main` no tiene ninguna,
      medido); cualquier clon anónimo (servidor, CI, otro proyecto) deja de funcionar y necesita
      credencial.
- [ ] **La re-ubicación, no baja + alta.** El detector compara por `ubicacion`: mover el archivo sin
      re-ubicar las filas produce HUÉRFANO de lo viejo y NUEVO de lo nuevo, y el cosechador daría de
      alta duplicados con `costo_acumulado = 0`.
- [ ] **El historial importado trae todo** lo que alguna vez vivió en esas rutas: auditar antes de
      mergear, no después.
- [ ] **`ERP-MAESTRO.md` tiene 2.453 líneas**: vive fuera de `.claude/` para no entrar al presupuesto
      de contexto (`mide:contexto`), y no se carga por `rules/`.
- [ ] **`sis_bitacora.traza_id` es `NOT NULL`**: la re-ubicación sin traza falla, y está bien que falle.
- [ ] **Membresía `grant rol_exe_fin … to postgres`** es estado de cluster, no vive en ningún `.sql`:
      el ensayo en desechable tiene que otorgarla igual que el README de migraciones.

## Anti-Patrones

- NO subir un solo archivo del ERP antes de ver `isPrivate: true`
- NO copiar plano (se pierden historial y costo de construcción)
- NO dar de baja y de alta lo que solo cambió de ruta
- NO usar un PAT de la cuenta en el servidor: llave de despliegue de solo lectura
- NO reimplementar la cobertura en Python: una sola lógica, la del template
- NO mover trío, CRM, verticales ni `cli-library-index.json`
- NO usar `service_role` para escribir en `erp` (C7): el cosechador escribe con `cli_fin`
- NO editar `AGENTS.md` sin CDC (C1)

---

## Dudas abiertas (decide el laboratorio antes de aprobar)

- ~~**`businessos/activos/`** y `cosecha-inicial-activos.py`~~ — **DECIDIDO (2026-09-24): se quedan
  en hermes** como histórico del ledger ya migrado a la BD. No viajan.
- **Qué hacer con lo ya público en `hermes-os-a2a`**: dejarlo, purgar historial, o rotar lo rotable
  (canal de Slack, credenciales si alguna apareciera en la auditoría de la Fase 1). Fuera de alcance
  aquí; conviene decidirlo antes de la Fase 6, porque el PR de retiro es el momento natural.
- **D-12 con repo privado**: ¿el laboratorio quiere que la heurística proponga algo distinto de
  `reemplazable` para lo que vive en el template? Si sí, es un cambio de datos/código en `costeo.mjs`
  y de la spec 014.

---

*PRP aprobado el 2026-09-24. Dudas 2 y 3 siguen abiertas: la 2 bloquea la Fase 6, la 3 no bloquea nada.*
