# Propuesta: Estudio de Dashboards con Agente

Oct 19, 2026 · @lisa

## Resumen ejecutivo

Proponemos construir el **Estudio**: un lienzo de dashboards interactivos donde un agente de IA crea y regenera cada vista a partir de instrucciones en lenguaje natural, siempre sobre métricas gobernadas por un modelo semántico y transformaciones en dbt. Su eje es el growth: cada vista se conecta con una palanca de crecimiento (adquisición, frecuencia, retención o ticket) y el margen funciona como guardarraíl.

Hoy un cambio de dashboard ("quiero ver margen por región, sin mayoreo") depende de un analista y tarda días. En el Estudio el usuario lo pide en una frase, el agente propone el cambio, lo muestra en segundos y deja trazabilidad de qué métrica y qué consulta lo produjo.

- **Resultado esperado en 16 semanas:** MVP con 3 fuentes conectadas, 15 métricas certificadas, mapa interactivo y agente que regenera dashboards con precisión ≥ 90 % en un set de 100 preguntas de prueba.
- **Diferenciador:** el agente no escribe SQL libre contra tablas crudas; consulta la capa semántica, así que "ventas" o "margen" significan lo mismo en cada vista.
- **Prueba de concepto incluida:** un prototipo navegable con datos dummy de una distribuidora ficticia (21 tiendas, 165 mil pedidos, 22 mil clientes) y un proyecto dbt de ejemplo.

Todas las cifras de este documento salen de datos dummy generados para la propuesta; no representan a ninguna empresa real.

## Enfoque growth transversal

El Estudio es una herramienta de growth para todo el negocio: un solo modelo de cómo crece la empresa, compartido por Comercial, Marketing, Lifecycle, Operaciones, Finanzas y Digital, para que cada área optimice el crecimiento total y no una métrica aislada. Con los datos dummy, la conclusión central es que **2026 crece por más clientes, no por clientes más fieles**: los clientes activos suben 46.9 % mientras la frecuencia de compra cae 18.0 %.

**North star y guardarraíl.** La métrica norte es **ventas netas**, descompuesta en palancas que alguien puede mover. El guardarraíl es el **margen bruto ≥ 23 %**: ningún experimento se da por ganado si lo rompe.

&#91;embedded content: datos dummy · fct\_ventas\_lineas y fct\_clientes\_mes, ene–sep 2026 vs 2025\]

Ventas netas = clientes activos × frecuencia × ticket (14,234 × 5.1 × MXN 1,027). La frecuencia y la retención son las palancas en rojo: ahí se concentra el backlog de experimentos.

**Growth por área: qué pregunta responde cada equipo y qué ve hoy el agente en los datos**

| Área | Pregunta de growth | Métricas guía | Señal en los datos dummy | Guardarraíl |
| --- | --- | --- | --- | --- |
| Comercial | ¿Qué tiendas crecen por clientes y cuáles se están vaciando? | crecimiento comparable, frecuencia por tienda | En Mérida y Oaxaca los clientes establecidos compran en 28–30 % menos meses; en Mérida pasan de 23 a 42 días entre compras | margen por tienda |
| Marketing | ¿A qué calidad adquirimos clientes? | clientes nuevos, retención a 3 meses por origen, ROAS incremental | 70 % de los clientes nuevos llegan en meses de campaña; retienen 66.3 % vs 82.7 % de los orgánicos y valen MXN 4,636 vs 6,730 en sus primeros 6 meses | costo por cliente nuevo |
| Lifecycle / CRM | ¿Quién está por irse y quién puede volver? | perdidos, reactivados, frecuencia | Ene–sep 2026: 20,134 salidas mensuales de clientes contra 10,710 reactivaciones | margen tras incentivos |
| Operaciones y merchandising | ¿El inventario sostiene la demanda? | tienda-SKU bajo reorden en tiendas que crecen | Tampico crece 34.8 % con 10 de 35 SKU bajo punto de reorden; Polanco tiene 7 | días de inventario |
| Finanzas | ¿El crecimiento es rentable? | margen %, ROAS incremental, ventas por cliente | Margen −0.9 pp; Hot Sale 2026 con ROAS incremental de −0.17× | margen ≥ 23 % |
| Digital | ¿El canal digital crea clientes más valiosos? | participación e-commerce, retención por canal de adquisición | Participación digital de 7.3 % a 10.0 %, pero su retención es similar a la de tienda | ticket promedio |

