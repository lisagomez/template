# Estudio de dashboards: reporte del goal (2026-10-20)

Spec: `docs/goals/estudio-dashboards.md` · grafo: `docs/grafos/estudio-dashboards.json` · propuestas para firmar:
`docs/goals/estudio-dashboards-propuestas-firma.md` · evidencia: `docs/goals/estudio-dashboards-medicion/` y
`docs/goals/estudio-dashboards-capturas/`. Datos ficticios (Distribuidora Golfo Norte). Sin push ni PR. El CDC (clase
de routing, prompt `estudio-agente/4`, configuración del modelo y CLI) lo firmó el laboratorio el 2026-10-22, capa A
basta, en la bitácora; lo demás de las propuestas sigue sin firmar.

## Qué existe

- `tools/estudio-dashboards`: el núcleo (sin React, Next, Supabase ni Node; solo `zod`).
  - **Especificación y parches.** Una especificación validada `estudio.dashboard/1` (15 tipos de componente: los 14 del prototipo más `hallazgo`) y parches `estudio.parche/1` con alcance declarado.
  - **Versiones** con deshacer, comparación y oficial.
  - **Catálogo genérico** de MetricFlow, y un **consultor** con límites y caché.
  - **Resolver** que no suma en el cliente.
  - **Análisis de variación**: mezcla y tasa, volumen y precio.
  - **Motor de señales.**
  - **Alertas** sin canal y **propuesta de métrica** como diff.
  - **Superficie de herramientas**, el **agente** (el LLM solo estructura) y el **CLI**.
  - **Subpaths**: `./metricflow` (MetricFlow caliente en un proceso Python del lock), `./openrouter` y `./almacenes/archivo`.
- `tools/estudio-dashboards/laboratorio`: el proyecto dbt `golfo_norte`, igual al zip salvo las rutas por entorno y un target de solo lectura. Trae:
  - `corre.mjs`: hashes, `dbt build`, `mf validate-configs` y la tabla de cifras;
  - `directo.py`: el conteo directo;
  - el segundo catálogo y el recorrido del CLI.
- `tools/estudio-dashboards/evaluacion`: el contrato, el set congelado, su validador y la medición con el LLM real.
- `src/features/estudio-dashboards` y `/laboratorio-estudio-dashboards`: el lienzo. La ruta `/api/estudio-dashboards` cierra con 503 fuera del laboratorio.
- `scripts/estudio-dashboards/recorrido.ts`: los 7 flujos con Playwright y axe.

## Evidencia por punto del HECHO

> **Decisión del laboratorio (2026-10-21), sobre el único punto que no cierra.** Contra el set v1 congelado, analizar
> da 14/16 (87.5 %) en 7 de 8 corridas y 15/16 en una, así que «≥ 90 % por nivel y tipo» no se cumple de forma
> estable. El laboratorio eligió **cerrar con el fallo reportado**, lo que el spec prescribe para este caso: el v1 no
> se relaja, el fallo se reporta por tipo y el punto queda en ámbar. Se descartaron tres alternativas:
> - adoptar el set v2 como set del gate;
> - un set nuevo escrito a ciegas para medir los dos arreglos;
> - arreglar el agente y medir sobre el v1.
>
> El v2, el set nuevo y los arreglos quedan como propuestas (`estudio-dashboards-propuestas-firma.md` §5). Esto es la
> decisión tomada en la conversación, no una firma.

**Datos fijados.**
- Los 7 sha256 (`laboratorio/datos.json`) son iguales a los del spec y a los del zip.
- Regenerar con semilla (numpy 2.5.4, pandas 3.0.6; `gen_data.py` y luego `lifecycle.py`, en una carpeta temporal) da los mismos 7 hashes: reproducible (`regeneracion.json`).
- Los CSV del zip no se tocaron.

**Plano de datos.**
- `dbt build`: «Finished running 12 table models, 45 data tests, 10 view models · PASS=67 WARN=0 ERROR=0».
- `mf validate-configs`: sin errores ni avisos en los siete pasos.
- Lock con hashes: `semantica/requirements.lock`.

**Tabla de cifras** (`cifras.md`): 62 filas.
- 53 con MetricFlow = conteo directo.
- 8 sin métrica en el catálogo, dichas así: combinaciones totales, meses con compra de los establecidos, días entre compras, valor a 6 meses y días en campaña.
- 1 trampa documentada.
- 2 que no cuadran con la propuesta, explicadas.

