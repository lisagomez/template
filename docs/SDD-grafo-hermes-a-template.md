# El grafo de Hermes frente a la spec 004 — expediente de decisión

> **Estado**: ANÁLISIS CERRADO · recomendación **firmada: D** (Fase 0 de PRP-005, 2026-09-26, ver §9) · **EJECUTADA** el 2026-09-27 (PRP-005, 9 fases; autocrítica en el PRP) · **Fecha**: 2026-09-26
> **Ámbito**: el motor de reglas «grafo regulatorio» de `lisagomez/hermes-os-a2a`, medido contra la
> spec `.claude/specs/004-grafo-de-conocimiento/` de este template.
> **Corte medido**: `hermes-os-a2a@97d9f9e` (`master`, 2026-09-06), el mismo corte del que salió el ERP
> en PRP-004. Ninguna de las 9 ramas remotas de Hermes trae commits del grafo sin mezclar.
> **Propuesta que sale de aquí**: `.claude/PRPs/PRP-005-grafo-de-conocimiento-al-golden-path.md`
> (APROBADO el 2026-09-26, con la Fase 0 cerrada).

---

## 0. La respuesta en cinco líneas

1. **Hermes lo tiene construido y en verde**: 98 reglas con fuente primaria, 6 ámbitos, 159 pruebas
   pasando aquí. Template lo tiene **solo como plano** (spec 004, 15 tareas abiertas).
2. De los 12 requisitos de la spec 004, Hermes **cumple 6** (RF-3, RF-6 a RF-10), **cumple a medias 4** (RF-1, RF-2, RF-4, RF-12),
   **contradice 1 a propósito** (RF-5, la cita) y **1 no le aplica** (RF-11, no usa Supabase).
3. Los dos incidentes que motivan la spec **constan en la fuente**, con commit y archivo. El
   «incidente» que la spec atribuía al mecanismo de conflicto **no consta**: fue diseño heredado y un
   *gotcha* de desarrollo. Queda corregido en la spec.
4. La medición destapó **tres huecos que Hermes no sabe que tiene**:
   - el gate de siembra no ve conflictos de veredicto: hay uno vivo, en INTERESES;
   - el gate no acota el vocabulario de veredicto por dimensión;
   - retirar una regla **borra el pasado**: un hecho de 2024 ya no tiene regla aplicable.
5. **Recomendación: opción D**. Se porta el motor al Golden Path como herramienta opt-in, se trae el
   conocimiento de Hermes **como dato pineado** y no como código, y un corpus de paridad generado
   desde el motor Python demuestra que el port dice lo mismo. Importar el código (A) mete un stack
   paralelo. Consumirlo como agente (C) no está disponible para un proyecto derivado y pone a un
   tercero en el camino de un veredicto sobre terceros.

> **Qué «grafo» es este.** En la casa hay cuatro cosas con ese nombre, y solo una es el objeto de este
> expediente: el **motor de reglas** (`categoría → regla → veredicto`) de la spec 004 y de
> `businessos/grafo/`. **No** es el «grafo por niveles» G0–G4 del ERP (`erp/integracion-arkham.md:42`),
> **ni** los conectomas de `docs/grafos/`, **ni** el `cerebro/graph` de Hermes, que es un grafo de
> memoria markdown (`businessos/frontends/control-interno/src/features/cerebro/server/graph.ts:1-4`).

---

## 1. Inventario medido — Hermes

### 1.1 Las piezas