**Ciclo que corre el agente (detectar → diagnosticar → actuar → aprender):**

1. **Detectar.** Cada noche revisa cambios en frecuencia, retención, valor y riesgo por tienda, cohorte y origen; publica una tarjeta "vigilando" cuando un cambio supera su umbral.
2. **Diagnosticar.** Consulta la capa semántica para separar causas (nuevos vs recurrentes, precio vs volumen, campaña vs orgánico) y redacta una hipótesis con cifras.
3. **Actuar.** Propone un experimento con métrica guía, guardarraíl, población y duración; el dueño del área lo aprueba antes de lanzarlo.
4. **Aprender.** Lee el resultado, lo registra en el catálogo de aprendizajes y ajusta umbrales o reglas de presupuesto.

En el prototipo, estas tarjetas aparecen en el mapa enlazadas a sus tiendas y en un tablero de cuatro columnas.

**Backlog de experimentos priorizado (ICE: impacto, confianza, facilidad de 1 a 10)**

| Experimento | Área | Palanca | Métrica guía | Guardarraíl | I | C | F | ICE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cupón de segunda compra en lugar de 10 % en la primera | Marketing | retención | retención a 3 meses | costo por cliente nuevo | 8 | 7 | 8 | 7.7 |
| Recordatorio de recompra al día 15 en Mérida y Oaxaca | Lifecycle | frecuencia | frecuencia de compra | margen bruto % | 6 | 7 | 9 | 7.3 |
| Reabasto priorizado en Tampico y Polanco | Operaciones | ventas atendidas | ventas netas | días de inventario | 6 | 8 | 7 | 7.0 |
| Presupuesto por categoría estacional en vez de descuento general | Marketing y Finanzas | eficiencia de inversión | ROAS incremental | margen bruto % | 7 | 6 | 6 | 6.3 |
| Programa de recompra en la app | Digital | frecuencia digital | retención de clientes e-commerce | ticket promedio | 7 | 4 | 4 | 5.0 |

Nota de método: los clientes que ya compraban en enero de 2025 (primer mes de datos, 3,395) se tratan como base inicial y no cuentan como nuevos ni como cohorte.

## Escenario con datos dummy

El piloto usa **Distribuidora Golfo Norte**, una cadena ficticia de abarrotes y consumo con sede en Veracruz, 21 tiendas en 5 regiones de México y tres canales: Tienda, E-commerce y Mayoreo. Los datos cubren de enero 2025 a septiembre 2026 y se generaron con semilla fija para que cualquier prueba sea reproducible.

| Tabla cruda | Filas | Grano | Columnas clave |
| --- | --- | --- | --- |
| raw\_lineas\_pedido | 520,825 | una línea de producto por pedido | pedido\_id, producto\_id, cantidad, precio\_unitario, descuento\_pct, costo\_unitario |
| raw\_pedidos | 165,515 | un pedido | pedido\_id, fecha, tienda\_id, cliente\_id, canal, campana\_id, estatus |
| raw\_clientes | 21,938 | un cliente con cohorte y origen de adquisición | cliente\_id, segmento, tienda\_preferida, fecha\_alta, canal\_adquisicion, campana\_adquisicion |
| raw\_inventario | 735 | tienda × producto al 30-sep-2026 | existencias, punto\_reorden |
| raw\_productos | 35 | un SKU | categoria (6), precio\_lista, costo\_unitario |
| raw\_tiendas | 21 | una tienda | region, estado, lat, lon, fecha\_apertura, m2 |
| raw\_campanas | 6 | una campaña de marketing | plataforma, inicio, fin, inversion\_mxn |

El generador incluye patrones realistas para que el agente tenga algo que descubrir: estacionalidad (picos en noviembre y diciembre), fines de semana más fuertes, e-commerce que crece más rápido que tienda, dos aperturas en 2025 (Cancún y Querétaro), descuentos del 10 % durante campañas 2.5 % de pedidos devueltos y un ciclo de vida de clientes (adquisición, frecuencia y abandono) con tres señales sembradas para el agente de growth: clientes establecidos que compran menos en el Sureste, clientes de campaña que abandonan antes y una tienda que crece sin inventario.