Nada se ajustó. Las divergencias:

| Cifra | Propuesta | Capa / directo | Por qué |
|---|---|---|---|
| `crecimiento_ventas_yoy_pct` a grano año, ene–sep 2026 | 22.7 | −17.02 / 22.72 | Trampa de la métrica con desfase: a grano año agrega 2025 completo antes de filtrar. A grano mes cuadra (julio: +44.84 en los dos). El Estudio compara periodos con dos consultas y rechaza esa métrica en un KPI de varios meses |
| Retención M+3, todas las cohortes maduras | 70.0 | 72.50 / 72.50 | Ventana: con las cohortes de 2026 da 69.97 (la columna del catálogo de la propuesta dice «ene–sep 2026»); los 66.3 y 82.7 por origen son de todas las cohortes |
| Días entre compras en Mérida | 23 → 42 | 23.77 → 42.51 (directo) | La propuesta trunca; redondeado serían 24 y 43. Sin métrica en el catálogo |
| Valor en 6 meses, campaña y orgánico | 4,636 y 6,730 | 4,635.6 y 6,730.2 (directo, segundo intento) | Ventana no declarada: el primer intento (cohortes observadas 6 meses) dio 4,635.4 y 6,718.3; el segundo (altas hasta marzo de 2026) cuadra. Sin métrica |

**Suites del núcleo.** `npm --prefix tools/estudio-dashboards run prueba`: 50 pruebas, 50 en verde. Incluyen los casos malos que pide el HECHO:
- métrica inventada, dimensión inválida, SQL libre (campo, texto y filtro), fuera de dominio;
- parche que borra o cambia de más;
- deshacer y comparar;
- sin métrica, que lo dice y ofrece proponerla;
- números del texto ⊆ resultados;
- respuestas que llegan desordenadas sin cambiar cifras, avisos ni orden de consultas; dos procesos reales contra uno,
  con el mismo SQL (las tres de `6c6aac4`).

**Señales: 3 de 3 contra la capa real,** sin nombrarlas:
- Oaxaca −44.6 % y Mérida −43.3 % en frecuencia, contra −17.0 % de mediana;
- campaña 66.3 % contra orgánico 82.7 % en retención;
- Tampico +34.8 % con 10 SKU bajo reorden, y Polanco.

La prueba comprueba que ni `src/senales.ts` ni `laboratorio/perfil.json` nombran tiendas, regiones ni segmentos sembrados. Ninguna tarjeta sin evidencia; la cuarta es el aprendizaje del ROAS, real y con la advertencia del baseline.

**Medición con el LLM real.**

Los dos sets:
- **Set v1, el congelado y oficial**: huella `sha256:647b0b27ce23a447b2e99d2b697919e6cf3b393ea4785fe31cce9373e2897676`, commit `734f32f`, anterior al primer prompt (`bc9b066`).
- **Set v2, adjudicado**: un adjudicador INDEPENDIENTE y CIEGO (subagente aparte, sin ver mediciones, código ni respuestas del agente) auditó las 100 preguntas del v1 contra el contrato congelado. Resultado: 94 conformes y 6 corregidas, todas en `alternativas`. Endureció dos (q008, q012) y abrió cuatro ambigüedades reales (q029, q058, q085, q094). El detalle, cláusula por cláusula, está en `evaluacion/ADJUDICACION.md`. Huella `sha256:bafee42d0c520bf391dd7ff8c50a6359a7597abf43372226111a537ed46d22ed`, congelado en `cdf43d6` ANTES de medir sobre él. El v1 no cambió.

Gasto:
- **Total, por la diferencia de saldo de la cuenta: US$1.4797** (1.9635 antes de la primera llamada → 0.4838 al final). Incluye todo: la medición (US$1.3985 en el libro, ninguna llamada sin costo), el lienzo y el CLI (US$0.0802 en 96, ninguna sin costo) y ~US$0.001 de diagnóstico.