| Pieza | Qué es | Tamaño | Estado medido aquí |
|---|---|---|---|
| `businessos/grafo/evaluador.py` | Motor **puro**: clasifica por keyword, vigencia a fecha, regla rectora, conflicto, topes | 283 líneas | cubierto por las 132 pruebas |
| `businessos/grafo/app.py` + `schemas.py` | API FastAPI + contrato Pydantic: `POST /evaluaciones`, `GET /reglas`, `/categorias`, `/salud-conocimiento`… | 224 + 191 | idem |
| `businessos/grafo/db.py` | Postgres con carga lazy; persiste cada evaluación completa en `evaluaciones` | 164 | **no ejercitado contra Postgres** (ver §6) |
| `businessos/grafo/seed/reglas.json` | **La fuente de verdad del conocimiento** | 3.976 líneas | gate OK |
| `businessos/grafo/seed/gen_seed_sql.py` | Gate de procedencia + generador de `02-seed.sql` | 309 | OK |
| `businessos/grafo/seed/01-schema.sql` | Esquema: jurisdicciones, dimensiones, categorías, reglas, impactos, evaluaciones | 75 | — |
| `businessos/grafo-a2a/` | Puente **determinista** A2A: Agent Card + JSON-RPC, opaco, sin LLM | 137 (executor) | 17 pruebas en verde |
| `businessos/grafo-gate/` | Puerta **pública** con Bearer ≥32 caracteres; expone solo `POST /evaluaciones`, fail-closed | 74 | 10 pruebas en verde |
| `businessos/enriquecimiento-a2a/gate_grafo.py` | Consumidor fail-closed: el grafo decide si corre la prospección (LFPDPPP) | — | fuera de alcance, patrón citado |
| `businessos/frontends/meeting-copilot/.../pre-discovery/grafo.ts` | Espejo TS del contrato + validador (sin disclaimer o sin fuentes, se rechaza) + un **mock que solo usan las pruebas** | 219 | revisado, no ejecutado |
| `.claude/PRPs/prp-fase2-grafo.md`, `prp-grafo-entrevista-guiada.md` (PENDIENTE), memorias `fase2-grafo.md` y `fase8-grafo-regulatorio.md` | Historia y decisiones | — | leídas |

Dependencias de runtime: Python 3.12, FastAPI, psycopg 3, **Postgres 16** (Docker), red Docker
`hermes-net`, puerto publicado solo en `127.0.0.1:3000` (`businessos/grafo/README.md:22-23`). Para el
puente, `a2a-sdk==1.1.0`, pineado.

### 1.2 Las pruebas, corridas aquí

Clon en el scratchpad, venv con los `requirements.txt` de cada servicio y Python 3.12.3:

```
=== grafo
132 passed, 1 warning in 0.87s
=== gate de procedencia
GATE DE PROCEDENCIA: OK — 98 reglas, 101 impactos, 61 categorias
=== grafo-a2a
17 passed, 47 warnings in 0.50s
=== grafo-gate
10 passed, 1 warning in 0.28s
```

Los avisos son de deprecación (`starlette.testclient`, `a2a.utils.proto_utils`), no fallos.

### 1.3 El conocimiento, contado en las dos fuentes

| Jurisdicción | Dimensión | Reglas (JSON) | Reglas (SQL generado) |
|---|---|---:|---:|
| CO | fiscal | 3 | 3 |
| MX | contable | 4 | 4 |
| MX | contractual | 6 | 6 |
| MX | datos-personales | 4 | 4 |
| MX | fiscal | 11 | 11 |
| MX | regulatorio | **70** | **70** |
| | **Total** | **98** | **98** |

- `02-seed.sql` regenerado desde `reglas.json` es **idéntico** al versionado (`diff -q` limpio).
- `_bajas`: `["MX-LFPDPPP-21-CONFIDENCIALIDAD"]`.
- Veredictos por impacto: 52 `permitido`, 4 `no_permitido`, 3 `deducible`, 18 `dudoso` y 24 sin
  veredicto (solo aportan requisitos).
- **Deriva memoria/código**: las memorias de Hermes hablan de 24, 26 y 29 reglas y de 54/54 y 59/59
  pruebas. Hoy son 98 reglas y 132 pruebas: 25 commits sobre `businessos/grafo/` después de ellas,
  con comercio exterior, logística y T-MEC en septiembre. **Cualquier decisión tomada de memoria sobre
  este grafo nace desfasada.**

---

## 2. Inventario — template