**Foto de enero a septiembre 2026 frente al mismo periodo de 2025** (pedidos completados, ventas netas de descuento):

| Indicador | Ene–Sep 2025 | Ene–Sep 2026 | Variación |
| --- | --- | --- | --- |
| Ventas netas (MXN) | 60.7 M | 74.5 M | +22.7 % |
| Ventas tiendas comparables (19 tiendas) | — | — | +18.5 % |
| Margen bruto | 24.8 % | 23.8 % | −0.9 pp |
| Pedidos | 60,283 | 72,554 | +20.4 % |
| Ticket promedio (MXN) | 1,007 | 1,027 | +2.0 % |
| Clientes activos | 9,692 | 14,234 | +46.9 % (frecuencia de 6.2 a 5.1 pedidos por cliente, −18.0 %) |
| Combinaciones tienda-SKU bajo punto de reorden | — | 119 de 735 | — |

## Experiencia de usuario

El usuario trabaja en un solo lienzo con tres zonas: la barra de instrucciones arriba, el dashboard al centro y el panel de contexto a la derecha (métrica, definición, consulta generada e historial de versiones).

**Flujo típico de una sesión:**

1. El usuario escribe: *"Muéstrame margen por región en 2026, sin mayoreo, y resalta las tiendas debajo del 23 %"*.
2. El agente responde en el panel con lo que entendió (métrica `margen_bruto_pct`, dimensión `region`, filtro `canal != Mayoreo`, periodo 2026) y regenera el dashboard en menos de 5 segundos.
3. El usuario ajusta con otra frase (*"ahora por mes y compáralo con 2025"*) o directamente con clics: filtros, orden, tipo de gráfica.
4. Cada cambio queda como versión; el usuario puede volver atrás, comparar dos versiones o fijar una como oficial y compartirla.

**Mapa interactivo.** El mapa de tiendas es un componente de primera clase: se puede arrastrar, hacer zoom y seleccionar tiendas o regiones con clic o con lazo. La selección filtra todo el dashboard y el agente la entiende como contexto (*"¿por qué estas tres bajaron?"*). Su estilo es de instrumento: matriz de puntos oscura, tiendas como nodos cuadrados y tarjetas de señal (vigilando, hipótesis, experimento) unidas con líneas a las tiendas que las originan. Los nodos se dimensionan por la métrica activa y se colorean por variación contra el año anterior; capas opcionales muestran cobertura de entrega o inventario bajo punto de reorden.

**Tipos de instrucción que el agente debe soportar desde el MVP:**

| Tipo | Ejemplo | Qué hace el agente |
| --- | --- | --- |
| Crear | "Hazme un tablero de ventas por canal" | Arma un layout completo con KPIs, tendencia y desglose |
| Modificar | "Cambia la gráfica de barras a línea y quita Lácteos" | Edita solo el componente afectado |
| Filtrar | "Solo región Golfo, último trimestre" | Aplica filtros globales y los muestra como chips |
| Analizar | "¿Por qué cayó el margen en julio?" | Descompone la variación y agrega una tarjeta de hallazgo |
| Explicar | "¿Cómo se calcula ticket promedio?" | Muestra la definición del modelo semántico |
| Alertar | "Avísame si Mérida cae más de 5 % semanal" | Crea una regla de monitoreo programada |

## Arquitectura técnica

La arquitectura separa dos planos: el **plano de datos** (fuentes, ELT, warehouse, dbt, capa semántica) produce números gobernados; el **plano de aplicación** (lienzo, agente, API) los consume y nunca toca datos crudos.

&#91;embedded content: arquitectura propuesta · 2 planos: datos y aplicación\]

La API devuelve al lienzo la especificación actualizada y los datos ya calculados (flecha de la derecha); el lienzo solo renderiza.