| corrida (set) | modelo | razonamiento / proveedor | total | crear | modificar | filtrar | analizar | explicar | alertar | US$ | regeneración p50 / p95 ms | consulta p95 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| voz-corrida1 (v1, `4025151`) | claude-haiku-5.5-20261007 | del proveedor | 95/100 | 14/16 | 19/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0370 | 2624 / 4959 | 35 |
| voz (v1, tras el arreglo de q059) | claude-haiku-5.5-20261007 | del proveedor | 94/100 | 14/16 | 18/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0362 | 2663 / 4685 | 33 |
| voz-corrida3 (v1) | claude-haiku-5.5-20261007 | del proveedor | 95/100 | 15/16 | 18/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0384 | 3011 / 5637 | 81 |
| ligero (v1) | claude-haiku-4.5 | del proveedor | 79/100 | 12/16 | 11/20 | 14/16 | 12/16 | 15/16 | 15/16 | 0.3026 | 3077 / 7610 | 43 |
| capaz (v1) | claude-sonnet-5 | del proveedor | 89/100 (+4/4 reintento por 429 = 93) | 16/16 | 17/20 | 12/16 (+4) | 14/16 | 16/16 | 14/16 | 0.6138 | 4408 / 9157 | 32 |
| voz-sin-razonamiento (v1) | claude-haiku-5.5-20261007 | apagado | 86/100 | 13/16 | 15/20 | 16/16 | 13/16 | 14/16 | 15/16 | 0.0236 | 1723 / 2840 | 31 |
| voz-razonamiento-1024 (v1) | claude-haiku-5.5-20261007 | 1024 propios | 95/100 | 16/16 | 17/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0385 | 4670 / 8073 | 33 |
| voz-razonamiento-512 (v1) | claude-haiku-5.5-20261007 | 512 propios | 95/100 | 16/16 | 17/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0388 | 4698 / 8045 | 32 |
| voz-reserva (v1) | claude-haiku-5.5-20261007 | del proveedor + reserva de 512 si trunca | 95/100 | 15/16 | 18/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0391 | 2872 / 5066 | 35 |
| **voz-reserva-latencia (v1)** | claude-haiku-5.5-20261007 | reserva + proveedor por latencia | **95/100** | 15/16 | 18/20 | 16/16 | **14/16** | 16/16 | 16/16 | 0.0371 | 2935 / 5018 | 33 |
| **voz-reserva-latencia (v2)** | claude-haiku-5.5-20261007 | reserva + proveedor por latencia | **98/100** | 16/16 | 19/20 | 16/16 | 15/16 | 16/16 | 16/16 | 0.0376 | 2773 / 4927 | 33 |
| **voz-reserva-latencia-3procesos (v1, `6c6aac4`)** | claude-haiku-5.5-20261007 | reserva + proveedor por latencia; datos con 3 lectores | **97/100** | 15/16 | 19/20 | 16/16 | **15/16** | 16/16 | 16/16 | 0.0379 | 2806 / **4631** | 33 |
| **voz-reserva-latencia-3procesos (v2, `6c6aac4`)** | claude-haiku-5.5-20261007 | reserva + proveedor por latencia; datos con 3 lectores | **97/100** | 16/16 | 18/20 | 16/16 | 15/16 | 16/16 | 16/16 | 0.0380 | 2750 / **4794** | 32 |

- **La configuración propuesta** (las cuatro últimas filas) es Haiku 5.5, el nivel más barato, con el razonamiento del proveedor, una reserva de 512 tokens de razonamiento propio solo si la respuesta sale truncada y preferencia de proveedor por latencia.
- **Sobre el set v2: 98/100 y 97/100, con los seis tipos ≥ 90 % en las dos corridas** (en la segunda, modificar queda justo en 90.0 %).
- **Sobre el set v1, el congelado y oficial: 95/100 y 97/100.** En la corrida de `6c6aac4` los seis tipos quedan ≥ 90 % (analizar 15/16), pero **no lo atribuyo a ninguna mejora**. El agente (prompt, modelo, configuración y entrada) es idéntico byte a byte; `6c6aac4` solo cambió el camino de datos. Y analizar dio **14/16 en 7 de las 8 corridas de 100 con Haiku 5.5 sobre el v1**, y 15/16 en una. La diferencia es q058, la ambigüedad que abrió el adjudicador: unas veces el modelo filtra Campaña y otras no. Lectura honesta: **sobre el v1, analizar está entre 87.5 y 93.8 % según la corrida; el gate por tipo pasa a veces, no siempre.** Contra el v2 pasa en las dos corridas. Adoptar el v2 es decisión del laboratorio: se firma o no. El v1 no se relajó, y el agente no se tocó para pasarlo (ver «Dos mejoras vistas en la retenida, a propósito SIN aplicar»).
- **Fallas que quedan en el v2**: q027 y q059.
  - q027 (modificar): el esperado cuenta el eje de tiempo de una línea como dimensión. El adjudicador lo tuvo por conforme.
  - q059 (analizar): el set espera analizar `crecimiento_ventas_yoy_pct`. El motor rechaza descomponer una métrica con desfase sobre un periodo y el agente corrige a `ventas_netas`.
