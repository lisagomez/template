# PRP-005: El grafo de conocimiento, portado al Golden Path con el conocimiento de Hermes como dato

> **Estado**: APROBADO (2026-09-26, el laboratorio: «fase 0 con D»). La **Fase 0 está cerrada** con sus
> decisiones escritas (ver la Fase 0 del Blueprint). Las fases 1+ se ejecutan por bucle agéntico,
> cada una con su validación. **Hasta que empiece la Fase 1 no se ha escrito código ni importado nada.**
> **Fecha**: 2026-09-26
> **Proyecto**: template (fábrica) · origen del conocimiento: `lisagomez/hermes-os-a2a@97d9f9e`
> **Spec**: `.claude/specs/004-grafo-de-conocimiento/spec.md`. Cierra el QUÉ; este PRP no la reescribe.
> **Expediente**: `docs/SDD-grafo-hermes-a-template.md`. Ahí están la medición, la matriz RF por RF y
> por qué se eligió la opción D frente a importar (A), portar desde cero (B) o consumir como agente (C).
> **CDC aplicable**: **sí, acotado a la Fase 8**. Enrutar la capacidad desde `AGENTS.md` cambia el
> prompt de todos los agentes → C1: diff + `npm run regresion` + aprobación + `BITACORA-CDC.md`. Las
> demás fases no tocan modelo, skills, prompts, plantillas ni `settings.json`.

---

## Objetivo

Que template tenga, como **herramienta opt-in** en `tools/`, el motor de reglas de la spec 004. Tiene
que decir **lo mismo** que el grafo en producción de Hermes sobre el mismo conocimiento, y **cerrar los
huecos que Hermes no sabe que tiene**.

El conocimiento de Hermes entra como **dato**, no como código, y se convierte en la **fuente única**:
un paquete de datos en este repo, dividido por dominio y versionado. Se genera una vez y cada
proyecto registra los dominios que necesita y fija su versión (Fase 0: RF-15 y RF-16).

## Por Qué

| Problema | Solución |
|----------|----------|
| La spec 004 lleva desde agosto como plano: 15 tareas abiertas | Un plan por fases que la construye sin reinventar lo que Hermes ya pagó |
| El valor de Hermes son 98 reglas leídas de fuente primaria y dos incidentes reales, no su runtime | Se trae el **esquema y los datos**; el motor, de 283 líneas puras, se porta |
| Importar el código mete Python, FastAPI, Postgres y Docker en una capacidad que instalan los derivados | Núcleo TS sin dependencias, como `tools/extractor-documental` (constitución art. 1 y 3) |
| Hermes tiene tres huecos medidos: conflictos que pasan el gate, vocabulario global y bajas que borran el pasado | El port se escribe **contra la spec**, y la paridad declara cada divergencia |

**Valor**: cualquier proyecto derivado con reglas propias (lo regulatorio, elegibilidad, políticas)
responde en oraciones libres con un veredicto que **nunca finge certeza**.

## Qué

Resume la spec 004. Los criterios salen de sus RF en EARS y el «Fuera de alcance» es el de la spec.

### Criterios de Éxito
- [ ] **Paridad**: sobre el corpus generado con el motor Python de Hermes, el motor TS da el mismo
      veredicto, razón, fuente y banderas. Cada diferencia es una **divergencia esperada** declarada con
      su RF (p. ej. el conflicto de INTERESES rechazado en la siembra)
- [ ] RF-1: el vocabulario de veredicto está acotado **por dimensión** en el contrato Zod. `deducible` en
      una regla regulatoria **no siembra**
- [ ] RF-6: «sin regla», «conflicto», «la regla dice dudoso» y «parser caído» son **tipos distintos**, no
      textos distintos del mismo `dudoso`
- [ ] RF-7: el caso real de «drones» se prueba **antes y después** de las exclusiones
- [ ] RF-12: el gate de siembra rechaza el conflicto de veredictos (control negativo: el INTERESES de
      Hermes **pone rojo** el gate), las keywords idénticas y las keywords contenidas en otra categoría
      sin exclusión