| Pieza | Relación con el grafo |
|---|---|
| `.claude/specs/004-grafo-de-conocimiento/` | El plano. **No construido**; 15 tareas abiertas. TAR-1 pedía justo este cotejo |
| `tools/extractor-documental/` | Emite **códigos y nunca etiquetas**, para que el significado viva en un solo sitio: el grafo (spec 004, duda de la vigencia). Productor natural de `(código, fecha del hecho)` |
| `.claude/skills/add-a2a/` | Porta la **forma** de los agentes A2A de Hermes, incluida la prueba de opacidad de `grafo-a2a` (`SKILL.md:53`, `:115`). Sirve para **exponer**, no para consumir (su propio «NO USAR») |
| `docs/SDD-puente-a2a-extractor.md` | Ya estudió los cinco agentes de Hermes, `grafo-a2a` entre ellos (§2) |
| `docs/ALINEACION-GOBERNANZA-hermes-os-a2a.md` | Mide la gobernanza de Hermes; no toca el grafo |
| `erp/` (PRP-004) | Importado de Hermes con historial. **No depende del grafo**: su «grafo por niveles» es otra cosa (ver §0) |
| `inventario/activos.json` | Cataloga `hermes/*` (config de despliegue) y el blueprint; **no registra el grafo** como activo, porque no está aquí |
| `docs/constitution.md` | Art. 1: **no se introduce un stack paralelo**. Art. 3: el núcleo de una herramienta no importa React, Next ni Supabase |

---

## 3. Matriz RF por RF — spec 004 frente a Hermes

Leyenda: ✅ cumple · 🟡 parcial · ❌ ausente · ↔ contradice (a propósito) · — no aplica.
Rutas relativas a `hermes-os-a2a/businessos/`.

| Requisito | Hermes | Evidencia | Qué significa para template |
|---|---|---|---|
| **RF-1** categoría (keywords + exclusiones) → regla → veredicto, vocabulario **acotado por dimensión** | 🟡 | El modelo sí existe: `grafo/seed/01-schema.sql:23-29` (keywords, exclusiones) y `:31-63` (reglas, impactos). El vocabulario es **global**: `grafo/schemas.py:13` y `grafo/seed/gen_seed_sql.py:31`. **Medido**: el gate acepta `deducible` en una regla `regulatorio` | El port acota el vocabulario **por dimensión** en el contrato Zod; con un solo enum global no se cumple |
| **RF-2** la pregunta en lenguaje natural se estructura antes de evaluar | 🟡 | No hay parser: `descripcion` es texto libre clasificado por keyword (`grafo/evaluador.py:48-69`) y el contexto llega ya estructurado (`grafo/schemas.py:22-30`). Quien estructura es el agente de la vertical, que es un LLM. **Medido**: la pregunta H1 de la spec («¿puedo hacer envíos internacionales sin permiso especial?») devuelve `dudoso / sin regla aplicable` | El parser es trabajo **nuevo** del port, sin precedente en Hermes |
| **RF-3** el veredicto sale siempre del motor determinista | ✅ | `grafo/evaluador.py:1` («motor puro… sin LLM») y `grafo/app.py:220` | Se porta tal cual |
| **RF-4** si interviene un LLM, solo estructura o redacta | 🟡 | El servicio no tiene LLM, así que cumple por construcción. En la capa del agente, la prohibición es **solo una instrucción** (`negocio/AGENTS.md:143-150`), y el incidente del 2026-07-09 demuestra que una instrucción no basta | La frontera va en **código**: el redactor solo recibe un veredicto ya calculado, y la respuesta se valida como en `grafo-a2a/executor.py:109-111` |
| **RF-5** la respuesta no expone de qué regla salió | ↔ | Hermes cita siempre: `grafo/evaluador.py:82-88` y `:180-184`, `grafo/schemas.py:79`. Su regla de oro es «cero afirmación sin fuente citada» | **Se abre una duda nueva en la spec**: en dominios regulatorios con fuente pública, la cita **protege** al tercero, que puede comprobarla (ver §5.3) |
| **RF-6** sin regla aplicable → «no hay información suficiente», distinguible | ✅ con matiz | `grafo/evaluador.py:135-147`: `dudoso`, razón `sin regla aplicable`, `fuente: null`. **Medido**. Matiz: `dudoso` lo comparten «sin regla», «conflicto» y «la regla dice dudoso» (18 impactos); solo la razón y `fuente` los distinguen | El port da a cada motivo un **tipo propio**, no un texto |
| **RF-7** exclusiones que descartan la categoría equivocada | ✅ | `grafo/evaluador.py:53-63`; prueba en `grafo/tests/test_multiambito.py:141-160`. **Medido antes/después**: sin exclusiones, «quiero ser agente de seguros para drones delivery» cae en `DRONES_DELIVERY`; con ellas, en `AGENTES_SEGUROS` | El caso real se convierte en la prueba negativa de TAR-5 |
| **RF-8** dos reglas con veredictos distintos → fail-safe con bandera, nunca elegir | ✅ | `grafo/evaluador.py:155-164`; `grafo/tests/test_evaluador.py:124-128`. **Medido** con INTERESES: `dudoso` + «Reglas vigentes en conflicto: MX-LISR-27-VII=deducible, MX-LISR-28-XXVII=dudoso» | Se porta. Ver RF-12: ese conflicto es **permanente** |
| **RF-9** cambiar reglas obliga a tocar el test del conteo | ✅ | `grafo/tests/test_salud_conocimiento.py:47` (`== 98`), más conteos por dominio: `grafo/tests/test_tmec.py:82` y `grafo/tests/test_comercio_exterior.py:162` | Se porta |
| **RF-10** la oración es entrada no confiable | ✅ para su superficie | Pydantic (`grafo/schemas.py:33-40`), `re.escape` en el clasificador (`grafo/evaluador.py:44`), límite de 64 KB y token en la puerta pública (`grafo-gate/app.py:21-24`), DataPart validado en A2A (`grafo-a2a/executor.py:32-58`). Sin LLM no hay nada que inyectar | Con parser LLM la superficie **crece**: aplica C3 (O1, inyección) |
| **RF-11** reglas en Supabase con RLS y sin `service_role` | — | Postgres propio sin RLS; el acceso lo protege la red (`grafo/README.md:22-23`) y el token de `grafo-gate` | Aplica de lleno al port si elige Supabase (C7) |
| **RF-12** colisiones y conflictos detectados **antes de sembrar** | 🟡 | `grafo/seed/gen_seed_sql.py:76-92` solo caza **keywords idénticas** en dos categorías. **Medido**: el seed real pasa el gate con el conflicto de INTERESES vivo. La regla «una rectora por categoría» es una **convención manual**: `_meta.source_version`, «lección Fase B» | **El hueco más importante que el port tiene que cerrar**: la spec exige no depender de que alguien se acuerde |

