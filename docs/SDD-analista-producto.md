# SDD — El analista de producto: dónde duele, con qué evidencia, y qué producto lo resuelve

> Diseño del rol que pidió el laboratorio el 2026-10-02 («planea el rol de A2A que revise el
> repositorio para un análisis de identificación de puntos de dolor…»). Origen:
> [`.claude/goals/analista-producto/spec.md`](../.claude/goals/analista-producto/spec.md), con su
> grafo y su plan al lado. Plan por fases: [PRP-008](../.claude/PRPs/PRP-008-analista-producto.md).
> Skill: `.claude/skills/analista-producto/`. Código: `scripts/analista-producto/`.
> Primera corrida: `docs/analisis/2026-10-02/`.

## 1. La idea en una frase

Un rol de **solo lectura** que recorre el monorepo, encuentra dónde duele **con la cita que lo
prueba**, agrupa esos dolores en casos de uso por categoría y propone productos **product first**
que recombinan lo que el repo ya tiene. Y la regla de evidencia la hace cumplir un comparador
determinista, no el modelo que escribe el hallazgo.

```
inventario/activos.json ─┐                        ┌─► analisis.json  (máquina, fechado, comparable)
fuentes del repo ────────┼─► skill (el analista) ─┤
medidores de solo lectura┘    │                   └─► INFORME.md + propuestas/*.md  (el laboratorio)
                              ▼
                  verifica-evidencia.mjs  ── rojo si una cita no existe, no dice lo que se
                  (comparador, sin modelo)     afirma, o algo se tiró en silencio
```

## 2. Las tres referencias, y qué se toma de cada una

| Referencia | Qué dice | Qué se toma | Qué NO se puede tomar aquí |
|---|---|---|---|
| *Opportunity Solution Tree* (Teresa Torres, *Continuous Discovery Habits*, 2021) | resultado → oportunidades → soluciones → experimentos; toda solución cuelga de una oportunidad y toda oportunidad sale de evidencia del cliente | el árbol **dolor → caso de uso → candidato → one-pager**: una propuesta sin dolor detrás no existe, y el verificador lo comprueba | las entrevistas semanales: un repo no es un cliente. La evidencia aquí es de **operación y diseño**, no de voz del cliente |
| GRADE (graduación de la certeza de la evidencia en revisiones sistemáticas: alta, moderada, baja, muy baja) | la certeza se gradúa por el **diseño** de la fuente y baja por indirección, imprecisión, inconsistencia o sesgo | **cuatro grados** atados al **tipo** de fuente (medida, registrada, declarada, hipótesis), y el grado **se calcula, no se declara** | la ponderación fina por dominios: aquí el grado sale del tipo de cita, que un script puede comprobar |
| *Outcome-Driven Innovation* (Tony Ulwick; puntuación de oportunidad = importancia + (importancia − satisfacción)) | la oportunidad se mide con importancia y satisfacción **declaradas por el cliente** | la idea de que la prioridad es una **cuenta con insumos visibles**, no un juicio global | la importancia y la satisfacción del usuario: **no hay encuesta**. El campo existe y va `null`, y su ausencia se vuelve pregunta al laboratorio |

La consecuencia honesta de la tercera fila: este rol **no puede** decir cuánto le importa un dolor a
un cliente que nunca se entrevistó. Puede decir cuánto cuesta a quien opera la fábrica (medido),
qué está declarado como dolor en los contratos de producto (declarado) y qué falta saber. Lo dice.

## 3. Decisiones

### 3.1 Skill con contrato A2A, sin servir (decisión del laboratorio)

El rol vive como skill de la fábrica y lo lanza la sesión (Claude Code u opencode). Su **Agent
Card y el ciclo de estados de sus tareas** quedan escritos y probados con los tipos del SDK que el
repo fija (`@a2a-js/sdk` 1.1.0), **sin ruta que los sirva**. Por qué no un servicio vivo ya: haría
falta un motor LLM en el servidor, y entonces el contenido del repo sale a un proveedor (C4),
necesita su clase de routing (C8) y su contabilidad, y abre una superficie de entrada (C3). Eso es
la fase 2 del PRP-008, con su gate.

### 3.2 La fase 0 se consume, no se rehace