- **Latencia**:
  - Consulta a la capa en frío: p95 31–81 ms, **< 3 s: cumple**.
  - Regeneración con la configuración propuesta y un solo proceso de MetricFlow: p95 4.93 s (v2) y 5.02 s (v1), **5.02 s juntando las 200** (11 de 200 arriba de 5 s), en el umbral.
  - **Con tres lectores (`6c6aac4`): p95 4.63 s (v1) y 4.79 s (v2), 4.67 s juntando las 200 (6 de 200 arriba de 5 s): < 5 s, cumple.** Lo que bajó es el lado de datos y se puede atribuir: al filtrar, datos p50 530 → 208 ms; en analizar, lo que no es modelo p50 735 → 243 ms; las cifras, avisos y SQL son idénticos (banco en §Decisiones). Las que siguen arriba de 5 s son puro modelo (q049: 6.1 s de modelo), y la cola del modelo es la que manda: un día de red peor la puede subir.
  - Con el razonamiento apagado: 2.8 s, al costo de bajar a 86 %.
  - Juntando las 400 regeneraciones de Haiku con razonamiento del proveedor (cuatro corridas), la p95 es 5.13 s.

**Capturas con Playwright** (`docs/goals/estudio-dashboards-capturas/`, `recorrido.json`): los 7 flujos en
escritorio (1440×900) y celular (390×844), con el agente real. Se repitieron sobre `6c6aac4`, con el lienzo ya en
tres lectores: 14 de 14 pasos en 120 s.
- Flujo 1: antes, «lo que entendí» y después.
- Flujo 2: por mes y comparado con 2025, sobre la gráfica recién creada.
- Flujo 3: mapa arrastrado y acercado, lazo en Mérida más clic en Oaxaca, el tablero filtrado y «¿por qué estas
  bajaron?» con su hallazgo.
- Flujo 4: procedencia con definición, dueño, filtros y SQL compilado.
- Flujo 5: volver a la v1 y comparar la v1 con la v5.
- Flujo 6: ciclo detectar → aprender con las tarjetas enlazadas en el mapa (en celular, como lista bajo el mapa).
- Flujo 7: NPS sin métrica.

Resultado: 0 peticiones externas, 0 errores de consola y **axe con 0 violaciones serias o críticas** en las dos
vistas (WCAG 2.2 AA).

**CLI** (`recorrido-cli.md`): los 12 subcomandos y `agente` contra la capa real.
- El seco es la opción por defecto, y en seco no se escribe nada.
- Códigos de salida: 2 uso, 3 métrica inventada, 3 SQL libre, 3 alerta sin confirmar, 4 sin capa y 5 sin llave.
- La paridad CLI = núcleo la prueba `pruebas/cli.ts`, sin capa y contra la capa real.
- Grado: no medido.

**Portabilidad** (`segundo-catalogo.json`): la capa de soporte-sap tal cual. `dbt build` PASS=53, 38 métricas listadas, un tablero armado solo desde el catálogo, válido y resuelto con datos, y `git diff` del núcleo vacío.

## Decisiones (qué y por qué)

- **El nivel `voz` con su «para» ampliado, y no un nivel nuevo** (decisión del laboratorio, 2026-10-22, firmada con
  el CDC): el «para» describía conversación por voz de una a tres frases y esta clase devuelve un plan en JSON. Un
  nivel `estructurar` con el mismo modelo exigía tocar el tipo `Nivel` y duplicar precio, medición y alternativa
  abierta. El modelo, su precio y su medición no cambiaron.