**Requisitos no funcionales.**
- Golden Path: ↔ (Python, FastAPI, Postgres, Docker).
- Contrato tipado sin `any`: ✅ en su idioma (Pydantic, con espejo TS en `meeting-copilot/.../grafo.ts:1-37`).
- Sostenible por una persona: 🟡. El gate es automático para keywords, pero los conflictos se curan a mano.

**Criterios de finalización de la spec 004, contra Hermes.**
- **Dos dominios de ejemplo, uno no legal**: ❌. Sus seis ámbitos son todos jurídicos o fiscales.
- **Extremo a extremo con una oración real**: ✅ sin parser (`grafo-a2a/tests/test_interop.py:82`, `:103`).
- **Tres controles negativos**: ✅ fail-safe, exclusiones y conflicto. El «antes» de las exclusiones
  no está como prueba: lo medí aquí.
- **Conteo fijado**: ✅.

---

## 4. Los dos incidentes, confirmados contra la fuente

| Incidente | Dónde consta en Hermes | Lo que dice la fuente, no la memoria |
|---|---|---|
| **Colisión de «drones»** | Commit `86ee4dc` («fix(grafo): exclusiones en el clasificador + categoria AGENTES_SEGUROS (Fase 8b)»); `grafo/evaluador.py:53-57`; `grafo/tests/test_multiambito.py:141` | «quiero ser agente de seguros para drones delivery» clasificó por la keyword «drones» y el grafo respondió **con autoridad**, con fuentes reales (Art. 30/74 LAC), **a la pregunta equivocada**: la real era intermediación de seguros (CNSF). *«Peor que "dudoso": autoritativo pero de otro dominio.»* |
| **Veredicto con el motor caído** | `negocio/AGENTS.md:143-150`; `.claude/memory/project/fase8-grafo-regulatorio.md:177-186` | En `#dep-legal`, el bot dijo «el grafo no está disponible» **y en el mismo mensaje** dio un «Veredicto: PERMITIDO» completo con checklist. Precisión: no se cayó el **motor**. Falló el backend de terminal del agente (entorno Docker sin daemon), y con él la llamada al grafo. Desde el agente es lo mismo: no hubo respuesta. En el mismo hilo, la segunda pregunta sí se negó bien. **Mismo bot, misma falla, comportamiento inconsistente**, y el arreglo quedó como instrucción |