| Componente | Tecnología sugerida | Responsabilidad |
| --- | --- | --- |
| Lienzo | React + Vega-Lite o ECharts + MapLibre GL | Renderizar la especificación, filtros, selección en mapa, historial de versiones |
| API del Estudio | Python (FastAPI) o Node | Guardar especificaciones versionadas, caché de resultados, permisos, auditoría |
| Agente | LLM con uso de herramientas, servidor MCP propio | Interpretar la instrucción, planear el parche, consultar métricas, explicar |
| Capa semántica | MetricFlow (dbt Semantic Layer o autoalojado) | Traducir métricas + dimensiones a SQL óptimo |
| Transformación | dbt Core o dbt Cloud | Modelos, pruebas, documentación, linaje |
| Warehouse | BigQuery, Snowflake o PostgreSQL | Almacenamiento y cómputo analítico |
| Mapas | Matriz de puntos propia en SVG generada desde el marco geoestadístico de INEGI; MapLibre GL solo si se requieren calles | Mapa arrastrable, zoom, selección por lazo |

**Objetivos de servicio del MVP:** regeneración de un dashboard en menos de 5 s (p95) con caché caliente, consultas a la capa semántica en menos de 3 s, y 100 % de las consultas del agente registradas con usuario, instrucción y SQL.

## Propuestas de conexión

Recomendamos un solo destino analítico (warehouse) alimentado por ELT, con dbt encima; el Estudio y el agente solo leen del warehouse a través de la capa semántica, nunca de los sistemas operativos.

| Prioridad | Fuente | Ejemplos | Método de conexión | Frecuencia |
| --- | --- | --- | --- | --- |
| 1 | Warehouse analítico (destino) | BigQuery, Snowflake, Databricks, PostgreSQL | Conexión nativa con cuenta de servicio de solo lectura | Consultas en vivo |
| 1 | Punto de venta y ERP | POS de tienda, SAP Business One, NetSuite, Dynamics | ELT gestionado (Fivetran, Airbyte) o réplica CDC de lectura | Cada 15–60 min |
| 1 | Archivos | CSV, Excel, Google Sheets | Carga desde el Estudio a una zona `raw_files` + `dbt seed` | Bajo demanda |
| 2 | E-commerce | Shopify, VTEX, Mercado Libre | ELT gestionado | Cada hora |
| 2 | Marketing | Meta Ads, Google Ads, TikTok Ads | ELT gestionado | Diaria |
| 2 | CRM | HubSpot, Salesforce | ELT gestionado | Cada hora |
| 3 | Geografía | Marco geoestadístico INEGI, OpenStreetMap | Carga única + `dbt seed` de catálogos | Anual |
| 3 | Herramientas del agente | Servidor MCP propio sobre la capa semántica | API interna autenticada | En vivo |

**Opciones de arquitectura de conexión:**

- **Opción A, todo en la nube gestionada (recomendada):** BigQuery o Snowflake + Fivetran + dbt. Menor operación y escalamiento inmediato; costo variable por volumen.
- **Opción B, código abierto:** PostgreSQL o DuckDB + Airbyte + dbt Core. Costo de licencia cero y control total; requiere un ingeniero de plataforma.
- **Opción C, híbrida para el piloto:** DuckDB con los CSV dummy en las semanas 1–6 y migración a la opción A sin cambiar modelos dbt (solo el `profile`).

**Seguridad de conexión:** credenciales en un gestor de secretos, cuentas de solo lectura, seguridad a nivel de fila por región o tienda heredada del usuario, y registro de cada consulta que dispara el agente.