- **DuckDB y no Postgres**: el SQL del zip es DuckDB. Portarlo era riesgo puro (cada `strftime`, `date_diff` e
  `interval`). Lock nuevo con dbt-duckdb 1.11.0 y duckdb 1.5.5 y las mismas versiones de la casa, más dbt-postgres
  para servir también al segundo catálogo.
- **MetricFlow caliente en un proceso Python** (API `MetricFlowEngine`) en vez de `mf query` por CLI o un compilador
  propio. El CLI paga ~3 s de arranque por consulta; el proceso, 0.1 s. Un compilador propio sería reimplementar la
  capa. El núcleo solo ve un puerto (`PuertoSemantico`).
- **El LLM solo estructura** (el patrón de `grafo-conocimiento`): el plan dice tipo y «lo que entendí». Solo
  MODIFICAR trae operaciones; crear, filtrar, analizar, explicar y alertar los arma el núcleo. Así no escribe cifras
  ni SQL, y el 90 % mide comprensión, no la sintaxis de un JSON largo.
- **Parches con alcance y tres cerrojos contra el merge silencioso**: operaciones por tipo, lo tocado ⊆ lo declarado
  y los componentes no tocados idénticos byte a byte.
- **Comparar con el año anterior = dos consultas**, nunca la métrica con desfase sobre un periodo: lo enseñó la
  tabla de cifras (−17 % contra +22.7 %).
- **Umbrales de señales estadísticos y declarados**: z robusto 3, brecha 10 pp o 15 %, mediana y p75. El perfil solo
  asigna métricas a palancas y dimensiones de recorrido («por tienda, cohorte y origen», del spec).
- **La geografía no es cifra**: las coordenadas vienen de `tiendas.csv` y la rejilla del prototipo, en
  `geografia.json`. La cobertura queda apagada porque la capa no tiene ese dato.
- **CLI y no MCP**: lo decidió el laboratorio (CLI-first: un MCP se paga en cada sesión).
- **Versiones en archivo** (`~/.estudio-dashboards/`): Supabase está pausado y el núcleo no lo conoce.
- **Iteración del prompt solo contra la partición de desarrollo**. Se reporta la retenida aparte: 92.9–94.3 % según
  la corrida.
- **Tres lectores de MetricFlow y el tablero pide en paralelo** (`6c6aac4`): el resolver consultaba componente por
  componente contra un solo proceso, y al filtrar un tablero se iban ~0.5 s en datos. Ahora las consultas salen juntas
  y se registran en el orden en que se piden; el adaptador reparte entre N procesos sobre el destino de solo lectura
  (DuckDB admite varios lectores) y el consultor junta la misma consulta pedida a la vez. Banco sin LLM (los tres
  tableros, cuatro filtros, caché caliente): datos p50/máx **354/500 ms con 1 proceso → 141/193 ms con 3 → 112/145 ms
  con 4**, con la **misma huella de cifras, avisos y SQL** (`0c4054f74621eed7`) en las tres. Elegí 3: cada proceso
  ocupa 178–212 MB de RSS (~570 MB los tres, `ps`), y el cuarto ya rinde poco. El CLI se queda en 1 (arranca por cada orden). No toca al agente: su entrada y
  su prompt son los mismos byte a byte.

## Formas en que esto podría estar mal o incompleto

Las que se resolvieron:
- **El puntuador aplicaba la regla general del contrato a todos los tipos**; la tabla del contrato fija qué se
  compara por tipo. Se corrigió el puntuador (no el set) tras la primera corrida de desarrollo, y queda dicho aquí.
- **Truncado del plan** por razonamiento oculto: se mide y se fija explícito.
- **Lectores bloqueados por DuckDB**: target de solo lectura.
- **Orden de filas no determinista**: el adaptador ordena.
- **El lazo y los botones del mapa no recibían el clic.**
- **Contraste y semántica de listas** según axe.

Las que siguen abiertas:
- **Umbrales vistos con los datos**: fijé los umbrales de señales después de mirar la distribución por tienda. Son
  estadísticos de manual, pero es posible que otro umbral igual de razonable deje fuera a Polanco o meta otra
  tienda. No se probó el motor contra un catálogo con señales distintas.
- **El set** tiene al menos cuatro esperados discutibles (§Medición). Con un set v2 adjudicado, modificar y
  analizar podrían pasar el 90 %, o no: no se sabe y no se supuso.