**Y el tercero que la spec daba por incidente, y no lo es.** La spec 004 decía (nota de RF-8) que
exclusiones y conflicto se aprendieron «con un incidente real cada uno». Para el conflicto, **no
consta como incidente**:
- el mecanismo conflicto → `dudoso` está en el motor desde el primer commit (`c321bee`, 2026-07-02,
  «contradicción→dudoso»), portado del motor viejo `inferenceEngine.js`
  (`.claude/PRPs/prp-fase2-grafo.md:49`);
- lo que vino después fue un *gotcha* **cazado en desarrollo** en la Fase B, el 2026-08-07
  (`.claude/memory/project/fase8-grafo-regulatorio.md:359-372`): una regla de prohibiciones con
  `no_permitido` junto al `permitido` general degradaba la categoría entera.

Desde entonces Hermes lo evita por **convención manual**, que es exactamente el hueco de RF-12.
Corregido en la spec.

**Discrepancia de fecha, declarada.** La memoria, escrita el mismo día, sitúa ambos incidentes el
**2026-07-09**, antes de las 13:57 UTC. El mensaje del commit `86ee4dc`, la prueba
(`test_multiambito.py:141`) y el docstring (`evaluador.py:57`) dicen 2026-07-10. El commit lleva fecha
del 2026-07-09. **Doy por buena la memoria**: se escribió con el log delante.

---

## 5. Las dos dudas abiertas de la spec 004 y la duda nueva

### 5.1 ¿Qué pasa cuando cae el parser? — **Reafirmada abierta, con la forma de la respuesta**

Hermes **no tiene parser**, así que no puede contestarla por nosotros. Sí demuestra dos cosas que la
acotan:

- **En el servicio, «no puedo operar» y «no hay regla» ya fallan distinto.** Con la base caída, la
  API devuelve **HTTP 503** «base de conocimiento no disponible» (`grafo/app.py:36-43`), no un
  `dudoso`. En A2A, grafo caído o respuesta sin disclaimer o sin fuentes terminan en **tarea
  `failed`**, nunca en un veredicto (`grafo-a2a/executor.py:5-6`, `:109-111`). Y el consumidor
  `enriquecimiento-a2a/gate_grafo.py` es **fail-closed**: sin grafo, no corre.
- **En el agente, una instrucción no bastó** (§4). La distinción tiene que ser **de tipo**, no de redacción.

**Forma propuesta**: parser caído → **error sin objeto veredicto**, de un tipo distinto de
`sin_regla`, y el redactor **no puede ejecutarse** sin un veredicto del motor. Queda abierta porque la
spec pide *decidirla y probarla*, y eso es fase del PRP.

### 5.2 ¿Vigente hoy o vigente a la fecha del hecho? — **Contestada a medias: el motor sí, los datos no**

- **El motor resuelve por la fecha del hecho.**
  - `contexto.fecha` es la fecha de la operación (`grafo/schemas.py:28-30`).
  - Cada regla lleva `vigente_desde` y `vigente_hasta` (`grafo/evaluador.py:72-79`).
  - Hay pruebas que lo fijan: `grafo/tests/test_evaluador.py:61-67`, donde la 28-XXXII no aplica antes de 2020.
  - Cada evaluación se **persiste completa** en `evaluaciones.salida` (`grafo/seed/01-schema.sql:68-74`).