- [ ] RF-13/RF-14, vigencia: retirar una regla **cierra** su `vigente_hasta`, nunca la borra, y el gate
      rechaza borrar o editar en su sitio. Control: un hecho de 2024 sigue encontrando la regla de 2010
- [ ] RF-5: los dominios de fuente pública citan y los internos no, con prueba de los dos casos
- [ ] RF-15, fuente única: un proyecto de prueba registra dos dominios y **solo recibe esos**. El
      paquete lleva semver, fecha de corte por dominio y registro de cambios
- [ ] RF-16, aviso: publicar una versión nueva del paquete hace que `vigila:versiones` del consumidor
      la reporte, y **nada cambia** en él hasta que un humano sube el pin
- [ ] Dos dominios de ejemplo, uno regulatorio y uno **no legal**; extremo a extremo con una oración real;
      conteo de reglas fijado en prueba
- [ ] `npm run empaqueta` del motor y del paquete de conocimiento: los dos instalan e importan en un
      proyecto limpio
- [ ] `npm run validate` en verde

### Comportamiento Esperado
Pregunta en lenguaje natural → **parser** (opcional, entry point aparte: solo estructura) → **motor
determinista** (veredicto) → **redactor** (opcional: solo redacta un veredicto ya calculado). Si el
parser o el almacén fallan, sale un **error tipado sin veredicto**, y el redactor no se ejecuta.

## Contexto

### Referencias
- `docs/SDD-grafo-hermes-a-template.md`: la medición entera, con `archivo:línea` de Hermes.
- Hermes, **solo lectura**, en `97d9f9e`:
  - `businessos/grafo/evaluador.py` (motor);
  - `seed/gen_seed_sql.py` (gate);
  - `seed/reglas.json` (conocimiento);
  - `grafo-a2a/executor.py` (el patrón «sin disclaimer ni fuentes no se entrega»).
- `tools/extractor-documental/`: el patrón de núcleo sin dependencias con motor y almacén **inyectados**,
  y el productor natural de `(código, fecha del hecho)`.
- `docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md`.
- PRP-004: precedente de traer algo de Hermes con corte, procedencia y auditoría.

### Arquitectura Propuesta
```
tools/conocimiento/            # FUENTE ÚNICA (RF-15): datos, sin código de motor
├── dominios/<jurisdiccion>-<dimension>/<dominio>.json   # cada uno: fecha de corte, cita pública|interna
├── gate/                  # procedencia + colisiones + conflictos + vocabulario + vigencia solo-añadir
├── CAMBIOS.md             # por versión: reglas añadidas y cerradas (semver: parche cita · menor regla · mayor significado)
└── historial importado de hermes-os-a2a (reglas.json, PLANTILLA-INVESTIGACION-SEED.md)

tools/grafo-conocimiento/      # el MOTOR: no trae datos; el proyecto registra dominios de tools/conocimiento
├── src/contrato.ts        # Zod: categoría, regla, impacto, veredicto POR DIMENSIÓN, resultado tipado
├── src/motor.ts           # puro: clasificar, vigencia, rectora, conflicto, topes, fail-safe
├── src/gate.ts            # siembra: procedencia + colisiones + conflictos + vocabulario + bajas
├── src/almacen.ts         # interfaz inyectada (archivo versionado | Supabase en entry point aparte)
├── src/lenguaje/          # entry point aparte: parser (structured outputs) + redactor
├── ejemplos/              # registro de drones + seguros (regulatorio) y un dominio no legal
└── pruebas/paridad/       # corpus generado con el motor Python de Hermes@97d9f9e + divergencias
```
La libertad técnica de la spec se mantiene salvo lo que fijó la Fase 0: **la fuente vive en este
repo, separada del motor**. Los nombres, el formato exacto de los dominios y el parser los decide
quien ejecute. Esto es la forma, no la implementación.

### Modelo de Datos (si aplica)
Si un derivado elige Supabase, el esquema sale del de Hermes (`01-schema.sql`) con tres cambios:
- **vigencia solo-añadir**: las bajas cierran `vigente_hasta`;
- **historial de categorías y keywords**;
- **RLS** habilitado y `service_role` fuera de la superficie de consulta (C7).