- **Variación entre corridas**: 94–95/100 en el v1 con configuraciones equivalentes. Seis corridas no son una
  distribución.
- **El set v2 se pidió después de ver resultados.** El adjudicador fue ciego (no vio mediciones ni respuestas) y
  auditó las 100 preguntas, no solo las fallas; endureció dos y abrió cuatro. Aun así, el disparo vino de mirar las
  fallas: por eso el v1 sigue siendo el oficial y el v2 es una propuesta para firmar.
- **Latencia**: con tres lectores, p95 4.63 y 4.79 s (4.67 s juntas), ~0.33 s bajo el umbral. El margen lo dio el lado
  de datos; la cola la pone el modelo (las 6 de 200 arriba de 5 s son modelo puro), y un día de red peor la sube.
- **El gate por tipo sobre el v1 depende de la corrida**: analizar 14/16 en 7 de 8 corridas y 15/16 en una, con el
  agente idéntico. Ocho corridas no son una distribución, pero bastan para no presentar la que pasa como la regla.
- **Preferencia de proveedor por latencia**: OpenRouter elige entre Anthropic, Bedrock, Vertex y Azure para el mismo
  modelo pineado. Con datos ficticios no importa; con datos reales, a qué nube va el dato es una decisión C4.
- **CREAR frente a MODIFICAR es ambiguo** en «Muéstrame margen por región…»: el agente lo lee de una forma u otra
  entre corridas. Las dos son válidas; el recorrido de Playwright arranca el flujo 3 de un tablero reiniciado para no
  depender de cuál eligió.
- **«Lo que entendí» para MODIFICAR** declara métricas y dimensiones del componente tocado. Es una convención del
  prompt que el contrato no fija con precisión, y es el origen de las fallas de dimensiones.
- **Dos mejoras vistas en la retenida, a propósito SIN aplicar.** Mirando las fallas del v1 aparecen dos arreglos de
  sistema razonables: que el núcleo complete «lo que entendí» con el eje de tiempo de la línea que toca (q020, q027), y
  que «¿por qué cayó el crecimiento…?» se responda descomponiendo la métrica base contra el año anterior en vez de
  rechazar la métrica con desfase (q059). No los hice: los motivan preguntas de la partición RETENIDA, y aplicarlos
  para volver a medir sobre ella convierte la muestra retenida en una de ajuste. El 90 % saldría, pero ya no
  significaría lo que el spec quiere que signifique. Se aplican cuando haya una muestra que no los motivó (un set
  nuevo que encargue el laboratorio, escrito a ciegas y congelado antes), y se miden ahí.
  Una vez SÍ toqué el sistema por una pregunta retenida, y lo digo: `07140f2` (q059). Era un error de cifra, no de
  precisión. Totalizar la métrica con desfase sobre un periodo compara contra el año anterior completo, y ahora se
  rechaza con la métrica base como sugerencia. La precisión no subió con ese cambio (95 → 94 en la corrida siguiente).
- **Mezcla y tasa en el análisis**: un segmento que no existía antes se compara contra la tasa global anterior. Es
  shift-share estándar, pero el texto puede decir «efecto mezcla 0.0» en un cambio de composición total, como
  julio. Es correcto y poco intuitivo.
- **La matriz de puntos** usa la rejilla del prototipo (celdas de 0.3°), no el marco geoestadístico del INEGI.
- **Las 8 cifras «sin métrica»** del growth por área (meses con compra, días entre compras, valor a 6 meses) solo
  salen del conteo directo. Si la dirección las quiere en el tablero, son métricas por proponer.
- **El componente `medidor`** se dibuja como KPI con meta, no como medidor circular.
- **El recorrido de Playwright tuvo una corrida con un clic intermitente** en celular; las corridas siguientes
  pasaron 14/14.

## Post-mortem

1. **Razonamiento oculto que se come el tope.** Haiku 5.5 en OpenRouter razona por omisión dentro de `max_tokens`:
   1,182 de 1,200 tokens, y el plan salió truncado en una instrucción de dos gráficas. La medición del set casi no
   lo vio (instrucciones más cortas); el lienzo sí. *Regla propuesta*: todo adaptador de LLM declara el razonamiento
   (tope propio o apagado), y la medición se repite con esa configuración. Ya lo decía `sistema-integrado` para Opus 5:
   faltaba aplicarlo por omisión.