- **El ciclo de vida de los datos reescribe el pasado**, que es justo lo que la spec quería evitar.
  Medido:
  - **Ninguna de las 98 reglas usa `vigente_hasta`.**
  - Retirar una regla es un **`DELETE`** (`_bajas`, `grafo/seed/gen_seed_sql.py:13-17` y `:233-240`). La
    regla de la ley de 2010, `MX-LFPDPPP-21-CONFIDENCIALIDAD` (`vigente_desde 2010-07-06`,
    `vigente_hasta: null`), **se borró** el 2026-07-30 (`4a4714d`). Lo correcto habría sido cerrarla con
    `vigente_hasta = 2025-03-20`.
  - **Efecto medido**: «cláusula de confidencialidad», con un hecho del 2024-06-01 → `dudoso / sin regla
    aplicable`. Con un hecho del 2026-06-01 → la regla de 2025. **Una auditoría de un contrato de 2024
    ya no tiene regla.** Falla hacia el fail-safe, no hacia una certeza falsa, pero la respuesta que
    existía se perdió.
  - Editar una regla es un `upsert … do update` sobre su clave (`gen_seed_sql.py:253-257`): cambia el
    significado **en su sitio**.
  - Categorías, keywords y exclusiones también son `upsert` sin historial (`:222-230`). Cambiar una
    keyword **reclasifica en silencio** los documentos ya procesados.
  - Recrear el volumen, que es el reseed documentado, **borra también `evaluaciones`**
    (`grafo/README.md:63-65`).

**Conclusión**: la spec 004 acertó con la forma que anotó el 2026-09-10: solo se añade, la clave
`(código, fecha del hecho)`, la fecha la afirma quien publica. Hermes aporta la **prueba empírica**
de que resolverlo solo en el motor no basta. **Lo que falta decidir** es si el caso de uso de template
lo exige. Esa parte sigue abierta.

### 5.3 Duda nueva: ¿la cita protege o expone?

RF-5 prohíbe exhibir la regla («la trazabilidad interna es para depurar»). En Hermes, la cita es el
**mecanismo de seguridad**: quien recibe «permitido» puede comprobar el Art. 74 LAC por sí mismo. Y la
investigación con fuente primaria ya cazó una vez una **numeración equivocada** (Art. 72 frente a 74)
que alguien que citara a ciegas habría propagado. Para reglas **internas** de negocio (elegibilidad,
políticas), exhibirlas puede no convenir. Para reglas de **fuente pública**, ocultar la cita le quita
al tercero su única vía de verificación, que es un daño C4. **No se toca RF-5**: se abre como duda con
esta evidencia.

---

## 6. Opciones de integración

| | **A. Importar con historial** | **B. Portar desde cero** | **C. Consumir como agente** | **D. Motor portado + conocimiento como dato + paridad** |
|---|---|---|---|---|
| **Qué se trae** | `businessos/grafo*` con `git filter-repo`, como el ERP | Nada: se reescribe desde la spec | Nada: se llama a `grafo-a2a` o a `grafo-gate` | El **esquema** del seed (como contrato Zod), el **motor** reescrito en TS, un **subconjunto** del seed como dominio de ejemplo y un **corpus de paridad** generado con el motor Python |
| **Qué se pierde** | Nada técnico; se gana un segundo runtime | Las 98 reglas con fuente primaria y las lecciones pagadas con incidentes | El control: el veredicto depende de un servidor ajeno | Solo el runtime Python (API, Docker, Postgres), que la spec no quiere |
| **Coste** (orden de magnitud, **estimado**, no medido) | Bajo al importar, **alto al mantener**: dos copias del conocimiento divergiendo cada semana | Alto: rehacer el motor, el gate y las lecciones | Bajísimo en código | Medio: 283 líneas de motor puro, 309 de gate y la capa nueva (parser, redactor, tipos de fallo). El conocimiento no se reinvestiga |
| **Constitución** | ❌ Art. 1: stack paralelo en una capacidad que instalan los derivados. El ERP pudo quedarse en Python porque son **scripts internos del laboratorio** (PRP-004:125), no algo que se instala | ✅ | ✅ sin código | ✅ Art. 1 y Art. 3: núcleo sin dependencias en `tools/`, como el extractor |
| **C1** (superficie del agente) | No, salvo enrutado en `AGENTS.md` | Idem | **Sí**: una herramienta nueva hacia fuera | Idem A/B: el enrutado desde `AGENTS.md` es CDC, fuera del núcleo |
| **C3** (superficie de entrada) | Hereda la de Hermes | Nueva, con parser (O1) | **Sale** del perímetro: depende del edge de Hermes y de su token | Nueva, con parser (O1). Se diseña desde el día uno |
| **C4** (daño a terceros) | Conocimiento que caduca **en dos sitios**: el derivado responde con la ley de hace meses | Mayor: el conocimiento se reinventa sin las lecciones | **El peor**: un **tercero** (el operador de Hermes) queda en el camino de un veredicto sobre terceros, y las preguntas de los usuarios **salen del perímetro** | Acotado: el dominio regulatorio de ejemplo es pequeño, fechado y pineado, y la paridad demuestra que dice lo mismo que Hermes |
| **C7** | — | Si elige Supabase: RLS y sin `service_role` | — | Idem B |
| **Privado/público** | Sin conflicto (se trae de lo público a lo privado) | — | — | Sin conflicto. **Nada va de template a Hermes** |
| **¿Disponible hoy para un derivado?** | Sí | Sí | **No**. `grafo-a2a` solo escucha en loopback (`docker-compose.yml:239-240`, «nunca 0.0.0.0») y anuncia `http://grafo-a2a:4000`, interna a `hermes-net`. El único camino público es `grafo-gate`, por Caddy y con token Bearer, pensado para meeting-copilot en Vercel (`edge/Caddyfile:72-91`) | Sí |