Las tablas se declaran en el §4 del `BUSINESS_LOGIC.md` del derivado para el respaldo. Si el almacén
es un archivo versionado, git **es** el historial.

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*

- **Activos que toca**: la integridad del conocimiento (qué dice cada regla y desde cuándo) y el
  veredicto que recibe un tercero.
- **Fronteras que cruza**:
  - la oración del usuario (no confiable) hacia el parser LLM;
  - el conocimiento importado desde un repo **público** hacia uno privado.
- **Atacante relevante**:
  - **O1**, inyección: una oración que intenta que el parser «decida»;
  - **O2**, evidencia falsa: una pregunta redactada para caer en la categoría favorable. Las exclusiones
    y el gate de colisiones la frenan;
  - **O5**, cadena de suministro: el conocimiento se traía de un repo público que cambia río
    arriba. Con la fuente única deja de ser una dependencia viva: se trae **una vez**, con
    sha256, y desde entonces la fuente es propia. Queda O5 en la distribución hacia los
    consumidores;
  - **O4**, denial-of-wallet: las llamadas al parser.
- **Controles**:
  - el parser solo emite campos validados con Zod y **no tiene ruta** hacia el veredicto;
  - la migración única se hace **pineada por commit y sha256**;
  - cada consumidor fija la **versión exacta** del paquete, con la integridad del lockfile, y
    subirla es firma humana con paridad re-generada. `vigila:versiones` solo avisa (RF-16);
  - el gate corre antes de sembrar;
  - el parser pasa por el routing y la contabilidad de tokens (C8).
- **Brecha abierta a propósito**: el significado de un código que cambia sin cambiar de estructura
  (duda de la spec 004). Se mitiga con fecha de corte visible, no se elimina.

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*

- **Partes afectadas**: quien pregunta y actúa sobre la respuesta. Y, en los dominios regulatorios,
  terceros sobre los que se decide (un cliente, una contraparte), que no usan el sistema.
- **Daño posible con el sistema operando bien**:
  - un veredicto con la ley **de la fecha del pin** cuando la ley ya cambió;
  - la categoría equivocada con autoridad (el caso de «drones»);
  - una certeza improvisada cuando algo falla (el caso del motor caído).
- **Mitigaciones**:
  - fail-safe tipado;
  - fecha de corte del conocimiento en toda respuesta;
  - `salud_conocimiento` portado (reglas vencidas, montos sin cotejo);
  - disclaimer obligatorio: la respuesta sin él no se entrega.
- **Reversibilidad**: el veredicto es informativo y no ejecuta nada. Una decisión tomada sobre él puede
  no ser reversible, así que la vía de apelación es humana y el disclaimer lo dice.
- **Decisión**: **mitigar**. El fail-safe es **no firmable** (límite de C5): ninguna firma del dueño
  autoriza a devolver certezas inventadas a un tercero.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada una (bucle agéntico).

### Fase 0: Decisiones humanas — ✅ CERRADA 2026-09-26
> El laboratorio: «fase 0 con D». Escrito en la spec 004 (RF-5 reescrito, RF-13 a RF-16 nuevos, dos dudas
> resueltas) y en su `plan.md` (decisiones 4, 7 y 8).