2. **El desfase anual a grano año miente.** `crecimiento_ventas_yoy_pct` sobre ene–sep compara 9 meses contra 12. Lo
   cazó el conteo directo, no una prueba. *Regla*: toda métrica con desfase se valida contra un conteo directo a su
   grano y a un grano mayor antes de entrar a un tablero.
3. **DuckDB admite un solo escritor.** `node --test` corre archivos en paralelo y dos MetricFlow se bloquearon sin
   error visible (colgados). *Regla*: los consumidores de una capa DuckDB abren en solo lectura (`access_mode:
   READ_ONLY` en un target aparte).
4. **Sin ORDER BY no hay orden.** La paridad CLI = núcleo falló por orden de filas con valores iguales. El adaptador
   ordena por las columnas de agrupación.
5. **`setPointerCapture` en el contenedor se traga el clic de sus botones.** Los botones del mapa no funcionaban; el
   recorrido de Playwright lo cazó, no una prueba unitaria.
6. **Un canario que lee el catálogo da falso positivo.** La etiqueta de una métrica del YAML coincidía con una
   pregunta. El canario vigila el texto redactado; el catálogo es insumo compartido por diseño.
7. **Leer un contrato a medias.** El puntuador aplicó la regla general y no la tabla por tipo; costó una corrida de
   desarrollo darse cuenta. *Regla*: el puntuador se prueba contra el contrato con casos sintéticos antes de la
   primera corrida.
8. **Los tipos de Next exigen `NODE_ENV`** en todo `env` de `spawn` dentro de `tools/` (el typecheck raíz los
   incluye): se pasa explícito.
9. **El validate lo detuvo el sistema por falta de memoria** a la mitad de `prueba:tools` (con el servidor de
   desarrollo apagado, por presión de memoria de la máquina). Se volvió a correr completo en primer plano tras el
   último commit.
10. **Un sha256 suelto parece un token.** `audita:secretos` recorre TODA la historia y marca cualquier hex de 64 sin
   el ancla `sha256:` (estilo de los tokens de Hetzner). El primer `validate` completo quedó en rojo por las huellas
   de los CSV, del zip y del set. Arreglo: la convención de la casa (`sha256:<hex>`) en datos, código y evidencias, y
   la historia de esta rama local (sin push) reescrita con `git filter-branch`, con un filtro de árbol que solo
   antepone el ancla. Se conservó el orden de los commits, y el set sigue antes del primer prompt. Hashes de commit,
   viejo → nuevo: `87b773c→4e2f520` (datos) · `f6e42aa→734f32f` (set congelado) · `fe50e03→a2ce3f9` (núcleo) ·
   `ed2ec09→bc9b066` (primer prompt) · `4ce44ac→4025151` (prompt /3) · `b368064→07140f2` · `b4787c6→13471a3`
   (medición) · `db1c473→1b4a2a1` · `abfa14d→e0e350a` · `77781fc→6c39579` · `50c4676→45d4420` · `f15778d→bdbe18d`.
   *Regla propuesta*: toda huella que entra al repo lleva el ancla `sha256:` desde el primer commit.
11. **Medí la latencia del modelo seis veces antes de mirar la de los datos.** Probé razonamiento, reserva y
   proveedor para bajar la regeneración, y el lado de datos llevaba medio segundo al filtrar porque el tablero
   consultaba componente por componente contra un solo proceso. Partir `regeneración = modelo + datos` por tipo lo
   enseñó en un minuto (`datosMs` ya estaba en la medición). *Regla propuesta*: antes de optimizar una latencia,
   repartirla por tramo y por tipo, y atacar primero el tramo determinista (no cuesta llamadas ni mueve la precisión).
12. **La tentación de arreglar lo que falló en la retenida.** Con el gate del v1 en 87.5 % aparecieron dos arreglos
   razonables, los dos sacados de preguntas retenidas. Aplicarlos y volver a medir sobre la misma partición habría
   dado el 90 % y vaciado su significado. Quedan sin aplicar y dichos (§Formas en que esto podría estar mal).
   *Regla propuesta*: un arreglo motivado por la partición retenida se mide en una muestra nueva, nunca en la que lo
   motivó.
