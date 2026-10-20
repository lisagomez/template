# Estudio de dashboards: reporte del goal (2026-10-20)

Spec: `docs/goals/estudio-dashboards.md` · grafo: `docs/grafos/estudio-dashboards.json` · propuestas para firmar:
`docs/goals/estudio-dashboards-propuestas-firma.md` · evidencia: `docs/goals/estudio-dashboards-medicion/` y
`docs/goals/estudio-dashboards-capturas/`. Datos ficticios (Distribuidora Golfo Norte). Sin push, PR ni firmas.

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

**Suites del núcleo.** `npm --prefix tools/estudio-dashboards run prueba`: 46 pruebas, 46 en verde. Incluyen los casos malos que pide el HECHO:
- métrica inventada, dimensión inválida, SQL libre (campo, texto y filtro), fuera de dominio;
- parche que borra o cambia de más;
- deshacer y comparar;
- sin métrica, que lo dice y ofrece proponerla;
- números del texto ⊆ resultados.

**Señales: 3 de 3 contra la capa real,** sin nombrarlas:
- Oaxaca −44.6 % y Mérida −43.3 % en frecuencia, contra −17.0 % de mediana;
- campaña 66.3 % contra orgánico 82.7 % en retención;
- Tampico +34.8 % con 10 SKU bajo reorden, y Polanco.

La prueba comprueba que ni `src/senales.ts` ni `laboratorio/perfil.json` nombran tiendas, regiones ni segmentos sembrados. Ninguna tarjeta sin evidencia; la cuarta es el aprendizaje del ROAS, real y con la advertencia del baseline.

**Medición con el LLM real.**
- Set `evaluacion/set-referencia.json`, sha256 `sha256:647b0b27ce23a447b2e99d2b697919e6cf3b393ea4785fe31cce9373e2897676`. Lo congela el commit `f6e42aa`, anterior al primer prompt (`ed2ec09`).
- Gasto medido por llamada: **US$1.2087 en 984 llamadas, ninguna sin costo** (`llamadas.jsonl`).
- Saldo de la cuenta: **1.9635 antes de la primera llamada → 0.7534 después de la última medición**.
- Aparte, el lienzo gastó US$0.0409 en 55 llamadas (`~/.estudio-dashboards/golfo-norte/gasto.jsonl`).

| corrida | modelo | razonamiento | total | crear | modificar | filtrar | analizar | explicar | alertar | US$ | modelo p50 ms | regeneración p50 / p95 ms | consulta p95 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| voz-corrida1 (`4ce44ac`) | claude-haiku-5.5-20261007 | del proveedor | 95/100 | 14/16 | 19/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0370 | 2549 | 2624 / 4959 | 35 |
| voz (tras el arreglo de q059) | claude-haiku-5.5-20261007 | del proveedor | 94/100 | 14/16 | 18/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0362 | 2446 | 2663 / 4685 | 33 |
| voz-corrida3 | claude-haiku-5.5-20261007 | del proveedor | 95/100 | 15/16 | 18/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0384 | 2683 | 3011 / 5637 | 81 |
| ligero | claude-haiku-4.5 | del proveedor | 79/100 | 12/16 | 11/20 | 14/16 | 12/16 | 15/16 | 15/16 | 0.3026 | 2900 | 3077 / 7610 | 43 |
| capaz | claude-sonnet-5 | del proveedor | 89/100 (+4/4 reintento por 429 = 93) | 16/16 | 17/20 | 12/16 (+4) | 14/16 | 16/16 | 14/16 | 0.6138 | 4130 | 4408 / 9157 | 32 |
| voz-sin-razonamiento | claude-haiku-5.5-20261007 | apagado | 86/100 | 13/16 | 15/20 | 16/16 | 13/16 | 14/16 | 15/16 | 0.0236 | 1594 | 1723 / 2840 | 31 |
| voz-razonamiento-1024 | claude-haiku-5.5-20261007 | 1024 | 95/100 | 16/16 | 17/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0385 | 4507 | 4670 / 8073 | 33 |
| **voz-razonamiento-512 (propuesta)** | claude-haiku-5.5-20261007 | 512 | **95/100** | 16/16 | 17/20 | 16/16 | 14/16 | 16/16 | 16/16 | 0.0388 | 4503 | 4698 / 8045 | 32 |

- **≥ 90 % en total: sí**, con Haiku 5.5 (el nivel más barato). **Por tipo: no.** En la configuración propuesta,
  modificar queda en 85 % y analizar en 87.5 %. **Ningún nivel medido pasa los seis tipos.** Opus 5 no cabía en el tope
  (estimado ~US$1.5 con el acumulado en 1.07) ni en el saldo de la cuenta. El set no se relajó.
- **Fallas persistentes** (leídas después de congelar el prompt; no se iteró contra la partición retenida):
  - q021 y q027 (modificar): el esperado cuenta el eje de tiempo implícito de una línea como dimensión. El
    contrato dice «si la instrucción lo pide», y ninguna de las dos lo pide.
  - q020 (modificar): pide «por mes» y el agente no lo declaró. **Falla real del agente.**
  - q059 (analizar): el set espera analizar `crecimiento_ventas_yoy_pct`. El motor rechaza descomponer una métrica
    con desfase y el agente corrige a `ventas_netas`: choque entre el set y la semántica de la capa.
  - q058 (analizar): «campaña frente a orgánicos» es eje de comparación o filtro; ambigua.
  - Las demás fallas varían entre corridas (q004, q006, q012…): el modelo no es determinista ni a temperatura 0.
- **Latencia**: la consulta a la capa en frío, p95 31–81 ms: **< 3 s, cumple**. La regeneración (modelo,
  validación y datos con caché caliente) p95: 4.7–5.6 s con el razonamiento del proveedor, 8.0 s con el
  propuesto y 2.8 s apagado. **El objetivo de < 5 s p95 no se cumple con la configuración que da 95 %**;
  apagado sí se cumple, pero baja a 86 %. Es una decisión del laboratorio.

**Capturas con Playwright** (`docs/goals/estudio-dashboards-capturas/`, `recorrido.json`): los 7 flujos en
escritorio (1440×900) y celular (390×844), con el agente real.
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
- **Variación entre corridas**: 94–95/100 con la misma configuración. Tres corridas no son una distribución.
- **Latencia**: la configuración precisa no cumple los 5 s p95.
- **«Lo que entendí» para MODIFICAR** declara métricas y dimensiones del componente tocado. Es una convención del
  prompt que el contrato no fija con precisión, y es el origen de las fallas de dimensiones.
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