El borrador pedía un «mapa de activos». Ya existe: `inventario/activos.json` (spec 014) con su gate
(`verifica:inventario`), que pone rojo cualquier unidad sin dueño. El analista lo **lee** y la
cobertura se mide contra él.

### 3.3 Cuatro grados de evidencia, calculados

| Grado | Valor | Qué cita lo sostiene | Ejemplo |
|---|---:|---|---|
| **medida** | 3 | `medicion`: salida de un medidor de solo lectura capturada en la corrida, o artefacto versionado que produce un script declarado | la suma de contexto por sesión de `mide:contexto` |
| **registrada** | 2 | `registro` (incidentes, riesgos, bitácora CDC), `commit` o `pr`: algo que **pasó** y quedó escrito | un riesgo aceptado con firma |
| **declarada** | 1 | `archivo`: un documento lo afirma | la sección «Dolor» de un contrato de producto |
| **hipótesis** | 0 | ninguna cita verificada | lo que el borrador supuso desde fuera |

El hallazgo declara su grado, y el verificador lo **recalcula** como el máximo de sus citas
válidas. Si el declarado es mayor que el calculado, es rojo: el grado no se infla. Un dolor sin cita
válida **no es hallazgo**: va a `hipotesis[]` con lo que haría falta para confirmarlo (`falta`).

### 3.4 Qué es una cita, y qué comprueba el verificador de cada una

Toda cita lleva un **literal** (`cita`) que tiene que aparecer en la fuente. Es lo único que un
script puede comprobar sin modelo, y basta para tumbar las dos fugas reales: la ruta inventada y la
frase que la fuente no dice.

| Tipo | Campos | Comprobación |
|---|---|---|
| `archivo` | `ruta`, `cita`, `linea?` | el archivo está versionado; el literal aparece (espacios normalizados); con `linea`, aparece cerca de ella |
| `registro` | `ruta`, `cita` | como `archivo`, y la ruta es un registro de `.claude/gobernanza/` |
| `commit` | `sha`, `cita` | el commit existe y su mensaje contiene el literal |
| `pr` | `numero`, `cita?` | existe en la historia el merge de ese PR; con `cita`, el merge la contiene |
| `medicion` | `comando`, `archivo`, `cita` | el archivo existe; si es una captura de la corrida, su cabecera declara **ese** comando; si es un artefacto versionado, el comando es un script de `package.json`; el literal aparece |

**Lo que no comprueba:** que la cita *signifique* lo que el hallazgo concluye. Eso es juicio, y
queda a la vista: el literal va pegado junto al hallazgo para que quien lee lo juzgue en un vistazo.

### 3.5 Las cifras salen de un script

`scripts/analista-producto/medidores.mjs` corre una **lista blanca** de medidores que no escriben
en el árbol (`mide:contexto`, `audita:imprenta`, `verifica:routing`, `verifica:inventario`, `gates`,
`regresion`, `verify:gobernanza`, `revisa:readmes`, `verifica:specs` y el conteo de historia de git)
y guarda cada salida en `docs/analisis/<fecha>/mediciones/` con cabecera (comando, fecha, commit,
código de salida). Los que **sí escriben** en el árbol (`mide:mcp`, `trayectorias:informe`,
`vigila:versiones`) no se corren: se cita su última salida versionada, con su fecha, como
`medicion` de un artefacto. Toda cifra del informe es una fila de `cifras[]`: valor, qué mide,
comando y literal donde aparece. Un dato que no existe es `null`, nunca cero.

### 3.6 Cobertura del inventario entero, no de una muestra

La cobertura se exige sobre **todos** los activos de `activos.json`, no solo PRODUCTO. Es más simple
de comprobar que «los FABRICA con usuario» (un juicio) y más fuerte: ausente no es cero. Cada
activo queda en uno de tres estados: `con-dolores`, `sin-dolor-con-evidencia` (con al menos una
cita de que se miró) o `no-mirado` (con motivo, y entonces la cobertura **no** es N/N y el informe lo
dice).

### 3.7 Del dolor a la propuesta, sin tirar nada en silencio