Contexto del mercado: Fivetran y dbt Labs [cerraron su fusión el 1 de junio de 2026](https://www.fivetran.com/press/fivetran-dbt-labs-complete-merger-to-create-the-data-infrastructure-for-trusted-ai-agents), y el motor de dbt se publicará como dbt Core v2.0 bajo licencia Apache 2.0 (en alfa). Esto refuerza la combinación ELT + dbt como estándar, pero conviene no depender de funciones exclusivas de un proveedor.

## Modelado con dbt

El proyecto dbt de ejemplo (`golfo_norte`, adjunto a esta propuesta) ya compila y corre: `dbt build` crea 22 modelos y pasa 45 pruebas en menos de 10 segundos sobre DuckDB con los datos dummy.

&#91;embedded content: proyecto dbt golfo\_norte · 22 modelos, 45 pruebas, 31 métricas\]

**Convenciones:**

- **staging:** una vista por tabla cruda, solo renombrar, tipar y normalizar (ej. `estatus` a minúsculas, `campana_id` vacío a nulo). Sin uniones.
- **intermediate:** lógica reutilizable; `int_lineas_enriquecidas` calcula venta bruta, descuento, venta neta y costo una sola vez.
- **marts:** tablas con grano explícito y documentado. `fct_ventas_lineas` solo contiene pedidos completados; las devoluciones viven en `fct_pedidos` para que nadie las reste dos veces.
- **macros:** `margen_pct()` centraliza la fórmula y protege la división entre cero.

**Pruebas incluidas:** `unique` y `not_null` en todas las llaves, `relationships` entre hechos y dimensiones, `accepted_values` para región y canal, y dos pruebas de negocio: venta neta nunca mayor que la bruta y margen global entre 10 % y 40 %.

**Operación:** CI en cada *pull request* (`dbt build --select state:modified+`), corrida programada cada hora en producción, `dbt docs` publicado como catálogo y alertas de frescura de fuentes. Para pasar a producción solo cambia `profiles.yml`; los modelos son SQL estándar.

## Modelo semántico y métricas de negocio

El modelo semántico define 10 modelos semánticos y 31 métricas en YAML de MetricFlow, versionado junto con dbt; es la única forma en que el agente y el dashboard obtienen números.

**Entidades y cómo se unen:** `linea` (hechos de venta) se relaciona con `pedido`, `tienda`, `cliente` y `producto`; `inventario` con `tienda` y `producto`; `campana` es independiente. Gracias a esas llaves, cualquier métrica de ventas se puede cortar por `tienda__region`, `cliente__segmento` o `producto__producto_nombre` sin escribir *joins*.

**Catálogo de métricas (versión piloto):**

| Métrica | Tipo | Definición | Dueño | Valor ene–sep 2026 |
| --- | --- | --- | --- | --- |
| `ventas_netas` | simple | Σ cantidad × precio × (1 − descuento), pedidos completados | Finanzas | MXN 74.5 M |
| `margen_bruto_pct` | derivada | (ventas\_netas − costo\_ventas) / ventas\_netas | Finanzas | 23.8 % |
| `crecimiento_ventas_yoy_pct` | derivada con desfase de 1 año | ventas\_netas vs mismo periodo del año anterior | Finanzas | +22.7 % |
| `pedidos` | simple | pedidos completados distintos | Comercial | 72,554 |
| `ticket_promedio` | razón | ventas\_netas / pedidos | Comercial | MXN 1,027 |
| `participacion_ecommerce_pct` | derivada | ventas\_ecommerce / ventas\_netas | Digital | 10.0 % |
| `clientes_activos` | simple | clientes distintos con compra | Growth | 14,234 |
| `frecuencia_compra` | razón | pedidos / clientes\_activos | Growth | 5.1 |
| `tasa_devolucion` | razón | pedidos devueltos / pedidos totales | Operaciones | 2.5 % |
| `combinaciones_bajo_reorden` | simple, no aditiva en el tiempo | tienda-SKU con existencias < punto de reorden, última foto | Operaciones | 119 |
| `roas_incremental` | razón | ventas incrementales vs baseline / inversión | Marketing | −0.17× a 15.6× por campaña |

Las otras 20 métricas incluyen la capa de growth, con clientes\_nuevos (7,418), clientes\_recurrentes (6,816), retencion\_m3\_pct (70.0 %), clientes\_reactivados, clientes\_perdidos y ventas\_por\_cliente, y los componentes de las métricas anteriores (ventas\_brutas, descuentos, costo\_ventas, margen\_bruto, unidades, ventas\_ecommerce, pedidos\_totales, pedidos\_devueltos\_m, inversion\_marketing, ventas\_incrementales\_m).

**Reglas de gobierno:**

- Cada métrica tiene dueño (`meta.dueno`) y unidad; el agente las muestra al explicar un número.
- Una métrica nueva entra por *pull request* con prueba y aprobación del dueño; el agente puede proponerla pero no publicarla.
- Las definiciones siguen la especificación abierta de MetricFlow, que dbt Labs [liberó bajo Apache 2.0](https://www.getdbt.com/blog/open-source-metricflow-governed-metrics) y alinea con [Open Semantic Interchange (OSI)](https://www.snowflake.com/en/blog/open-semantic-interchanges-specs-finalized/), el estándar neutral de definiciones semánticas que impulsan Snowflake, Salesforce, Databricks y otros. Esto evita quedar atados a una herramienta de BI.

## Diseño del agente

El agente nunca dibuja HTML ni escribe SQL libre: edita una **especificación declarativa del dashboard** (JSON validado por esquema) y pide datos a la capa semántica por nombre de métrica. El frontend renderiza la especificación; así cada regeneración es predecible, versionable y reversible.

**Especificación del dashboard (fragmento):**

```json
{
  "version": 7,
  "filtros_globales": {"periodo": "2026-01..2026-09", "canal": {"excluir": ["Mayoreo"]}},
  "componentes": [
    {"id": "kpi_ventas", "tipo": "kpi", "metrica": "ventas_netas", "comparar": "anio_anterior"},
    {"id": "mapa", "tipo": "mapa", "metrica": "ventas_netas", "color": "crecimiento_yoy_pct", "interactivo": true},
    {"id": "tendencia", "tipo": "linea", "metrica": "margen_bruto_pct", "dimension": "metric_time__month", "serie": "region"},
    {"id": "hallazgo_1", "tipo": "nota", "texto": "El margen de julio cae 7.8 pp por descuentos de campaña"}
  ]
}
```

**Herramientas que expone el backend al agente (vía MCP):**

| Herramienta | Qué hace | Riesgo |
| --- | --- | --- |
| `listar_metricas` / `describir_metrica` | Lee el catálogo semántico: definición, dimensiones válidas, dueño | Ninguno |
| `consultar_metricas` | Pide métricas + dimensiones + filtros; MetricFlow compila el SQL | Bajo (solo lectura, con límite de filas y costo) |
| `leer_dashboard` / `editar_dashboard` | Lee la especificación y aplica un parche JSON validado | Bajo (versionado, reversible) |
| `analizar_variacion` / ver\_senales | Descompone un cambio (precio, volumen, mezcla, nuevos vs recurrentes) y lista las señales de growth detectadas | Bajo |
| `crear_alerta` | Registra una regla de monitoreo | Medio: requiere confirmación del usuario |
| `proponer_metrica` | Abre un *pull request* en el repositorio dbt con una métrica nueva | Medio: requiere revisión humana |

**Guardrails:**

- Si la pregunta no se puede responder con métricas existentes, el agente lo dice y ofrece `proponer_metrica`; no inventa cálculos.
- Cada componente muestra su procedencia: métrica, filtros y SQL compilado, a un clic.
- Permisos del usuario aplicados en la capa semántica, no en el prompt.
- Evaluación continua con 100 preguntas de referencia y respuestas esperadas; un cambio de prompt o modelo no se libera si baja la precisión.

**Bucle de regeneración:** instrucción → el agente lee la especificación actual y el catálogo → planea el cambio mínimo → consulta métricas → valida el parche contra el esquema → el frontend renderiza → el agente resume en una línea qué cambió y por qué.

## Análisis de datos y hallazgos de ejemplo

Con los datos dummy, las ventas crecen 22.7 % en 2026, pero cada mes con campaña pierde margen: es el tipo de hallazgo que el agente debe detectar y explicar sin que nadie lo pida.

&#91;embedded content: datos dummy · fct\_ventas\_lineas, pedidos completados, 21 meses\]

| Hallazgo | Evidencia (ene–sep 2026 vs 2025) | Acción o vista que el agente propone |
| --- | --- | --- |
| Las aperturas explican parte del crecimiento | Total +22.7 %; tiendas comparables +18.5 % (Cancún y Querétaro abrieron en 2025) | Separar KPI total y comparable en el tablero ejecutivo |
| Crecimiento desigual por región | Occidente +33.7 % y Centro +32.7 % vs Sureste +14.0 %; Mérida −2.4 % y Oaxaca +2.8 % | Capa del mapa coloreada por crecimiento; alerta semanal para Mérida |
| Mayoreo concentra el negocio | 4.1 % de los pedidos pero 52.7 % de las ventas | Vista de concentración de clientes mayoristas y riesgo |
| E-commerce es el canal más dinámico | +67.4 %; ya es 10.0 % de las ventas | Tendencia de participación digital por tienda |
| Mezcla de margen | Cuidado personal 35.6 % y Limpieza 32.1 % vs Frescos 12.0 % y Lácteos 15.1 % | Simulador de mezcla: efecto de mover 1 pp de ventas entre categorías |
| Campañas con retorno muy dispar | ROAS incremental de −0.17× (Hot Sale 2026) a 15.6× (Verano Bebidas) | Ranking de campañas con advertencia: el baseline de 14 días no controla estacionalidad |
| Riesgo de quiebre de inventario | 119 de 735 combinaciones tienda-SKU (16 %) bajo punto de reorden | Capa de inventario en el mapa y lista de reorden |

**Cómo lo usaría un director comercial:** escribe *"¿por qué bajó el margen en julio?"*; el agente descompone la variación, encuentra que 100 % de los días de julio estuvieron en campaña con 10 % de descuento, agrega esta gráfica y una nota al tablero, y sugiere comparar contra el ROAS de la campaña antes de repetirla.

## Roadmap, equipo, riesgos y KPIs

El MVP se entrega en 16 semanas con un equipo de 6 personas de tiempo completo equivalente; ninguna fase avanza sin pasar su puerta de calidad.

&#91;embedded content: roadmap propuesto · 5 fases, 4 puertas, sin escala\]

La fase de datos puede arrancar con el prototipo y los datos dummy de esta propuesta (opción C de conexión), así el lienzo y el agente se construyen en paralelo sin esperar las fuentes reales.

**Equipo:**

| Rol | Dedicación | Responsabilidad principal |
| --- | --- | --- |
| Líder de producto | 1.0 | Prioridades, preguntas de negocio, puertas de calidad |
| Ingeniero de analítica (dbt) | 1.0 | Modelos, pruebas, modelo semántico |
| Ingeniero de datos | 0.5 | ELT, warehouse, seguridad de acceso |
| Ingenieros full stack | 2.0 | Lienzo, mapa, API, versiones |
| Ingeniero de IA | 1.0 | Agente, herramientas MCP, evaluación |
| Diseñador UX | 0.5 | Flujos de instrucción, componentes, pruebas con usuarios |
| Dueños de métricas del negocio | por demanda | Aprobar definiciones y validar cifras |

**Riesgos principales:**

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El agente interpreta mal una instrucción | Decisiones con datos equivocados | Muestra lo que entendió antes de aplicar; set de 100 preguntas en CI; procedencia visible |
| Definiciones de métricas en disputa | Retraso en la puerta 1 | Dueño único por métrica y comité semanal de 30 min |
| Calidad de datos de origen | Cifras que no cuadran | Pruebas dbt, alertas de frescura y conciliación mensual con finanzas |
| Costo de cómputo por consultas del agente | Factura variable alta | Caché de resultados, límites de filas y costo por consulta, marts agregados |
| Adopción baja | Herramienta sin uso | Pilotos con 5 usuarios reales, plantillas por rol, capacitación en la fase 4 |

**KPIs de éxito a 90 días del lanzamiento:**

- Precisión del agente ≥ 90 % en el set de referencia y ≥ 85 % de instrucciones reales aceptadas sin corrección.
- Tiempo de un cambio de dashboard: de días a menos de 1 minuto (mediana).
- 60 % de los usuarios piloto activos cada semana.
- 0 discrepancias abiertas entre métricas del Estudio y cierre contable.
- 50 % menos solicitudes de reportes ad hoc al equipo de datos.

**Entregables incluidos con esta propuesta:** [prototipo interactivo con datos dummy](https://claude.ai/artifact/HLxmd1kLiRqo3hkLE65rHY) (mapa de matriz de puntos arrastrable con señales de growth enlazadas, ciclo detectar–aprender, cohortes, contabilidad de clientes, barra de instrucciones con agente Claude o reglas locales, versiones y especificación JSON visible) y proyecto dbt `golfo_norte` con datos, modelos, pruebas y métricas.

**Fuentes:** [Fivetran: cierre de la fusión con dbt Labs](https://www.fivetran.com/press/fivetran-dbt-labs-complete-merger-to-create-the-data-infrastructure-for-trusted-ai-agents) · [dbt Labs: MetricFlow de código abierto](https://www.getdbt.com/blog/open-source-metricflow-governed-metrics) · [Snowflake: especificación de Open Semantic Interchange](https://www.snowflake.com/en/blog/open-semantic-interchanges-specs-finalized/)