**Otras formas consideradas y descartadas**:
- **Submódulo o paquete Python pineado**: es A con otro nombre, con el mismo stack paralelo.
- **Importar solo el seed y escribir el motor desde la spec, sin paridad**: es D sin su comparador.
  Nada demostraría que el port dice lo mismo que el motor con el que se aprendieron las lecciones.

### Recomendación: **D**

1. **El valor de Hermes está en el conocimiento y en las lecciones, no en el runtime.** El motor son
   283 líneas puras, portables en una tarde. Las 98 reglas y los dos incidentes costaron semanas de
   lectura de fuente primaria. D se queda con lo caro y deja lo barato.
2. **A choca con la constitución y duplica la fuente de verdad** de algo que cambia cada semana
   (comercio exterior, logística y T-MEC entraron entre el 2 y el 3 de septiembre). C no está al
   alcance de un derivado y es la peor opción de C4. B tira justo lo que la spec 004 manda no
   reinventar.
3. **D cierra lo que Hermes no tiene**, porque el port se escribe contra la spec y no contra Hermes:
   - el gate de conflictos antes de sembrar (RF-12);
   - el vocabulario por dimensión (RF-1);
   - las bajas que cierran vigencia en vez de borrar (§5.2);
   - el tipo distinto para «parser caído» (§5.1).

   Cada divergencia con Hermes se declara en el corpus de paridad **como diferencia esperada, con su
   porqué**, nunca en silencio.

**Lo que D no resolvía y quedaba al humano** (resuelto en la Fase 0, §9):
- si un derivado debe traer **el seed completo** de Hermes: es decisión por proyecto, con pin y
  procedencia;
- quién mantiene la paridad cuando Hermes cambia el motor: cada subida del pin **re-genera el corpus y
  es un gate humano**;
- RF-5, la cita (§5.3).

---

## 7. Cómo podría estar mal este análisis, y qué se hizo