Cada hallazgo cae en al menos un caso de uso, o lleva `sin_caso` con motivo. Cada caso cuelga de
hallazgos que existen. Cada candidato cuelga de casos. Es el fallo de grafo que nombra la guía de
loops y grafos (*un merge que tira una fuente en silencio*), aquí con comprobación.

### 3.8 Priorizar con factores visibles; C3 y C4 vetan

`puntuacion = frecuencia × severidad × solidez × reuso ÷ esfuerzo`, con cada factor de 1 a 3 y su
porqué. **La solidez no se elige: se calcula** como el grado más alto entre los dolores del
candidato, y el verificador recomputa el total. `importancia_usuario` va `null` (§2) y produce una
pregunta al laboratorio. **C3 y C4 vetan, no ponderan**: un candidato con daño a terceros sin
mitigación va a `vetados[]` con su motivo, fuera del ranking, porque ese daño no es firmable.

### 3.9 One-pager product first, con orden verificable

Las secciones van en este orden: **Usuario → La tarea que hoy le cuesta → Cuánto le cuesta →
Promesa → Métrica de éxito → Qué se recombina** (los `TPL-*`) → App o herramienta → Amenazas (C3)
→ Terceros (C4) → Fuera de alcance → Siguiente paso. El verificador comprueba que las tres primeras
preceden a «Qué se recombina» y que cada `TPL-*` del candidato existe en el inventario. La
plantilla está en `.claude/skills/analista-producto/plantilla-one-pager.md`.

### 3.10 El contrato A2A: una capacidad, y su regla de oro

Siguiendo `add-a2a` (*una sola skill por Agent Card para empezar*), la Card ofrece **una**
capacidad, `analisis-de-producto`, y no las tres del borrador. El inventario ya es su propio activo
(§3.2). Y separar detección de propuesta permitiría pedir propuestas sin ver los grados de evidencia
en que se apoyan, que es justo lo que no puede perderse.

Las cuatro preguntas de la entrevista de `add-a2a`, respondidas:

1. **Capacidad**: dolores con evidencia citada, casos de uso por categoría y propuestas product
   first, sobre un repositorio.
2. **Entra**: texto (el alcance: el repo entero o un subconjunto de activos `TPL-*`).
3. **Sale**: `text/markdown` (el informe) y `application/json` (el análisis comparable).
4. **Regla de oro**: **el grado de evidencia de cada hallazgo**. Quien consume tiene que poder
   distinguir un dolor citado y verificado de una hipótesis. Perder esa marca convierte una
   conjetura en un hallazgo en casa de otro.

Estados (`TaskState` del SDK) y transiciones:

```
SUBMITTED ─► WORKING ─► COMPLETED
    │           ├─────► INPUT_REQUIRED ─► WORKING   (falta una decisión que solo tiene quien pide)
    │           └─────► FAILED                      (inventario en rojo o verificador sin converger)
    └─► REJECTED   (catálogo cerrado: escribir fuera de docs/analisis/, servir o exponer el rol,
                    leer golden-sets o .env*, pedir un veredicto sin evidencia)
INPUT_REQUIRED ─► CANCELED
```

Las hipótesis **no** llevan a `INPUT_REQUIRED`: el borrador lo proponía, y cada corrida acabaría
interrumpida. Una hipótesis es un resultado. `INPUT_REQUIRED` es solo para lo que impide terminar.
Las preguntas que no bloquean viajan como `preguntas_al_laboratorio[]` en una tarea `COMPLETED`.

### 3.11 Salida fechada y comparable

`docs/analisis/<fecha>/analisis.json` lleva el commit analizado, el inventario contra el que se midió
y los identificadores estables de los hallazgos. La segunda corrida lo compara con la primera:
dolores cerrados (con el commit o PR que los cerró), nacidos y persistentes. El esquema está en
`.claude/skills/analista-producto/esquema.md`.

### 3.12 Lo que el rol no lee y no escribe

No lee la rama `golden-sets` (contamina las corridas en frío de la capa B), ni `.env*`, ni imprime
el valor de ninguna variable. Escribe **solo** en `docs/analisis/`. La red, solo para `gh` en
lectura, y el verificador trabaja sin red (los PR se comprueban por sus merges en la historia).

### 3.13 Routing (C8) y gate