| Decisión | Resultado | Descartado |
|---|---|---|
| Opción de integración | **D**: motor portado y conocimiento como dato | A (importar código), B (desde cero), C (consumir como agente) |
| Cita de la fuente (RF-5) | **Por dominio**: cita si la fuente es pública, no si la regla es interna | Nunca citar; citar siempre |
| Vigencia (RF-13, RF-14) | **A la fecha del hecho, solo se añade**: retirar una regla cierra su vigencia | Aplicar siempre las reglas vigentes hoy |
| Dominio regulatorio de ejemplo | **Drones de reparto + agentes de seguros**, registrados desde la fuente única | Seed completo o solo fiscal *como ejemplo*: el paquete trae las 98 reglas y cada proyecto elige |
| De dónde sale el conocimiento (RF-15) | **Fuente única en este repo**: paquete de datos, separado del motor | Seguir en Hermes; repo propio |
| Versión fijada (RF-16) | **Versión exacta por proyecto**; `vigila:versiones` avisa y **nunca actualiza**; subirla es firma humana con la paridad re-generada | Revisión periódica automática |
| Hermes | **Lee del paquete después, en un paso aparte** con su propio gate y firma. Mientras tanto su `reglas.json` está **ya congelado** desde `97d9f9e` (hermes-os-a2a PR #317, 2026-09-27; `grafo-congelado` es check obligatorio de su `master`) | Incluirlo en este PRP |

**Validación**: ✅ `npm run verifica:specs` en verde con los 16 RF en EARS; este PRP pasa a APROBADO.

### Fase 1: Contrato y corpus de paridad — ✅ CERRADA 2026-09-27
> `tools/grafo-conocimiento/`:
> - contrato Zod (`src/contrato.ts`) y `validaConocimiento` (`src/valida.ts`), que devuelve problemas tipados;
>   conserva los nombres de campo de Hermes, para que Hermes pueda leer el paquete después;
> - `desdeHermes`, que hace explícitos los ausentes que su motor leía con default y NO esconde `_bajas`;
> - corpus de 782 casos con la salida exacta del motor Python en `97d9f9e`, leído con `git show` y huellas
>   comprobadas: 2,98 MB → 387 KB sin pérdida, verificado caso por caso, y determinista;
> - la validación del seed da **exactamente** las 2 divergencias declaradas (baja de 2010, conflicto
>   INTERESES) más 5 estructurales documentadas;
> - 24/24 pruebas; los controles negativos (quitar una divergencia, alterar la huella) ponen rojo;
>   typecheck, lint y `validate` en verde.
**Objetivo**: el contrato Zod, con el vocabulario por dimensión, la cita por dominio y la vigencia de
solo-añadir. Además, un corpus de paridad **generado fuera del repo** con el motor Python de
Hermes@97d9f9e: al repo solo entran sus salidas, como datos, con procedencia (commit y sha256 del seed).
**Validación**: el contrato valida el seed de Hermes salvo las divergencias declaradas (INTERESES,
vocabulario, la regla de 2010 borrada). `npm run verifica:specs` en verde.

### Fase 2: La fuente única — el conocimiento traído una vez (TAR-16, TAR-17) — ✅ CERRADA 2026-09-27
> `tools/conocimiento` (`@tu-scope/conocimiento`):
> - **Importación**: git-filter-repo 2.47.0 al corte `97d9f9e`, `reglas.json` y su predecesor `reglas_mx.json`
>   (16 commits de historia), la plantilla y el dictamen. Byte a byte idénticos, y `audita:secretos` limpio
>   sobre toda la historia.
> - **Reparto**: 17 dominios y 4 archivos de generales. La procedencia se partió por dominio y se
>   reconstruye exacta. Migración única en `origen/`.
> - **0.1.0**, la migración: el motor REAL de Hermes sobre el paquete da 576 idénticos, 206 iguales salvo el
>   orden y 0 diferencias de contenido. Hermes lo lee sin adaptador.
> - **0.2.0**, firmada por el laboratorio: regla de 2010 restaurada y cerrada al 2025-03-20; INTERESES con una
>   sola rectora `dudoso` (variante A). 12 respuestas cambian de razón y ningún estado cambia.
> - **Registro**: drones de reparto + agentes de seguros dan solo esos 2 dominios (5 reglas) y validan limpio.
> - 9 pruebas del paquete y 25 del motor; `validate` en verde.
**Objetivo**: `reglas.json` y su método de investigación (`PLANTILLA-INVESTIGACION-SEED.md`) de Hermes,
traídos **con su historial** con el mismo procedimiento que el ERP en PRP-004 Fase 1: corte pineado,
sha256 y `audita:secretos` limpio. Después:
- divididos por dominio, cada uno con su fecha de corte y si cita;
- semver y `CAMBIOS.md`;
- la regla `MX-LFPDPPP-21-CONFIDENCIALIDAD`, recuperada del historial y **cerrada** a 2025-03-20;
- INTERESES expresado con una sola regla rectora.

Las dos últimas cambian veredictos: **van con firma**.

**Validación**:
- sha256 del corte idéntico al de Hermes;
- un proyecto de prueba registra dos dominios y solo recibe esos;
- un hecho de 2024 encuentra la regla de 2010.

**Corte de la migración = `97d9f9e`**: es el que Hermes ya tiene congelado desde el 2026-09-27 (PR #317), así que entre el corte y esta fase no puede nacer una regla en Hermes.

### Fase 3: Motor determinista — ✅ CERRADA 2026-09-27
> `tools/grafo-conocimiento` 0.3.0, `src/motor.ts`:
> - `evalua` es el port de `evaluador.py`; `evaluaSeguro` devuelve `FalloSinVeredicto` si el conocimiento o
>   la pregunta no tienen forma.
> - **Paridad**: sobre la fuente única da 574 idénticos, 196 iguales salvo el orden y 12 de contenido,
>   exactamente las firmadas. Es la misma vara que el motor de Hermes sobre el mismo paquete: los dos motores
>   dicen lo mismo. 782 casos en ~165 ms.
> - **Decisiones explícitas**:
>   - conflicto y tope excedido son fail-safe (`veredicto: null`);
>   - los empates se deciden por clave;
>   - el régimen es obligatorio;
>   - el tope acota cualquier veredicto;
>   - el disclaimer es genérico.
>   Declaradas en `divergencias.json`.
> - **Controles negativos**: fail-safe, exclusiones antes/después, conflicto y vigencia a ambos lados del
>   cierre, más tope y fecha supuesta con fixtures. Desactivar las exclusiones pone roja la paridad.
> - 40 pruebas del motor y 14 del paquete.
**Objetivo**: el motor TS puro, sin datos propios. Da los mismos veredictos que Hermes sobre el
corpus, más los tipos de fallo de la spec y el juicio a la fecha del hecho.
**Validación**:
- paridad verde con sus divergencias listadas;
- controles negativos de fail-safe, exclusiones (antes/después) y conflicto;
- vigencia de 2024 frente a 2026.

### Fase 4: Gate de siembra, en la fuente — ✅ CERRADA 2026-09-27
> `tools/grafo-conocimiento` 0.4.0, entrada `./gate` (`contenciones`, `huellas`, `comparaVersiones`), y en
> `tools/conocimiento`:
> - `versiones.json`: registro de solo añadir con las huellas de la 0.1.0, reconstruida desde su commit, y de la 0.2.0,
>   con `MX-LISR-27-VII` firmada;
> - `contenciones-aceptadas.json`: 15 contenciones aceptadas con su porqué, una con reserva (marcas y patentes);
> - `pruebas/gate.ts`.
>
> El gate corre en `validate` a través de `prueba:tools`, **sin tocar `gates.json`**, así que no es CDC. Una entrada
> propia en el padrón es opcional y sí lo sería.
>
> Controles medidos sobre el paquete real, cada uno pone rojo la prueba correcta:
> - borrar una regla sin subir de versión;
> - borrarla subiendo y registrando la versión (`regla_borrada`);
> - una keyword que crea una contención sin declarar.
>
> Control de reversión: volver de la 0.2.0 a la foto de Hermes da `regla_borrada` + `regla_editada` + `reemplazo_editado`.
> Suman 48 pruebas del motor y 19 del paquete.
**Objetivo**: RF-1, RF-12 y RF-14 automáticos en `tools/conocimiento`, antes de sembrar: conflicto
de veredictos, keywords idénticas o contenidas, vocabulario por dimensión, y ningún borrado ni edición
en su sitio.
**Validación**:
- el seed de Hermes **tal cual** pone rojo el gate (control de reversión);
- ya migrado, verde;
- entra a `npm run validate`.

### Fase 5: Capa de lenguaje natural — ✅ CERRADA 2026-09-27 (con dos desviaciones declaradas)
> `tools/grafo-conocimiento` 0.5.0, entrada `./lenguaje`:
> - `estructura`: el parser, con el modelo inyectado;
> - `redacta` y `redactaFallo`: plantillas deterministas;
> - `responde`: la orquestación.
>
> Defensa contra O1, estructural y probada con fixtures:
> - salida estricta sin campo de veredicto;
> - categoría de lista cerrada;
> - `descripcion` como fragmento literal de la pregunta;
> - contraste en el motor: motivo nuevo `clasificacion_dudosa`, sin veredicto.
>
> Parser caído (error, tiempo o salida sin forma) = `parser_no_disponible`, redactado distinto de «sin regla».
> RF-5: en un dominio interno no sale ni regla, ni cita, ni bandera del motor. Contrapruebas medidas: un motor
> que cree a ciegas al parser, y un parser sin la comprobación literal, ponen rojas sus pruebas.
> 62 pruebas del motor y 19 del paquete, y la paridad intacta.
>
> **Desviaciones declaradas**:
> 1. La precisión del parser con un **modelo real NO está medida**: no hay clave en este entorno, y la raíz no trae
>    el AI SDK. TAR-12 sigue abierta. La seguridad no depende de esa medición.
> 2. No se añadieron casos a `npm run regresion -- --trampa`. Ese corpus (rama `golden-sets`, protocolo ciego)
>    prueba cómo se comporta un **agente** en un CDC de skills, no una librería. La defensa del parser es
>    estructural y se prueba de forma determinista en su suite. Llevar el O1 al corpus ciego es un cambio de C2
>    aparte, con firma.
**Objetivo**: parser y redactor en un entry point aparte. «Parser caído» se tipa y se prueba distinto
de «sin regla». El redactor cita solo en los dominios públicos (RF-5).
**Validación**:
- la pregunta H1 de la spec llega al motor estructurada;
- casos-trampa de inyección (O1) en `npm run regresion -- --trampa`;
- el redactor no puede ejecutarse sin veredicto;
- prueba de un dominio que cita y otro que no.

### Fase 6: Dominios de ejemplo y extremo a extremo — ✅ CERRADA 2026-09-27
> - **Dominio regulatorio**: drones de reparto + agentes de seguros, registrados desde la fuente única
>   (`tools/conocimiento/pruebas/extremo.ts`).
> - **Dominio no legal**: `tools/grafo-conocimiento/ejemplos/politica-devoluciones.json`, **ficticio** y marcado como
>   tal, fuera de la fuente única. Tiene vocabulario y frases propios, cita `interna`, una política que cambió con fecha
>   (30 → 15 días) y una exclusión. Conteo fijado.
> - **Oraciones reales, sin payload a mano y sin modelo**: `estructuradorSinModelo` (RF-4 hace opcional el modelo).
>   Resultados:
>   - el incidente de «drones» como oración → regla de la CNSF, con cita;
>   - reparto con drones → Ley de Aviación Civil;
>   - un hecho de 2025 → política de entonces;
>   - H1 sin modelo → «no hay información suficiente»;
>   - fiscal con fecha e importe escritos → llegan al motor.
> - **Empaquetado**: `npm run empaqueta` en verde para los dos paquetes, instalados en un proyecto limpio. El motor con
>   sus 3 entradas y el paquete de conocimiento con `default` y `version`.
> - **Arreglo al empaquetador**: ahora corre el `scripts.build` que declara el paquete, y `tsc` solo si no declara
>   ninguno. Antes fijaba `tsc`, y un paquete de datos quedaba fuera. El motor y el andamio se re-empaquetaron en verde.
> - Suman 69 pruebas del motor y 24 del paquete.
**Objetivo**: drones de reparto + agentes de seguros registrados desde la fuente única, y un dominio
no legal, con el conteo fijado.
**Validación**: una oración real → respuesta natural, sin payload armado a mano. `npm run empaqueta`
del motor y del paquete en verde en un proyecto limpio.

### Fase 7: Aviso de versión nueva (TAR-18)
**Objetivo**: que los consumidores se enteren de una versión nueva del conocimiento sin que nada
cambie solo.
**Validación**: publicar una versión nueva en un ensayo → `vigila:versiones` del consumidor da exit 1
con la deriva, y su pin no se mueve.

### Fase 8: Enrutado desde `AGENTS.md` — CDC (C1)
**Objetivo**: que el decision tree sepa que la herramienta y su fuente existen.
**Validación**: diff, `npm run regresion`, aprobación humana y entrada en `BITACORA-CDC.md`.

### Fase 9: Validación Final
**Objetivo**: la herramienta y su fuente, funcionando de extremo a extremo.
**Validación**:
- [ ] `npm run validate` pasa
- [ ] Criterios de éxito cumplidos
- [ ] Autocrítica escrita: qué puede fallar en producción y cómo quedó (TAR-15)

### Fuera de este PRP — Hermes lee del paquete
Un PRP propio, en el repo de Hermes y con su gate y firma: su `gen_seed_sql.py` lee el paquete
versionado en vez de su `reglas.json`. Hermes es público, así que publicar el paquete hacia allí
es una decisión humana, no un paso de script. Hasta ese PRP, su `reglas.json` queda **ya congelado** desde `97d9f9e` (hermes-os-a2a PR #317, 2026-09-27; `grafo-congelado` es check obligatorio de su `master`).

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

### 2026-09-26: Las memorias del origen no son el origen
- **Error evitado**: decidir con «26 reglas, 54 pruebas» (memorias de Hermes de julio) cuando el
  código tiene 98 y 132.
- **Fix**: medir sobre el corte, no sobre la memoria.
- **Aplicar en**: cualquier traída desde otro repo. Citar el commit, no el recuerdo.

### 2026-09-27: Un campo ausente en el origen no es un campo nulo en el contrato (Fase 1)
- **Error**: la primera validación del seed de Hermes dio 2 errores de esquema. Dos impactos no traen
  la clave `veredicto_base`, y su motor la lee con `.get()`, así que para él vale `None`.
- **Fix**: el contrato exige el campo explícito, y `desdeHermes` hace explícitos los ausentes con el
  mismo significado que les daba el motor de origen (`veredicto_base` y `categoria` → `null`,
  `regimen` → `_meta.regimen_default`). Lo que cambia el significado (las `_bajas`) NO se normaliza:
  sale como problema.
- **Aplicar en**: la migración de la Fase 2 y cualquier importación. Normalizar solo lo que no cambia
  el significado, y demostrarlo con el motor de origen.

### 2026-09-27: Un corpus de paridad crudo es casi todo repetición (Fase 1)
- **Error**: 782 salidas crudas pesaban 2,98 MB: el checklist general de un ámbito se repetía en
  cada keyword.
- **Fix**: salidas únicas más tablas de textos y fuentes (387 KB). El generador **demuestra** que la
  compactación no pierde nada: expande cada caso y lo compara con la salida de Python antes de
  escribir. Sin marca de tiempo, regenerar sin cambios da el mismo archivo.
- **Aplicar en**: la re-generación del corpus al subir el pin, y la comparación de la Fase 3.

### 2026-09-27: Una hora ISO literal tumba verify:gobernanza (Fase 1)
- **Error**: `validate` en rojo, «ningún identificador de caso aparece en el árbol». El verificador busca
  `\bT` + 1-2 dígitos (la forma de los identificadores de casos-trampa, protocolo ciego de C2), y
  `medicion/casos.mjs` construía fechas con una hora ISO literal (la «T» seguida de dos ceros). El mismo
  día le pasó a otra sesión (commit `b3e7656`, pymes).
- **Fix**: `Date.UTC(a, m - 1, d)` en vez de parsear una hora ISO escrita a mano. El corpus salió idéntico.
- **Aplicar en**: cualquier script o texto versionado. Dos sesiones en un día indican que falta documentarlo
  donde muerde (una rule o el mensaje del verificador): queda propuesto como CDC aparte.

### 2026-09-27: Una huella sha256 sin prefijo parece un token, y `validate` antes del commit no lo ve (Fase 1)
- **Error**: la Fase 1 pasó `validate` y se subió. Al commitear la Fase 2, `audita:secretos` marcó tres
  blobs con «hex de 64 sin prefijo (estilo HCLOUD)»: las huellas del corte. El auditor recorre objetos
  **commiteados** de toda la historia, así que el `validate` corrido con los cambios solo en el índice
  no los vio. Mezclado tal cual, `main` habría quedado en rojo para siempre, porque el blob vive en la
  historia aunque luego se corrija el texto.
- **Fix**: `sha256:<hex>`, el convenio del repo para anclas públicas (el patrón excluye lo precedido de
  `:`). Se corrigió el commit de la rama sin mezclar (force-with-lease) para que el blob nunca llegue a
  `main`.
- **Aplicar en**: toda huella versionada. Y correr `audita:secretos` **después** del commit y antes del
  push, no solo `validate` con el índice.

### 2026-09-27: El empaquetador fijaba `tsc` como build (Fase 6)
- **Error**: `npm run empaqueta conocimiento` falló con «tsconfig.json no existe». El empaquetador corría `npx tsc`
  aunque su cabecera prometía «el build que declare el propio paquete», y un paquete de datos no se compila.
- **Fix**: corre `scripts.build` si existe, y `tsc` si no. Las demás herramientas declaran `tsc` y no cambian:
  se re-empaquetaron en verde.
- **Aplicar en**: cualquier herramienta que no sea TypeScript compilado. El contrato del paquete manda sobre el
  supuesto del script.

### 2026-09-26: Borrar una regla retirada reescribe el pasado
- **Error medido en Hermes**: `_bajas` hace `DELETE`; un hecho de 2024 perdió su regla.
- **Fix**: retirar = cerrar `vigente_hasta`.
- **Aplicar en**: todo catálogo con vigencia (extractor, CFDI, ERP).

---

## Gotchas

- [ ] El enum `dudoso` de Hermes mezcla cuatro motivos. Portarlo tal cual pierde RF-6
- [ ] La regla rectora se elige por `vigente_desde` más reciente; con empate decide el orden del seed.
      Hay que fijarlo explícito
- [ ] La clasificación por keyword con frontera de palabra **sin acentos** es parte del contrato: en
      Hermes, «inmobiliario» no casaba «inmueble» y hubo que ampliar el vocabulario
- [x] Un conflicto «intencional» (INTERESES) no se expresa por el mecanismo de conflicto: se expresa
      como una sola regla rectora `dudoso` (hecho en conocimiento 0.2.0, firmado)
- [ ] **Dos fuentes vivas entre la Fase 2 y el PRP de Hermes.** Si Hermes siembra una regla nueva
      después del corte, nace una bifurcación. Resuelto: su `reglas.json` está **ya congelado** desde `97d9f9e` (hermes-os-a2a PR #317, 2026-09-27; `grafo-congelado` es check obligatorio de su `master`), y
      cualquier regla nueva se investiga y siembra **aquí**
- [ ] El `_meta.source_version` de Hermes es un solo texto gigante con la procedencia de todo. Al
      dividir por dominio, cada dominio se queda **su** parte de procedencia; no se pierde ninguna

## Anti-Patrones

- NO importar `businessos/grafo*` como código (stack paralelo, doble fuente de verdad)
- NO consumir el grafo de Hermes desde un derivado (tercero en el camino del veredicto; C4)
- NO reinvestigar las reglas que Hermes ya leyó de fuente primaria
- NO dejar que el parser o el redactor toquen el veredicto
- NO escribir nada de template en Hermes (template es privado y Hermes público). Publicar el paquete
  hacia Hermes es el PRP aparte, con firma
- NO dejar que un proyecto se actualice solo a la versión nueva del conocimiento (RF-16)
- NO borrar ni editar en su sitio una regla ya usada: se cierra y se añade (RF-14)