| Riesgo | Estado |
|---|---|
| **Memoria de Hermes desfasada frente al código** | **Resuelto**: todo se midió sobre el código de `97d9f9e` (98 reglas, 159 pruebas); las memorias solo se usaron para la historia y los incidentes, contrastadas con commits |
| **Pruebas que pasan con fixtures y no con Postgres** | **Declarado**. Las 132 pruebas del grafo cargan el conocimiento del JSON. `test_db.py` solo prueba que importar no conecta y el ensamblado con fixtures. **No se levantó Postgres** (la restricción lo prohíbe y no hace falta para decidir): el camino `db.py` ↔ SQL real está **sin medir**. Mitigación: el SQL regenerado es idéntico al versionado y cuenta lo mismo que el JSON. Lo que hay **en producción** (Hetzner) no se midió, y según la memoria de Hermes probablemente **no son 98**: aplicar ese seed en runtime quedó **PENDIENTE** por la red cortada del servidor desde ~27-28 de agosto (`fase8-grafo-regulatorio.md`, «PENDIENTE runtime»). El congelamiento (hermes-os-a2a PR #317) no bloquea aplicarlo |
| **Contar reglas en el JSON y no en el SQL** | **Resuelto**: contadas en los dos, 98 = 98 por ámbito |
| **Opción C barata en apariencia** | **Resuelto** en §6: no está disponible para un derivado, y mete a un tercero en un veredicto sobre terceros |
| **Sesgo hacia importar porque ya se hizo con el ERP** | **Resuelto**: el precedente se leyó (PRP-004:125) y su razón («Python se queda en Python») vale para scripts internos, no para una capacidad instalable (constitución art. 1 y 3) |
| **Falso hallazgo propio** | **Cazado**. Un sondeo mío mostró «rectora: LISR Art. 27, fracción V» sobre la regla `27-VII`: era **mi** recorte de la cadena a 70 caracteres. La cita del JSON es «fracción VII». Verificado y descartado |
| **Llamar «grafo» a otra cosa** | **Declarado** en §0: cuatro cosas con el mismo nombre en la casa |
| **Que Hermes haya avanzado fuera de `master`** | **Resuelto**: ninguna de las 9 ramas remotas trae commits del grafo sin mezclar |
| **El conflicto de INTERESES puede ser intencional** | **Declarado**. Puede que el laboratorio quiera que «intereses» salga siempre `dudoso`. Aun así, lo expresa **por el mecanismo de conflicto**, con una bandera de «requiere revisión» permanente, y el gate no lo distingue de un error. Lo que es hallazgo es el punto ciego, no la regla |
| **El coste de las opciones** | **Declarado**: es un orden de magnitud por líneas, no una medición de esfuerzo |

---

## 8. Cómo re-medir (sin tocar Hermes)

```bash
S=<scratchpad>; git clone https://github.com/lisagomez/hermes-os-a2a.git $S/hermes
git -C $S/hermes checkout 97d9f9e
python3 -m venv $S/venv && $S/venv/bin/pip install -r $S/hermes/businessos/grafo/requirements.txt \
  -r $S/hermes/businessos/grafo-a2a/requirements.txt pytest
for d in grafo grafo-a2a grafo-gate; do (cd $S/hermes/businessos/$d && $S/venv/bin/python -m pytest tests/ -q); done
(cd $S/hermes/businessos/grafo && $S/venv/bin/python seed/gen_seed_sql.py --check)
```

**Hermes es de solo lectura**: nada de push, PR ni issue allí.

---

## 9. Decisiones de la Fase 0 (el laboratorio, 2026-09-26)

| Pregunta | Decisión |
|---|---|
| Opción de integración | **D** |
| ¿Se cita la fuente? (§5.3) | **Por dominio**: sí si la fuente es pública, no si la regla es interna. RF-5 reescrito |
| ¿Reglas de hoy o de la fecha del hecho? (§5.2) | **Fecha del hecho, solo se añade**. RF-13 y RF-14 |
| ¿Cómo se mantiene al día en varios proyectos? | **Fuente única en este repo**: un paquete de datos por dominio, versionado, separado del motor. Cada proyecto registra sus dominios y fija la versión. `vigila:versiones` avisa y nunca actualiza. RF-15 y RF-16 |
| Dominio regulatorio de ejemplo | Drones de reparto + agentes de seguros, registrados desde la fuente única |
| Hermes | Lee del paquete **después**, en un PRP aparte con firma. Hasta entonces su `reglas.json` está **ya congelado** desde `97d9f9e` (hermes-os-a2a PR #317, 2026-09-27; `grafo-congelado` es check obligatorio de su `master`) |

**Descartadas para la fuente**:
- **Que siga en Hermes**: los arreglos medidos (gate de conflictos, vigencia) quedarían fuera de esta gobernanza.
- **Un repo propio**: sería un repo más, con su CI y su gobernanza.