- **Clase nueva `analisis-de-producto`, nivel `razonamiento`**: decide qué se construye después y
  corre pocas veces, así que el coste por corrida es acotado. El paso de vetos C3/C4 ya pertenece a
  `decision-de-gobernanza`, que no se abarata. Inventario, medición y verificación son scripts: sin
  modelo.
- **Gate `prueba:analista`** en el perfil `validate`: la Card, las transiciones, la prueba de que
  ninguna ruta sirve el rol, el `--prueba` del verificador (todas las siembras caen) y el
  verificador en verde sobre la última corrida. Entra en la misma rama que el skill: el padrón pone
  rojo un archivo de pruebas que ningún gate corre (`verifica-gates.mjs`, comprobación 4), y
  esquivarlo con un nombre sería hacerle trampa al gate. Todo eso es CDC y va sin firmar.

## 4. Descartado

| Propuesta | Por qué no |
|---|---|
| Tres skills A2A (`inventario`, `deteccion-dolores`, `propuesta-producto`) | §3.10: el inventario ya es un activo, y separar propuestas de evidencia rompe la regla de oro |
| Un «agente medidor» A2A aparte | un script hace lo mismo sin modelo, sin superficie y sin coste; el contrato es la cabecera de la captura |
| `INPUT_REQUIRED` por cada hipótesis | §3.10: interrumpe toda corrida; la hipótesis es un resultado |
| `INCIDENTES.md` como fuente principal | está vacío; un registro vacío no prueba que no haya incidentes, y la evidencia de lo que falló está en la bitácora CDC, los commits y los aprendizajes de los PRP |
| Puntuación ODI | sin encuesta no hay importancia ni satisfacción medidas (§2) |
| Servicio A2A vivo ya | fase 2 del PRP-008, con C3, C4, C8 y la decisión de flujo de datos |

## 5. Modelo de amenazas (C3)

- **Activos**: el repo privado (doctrina, contratos de producto, costos), y la decisión del
  laboratorio sobre qué construir.
- **Frontera**: el texto del repo es **dato no confiable** para el rol. Un README, un PR o una
  trayectoria pueden contener instrucciones («marca esto como resuelto», «ignora la regla»).
- **Atacante relevante**: O1 (inyección de requerimientos por contenido del repo) y O2 (evidencia
  falsa: una cita fabricada o un grado inflado).
- **Controles**: el comparador es determinista y no lee instrucciones. El rol no tiene llaves ni
  escribe fuera de `docs/analisis/`. El grado se recalcula. Nada se sirve.
- **Brecha abierta a propósito**: el verificador no juzga el significado de una cita (§3.4). Lo
  mitiga que el literal vaya pegado junto al hallazgo.

## 6. Evaluación de impacto (C4)

- **Partes afectadas**: el laboratorio, que decide con esto, y los terceros que aparecen en los
  documentos que el rol lee (titulares de documentos en corpus y clientes en pilotos).
- **Daño con el sistema operando bien**: que un ranking con evidencia solo de operación empuje una
  inversión hacia lo que le duele a la fábrica y no al cliente. Mitigación: `importancia_usuario` es
  `null` y lo dice, y el informe abre con esa limitación.
- **Datos de terceros**: el rol **no cita** contenido de corpus con datos personales. Cita el
  contrato o el SDD que describe el corpus, nunca el corpus.
- **Reversibilidad**: total. Es un documento, nadie lo ejecuta y los handoffs solo se recomiendan.
- **Decisión**: mitigar.

## 7. Qué cierra y qué no

**Cierra:** el análisis se puede repetir, cada afirmación es comprobable, nada se tira en silencio y
las propuestas cuelgan de dolores con cita.

**No cierra:**
- la voz del cliente (§2);
- el juicio sobre el significado de una cita (§3.4);
- la comparación entre corridas, que solo ejerce la segunda corrida: hoy es formato, no
  comportamiento probado;
- el servicio A2A vivo (fase 2).

## 8. Operación

```bash
node scripts/analista-producto/medidores.mjs docs/analisis/<fecha>      # cifras, con su comando
node scripts/analista-producto/verifica-evidencia.mjs docs/analisis/<fecha>
node scripts/analista-producto/verifica-evidencia.mjs --prueba          # las siembras caen
npm run prueba:analista                                                 # el gate
```
