# Recorrido del CLI del Estudio

Generado por `laboratorio/recorrido-cli.mjs` el 2026-10-20 contra la capa real (MetricFlow sobre golfo_norte). Almacén temporal. Grado del CLI: **no medido**.

## ayuda

```
$ estudio-dashboards ayuda
# código de salida: 0
estudio-dashboards <subcomando> --config <archivo.json> [--entrada '<json>' | --entrada-archivo <ruta>] [--aplicar] [--confirmada-por <nombre>]
Subcomandos: listar_metricas · describir_metrica · consultar_metricas · leer_dashboard · editar_dashboard (escribe: en seco salvo --aplicar) · analizar_variacion · ver_senales · crear_alerta (escribe: en seco salvo --aplicar) · proponer_metrica · comparar_versiones · volver_version (escribe: en seco salvo --aplicar) · fijar_oficial (escribe: en seco salvo --aplicar) · agente "<instrucción>" --tablero <t> [--aplicar]
Salida: el JSON del núcleo. Códigos: 0 bien · 2 uso · 3 rechazo del esquema · 4 falla de la capa · 5 modelo no disponible.
Grado: no med… (704 caracteres)
```

## listar_metricas

```
$ estudio-dashboards listar_metricas
# código de salida: 0
[{"nombre":"clientes_activos","etiqueta":"Clientes activos","tipo":"simple","unidad":"clientes","dueno":"Growth","descripcion":"Clientes distintos con al menos un pedido completado en el periodo."},{"nombre":"clientes_nuevos","etiqueta":"Clientes nuevos","tipo":"simple","unidad":"clientes","dueno":"Marketing","descripcion":"Clientes cuya primera compra cae en el periodo."},{"nombre":"clientes_perdidos","etiqueta":"Clientes perdidos","tipo":"simple","unidad":"clientes","dueno":"Lifecycle","descripcion":"Activos el mes anterior que no compraron este mes."},{"nombre":"clientes_reactivados","etiqueta":"Clientes reactivados","tipo":"simple","unidad":"clientes","dueno":"Lifecycle","descripcion":"C… (4792 caracteres)
```

## describir_metrica

```
$ estudio-dashboards describir_metrica --entrada '{"metrica":"ticket_promedio"}'
# código de salida: 0
{"nombre":"ticket_promedio","etiqueta":"Ticket promedio","descripcion":"","tipo":"ratio","formula":"ventas_netas / pedidos","dueno":"Comercial","unidad":"MXN","filtro":[],"dimensiones":[{"nombre":"cliente__canal_adquisicion","tipo":"categorica","etiqueta":null},{"nombre":"cliente__origen","tipo":"categorica","etiqueta":null},{"nombre":"cliente__segmento","tipo":"categorica","etiqueta":null},{"nombre":"linea__canal","tipo":"categorica","etiqueta":null},{"nombre":"linea__categoria","tipo":"categorica","etiqueta":null},{"nombre":"linea__en_campana","tipo":"categorica","etiqueta":null},{"nombre":"linea__fecha_pedido","tipo":"tiempo","etiqueta":null},{"nombre":"metric_time__day","tipo":"tiempo","… (2669 caracteres)
```

## consultar_metricas: margen por región sin mayoreo, 2026

```
$ estudio-dashboards consultar_metricas --entrada '{"metricas":["margen_bruto_pct"],"agrupar":["tienda__region"],"periodo":{"desde":"2026-01","hasta":"2026-09"},"filtros":[{"dimension":"linea__canal","operador":"no_en","valores":["Mayoreo"]}]}'
# código de salida: 0
{"columnas":["tienda__region","margen_bruto_pct"],"filas":[["Centro",23.846626348366694],["Golfo",23.79800755811558],["Norte",23.6956220717376],["Occidente",23.664628053636562],["Sureste",23.7131930012689]],"sql":"-- Compute Metrics via Expressions\n-- Order By [] Limit 5001\n-- Write to DataTable\nSELECT\n  tienda__region\n  , (ventas_netas - costo_ventas) * 100.0 / nullif(ventas_netas, 0) AS margen_bruto_pct\nFROM (\n  -- Constrain Output with WHERE\n  -- Select: ['__ventas_netas', '__costo_ventas', 'tienda__region']\n  -- Aggregate Inputs for Simple Metrics\n  -- Compute Metrics via Expressions\n  SELECT\n    tienda__region\n    , SUM(ventas_netas) AS ventas_netas\n    , SUM(costo_ventas)… (1702 caracteres)
```

## leer_dashboard

```
$ estudio-dashboards leer_dashboard --entrada '{"tablero":"ejecutivo"}'
# código de salida: 0
{"tablero":"ejecutivo","version":0,"oficial":null,"dashboard":{"esquema":"estudio.dashboard/1","titulo":"Ventas ejecutivo","palanca":"ticket","filtros":{"periodo":{"desde":"2026-01","hasta":"2026-09"},"comparar":"anio_anterior","dimensiones":[]},"componentes":[{"id":"kpis","tipo":"kpis","metricas":["ventas_netas","margen_bruto_pct","pedidos","ticket_promedio"],"comparar":"anio_anterior"},{"id":"tendencia","tipo":"linea","metrica":"ventas_netas","grano":"month"},{"id":"por_region","tipo":"barras","metrica":"ventas_netas","dimension":"tienda__region"},{"id":"por_categoria","tipo":"barras","metrica":"margen_bruto_pct","dimension":"linea__categoria"},{"id":"tiendas","tipo":"tabla","metricas":["v… (917 caracteres)
```

## editar_dashboard EN SECO (por defecto)

```
$ estudio-dashboards editar_dashboard --entrada '{"tablero":"ejecutivo","parche":{"esquema":"estudio.parche/1","base":0,"alcance":{"tipo":"modificar","componentes":["por_region"]},"operaciones":[{"op":"cambiar","id":"por_region","cambios":{"tipo":"linea"}}]}}'
# código de salida: 0
{"aplicado":false,"enSeco":true,"version":0,"tocados":["por_region"],"globales":[],"diferencia":{"agregados":[],"quitados":[],"cambiados":[{"id":"por_region","campos":["dimension","grano","serie","tipo"]}],"movidos":[],"globales":[]},"dashboard":{"esquema":"estudio.dashboard/1","titulo":"Ventas ejecutivo","palanca":"ticket","filtros":{"periodo":{"desde":"2026-01","hasta":"2026-09"},"comparar":"anio_anterior","dimensiones":[]},"componentes":[{"id":"kpis","tipo":"kpis","metricas":["ventas_netas","margen_bruto_pct","pedidos","ticket_promedio"],"comparar":"anio_anterior"},{"id":"tendencia","tipo":"linea","metrica":"ventas_netas","grano":"month"},{"id":"por_region","tipo":"linea","metrica":"venta… (976 caracteres)
```

¿Se escribió algo en el almacén tras el seco? no · aplicado: false

## editar_dashboard --aplicar

```
$ estudio-dashboards editar_dashboard --entrada '{"tablero":"ejecutivo","parche":{"esquema":"estudio.parche/1","base":0,"alcance":{"tipo":"modificar","componentes":["por_region"]},"operaciones":[{"op":"cambiar","id":"por_region","cambios":{"tipo":"linea"}}]}}' --aplicar
# código de salida: 0
{"aplicado":true,"enSeco":false,"version":1,"tocados":["por_region"],"globales":[],"diferencia":{"agregados":[],"quitados":[],"cambiados":[{"id":"por_region","campos":["dimension","grano","serie","tipo"]}],"movidos":[],"globales":[]},"dashboard":{"esquema":"estudio.dashboard/1","titulo":"Ventas ejecutivo","palanca":"ticket","filtros":{"periodo":{"desde":"2026-01","hasta":"2026-09"},"comparar":"anio_anterior","dimensiones":[]},"componentes":[{"id":"kpis","tipo":"kpis","metricas":["ventas_netas","margen_bruto_pct","pedidos","ticket_promedio"],"comparar":"anio_anterior"},{"id":"tendencia","tipo":"linea","metrica":"ventas_netas","grano":"month"},{"id":"por_region","tipo":"linea","metrica":"venta… (976 caracteres)
```

## analizar_variacion: margen de julio de 2026

```
$ estudio-dashboards analizar_variacion --entrada '{"metrica":"margen_bruto_pct","periodo":{"desde":"2026-07","hasta":"2026-07"}}'
# código de salida: 0
{"metrica":"margen_bruto_pct","periodo":{"desde":"2026-07","hasta":"2026-07"},"contra":{"desde":"2025-07","hasta":"2025-07"},"antes":25.577045074900603,"despues":17.75182208066823,"cambio":-7.825222994232373,"unidadCambio":"pp","ejes":[{"dimension":"cliente__canal_adquisicion","segmentos":[{"clave":"Tienda","antes":25.570010311004562,"despues":17.731882263764934,"pesoAntes":0.7821289161433844,"pesoDespues":0.6270484659631292,"contribucion":-8.880294878188542},{"clave":"Mayoreo","antes":25.4139148549846,"despues":17.724855418532037,"pesoAntes":0.09502141297853871,"pesoDespues":0.21885008320423724,"contribucion":1.4642199842919001},{"clave":"E-commerce","antes":25.748009767822712,"despues":17.… (6993 caracteres)
```

## ver_senales

```
$ estudio-dashboards ver_senales
# código de salida: 0
[{"id":"retencion-retencion_m3_pct-cohorte__origen","etapa":"diagnosticar","estado":"hipotesis","palancas":["retencion","valor"],"dimension":"cohorte__origen","entidades":["Tampico"],"metricas":["retencion_m3_pct","ventas_por_cliente"],"evidencia":[{"etiqueta":"Orgánico","valor":82.72241313478428,"unidad":"%","consulta":"retencion_m3_pct por cohorte__origen"},{"etiqueta":"Campaña","valor":66.29994209612045,"unidad":"%","consulta":"retencion_m3_pct por cohorte__origen"},{"etiqueta":"brecha","valor":16.42247103866383,"unidad":"pp","consulta":"derivado: diferencia entre segmentos"},{"etiqueta":"Orgánico","valor":7918.740255581558,"unidad":"MXN","consulta":"ventas_por_cliente por cliente__origen… (9472 caracteres)
```

## crear_alerta EN SECO: propuesta y evaluación, sin canal

```
$ estudio-dashboards crear_alerta --entrada '{"regla":{"metrica":"ventas_netas","filtros":[{"dimension":"tienda__tienda_nombre","operador":"en","valores":["Mérida"]}],"condicion":"cae_mas_de","valor":5,"unidad":"%","ventana":"semanal"}}'
# código de salida: 0
{"alerta":{"metrica":"ventas_netas","filtros":[{"dimension":"tienda__tienda_nombre","operador":"en","valores":["Mérida"]}],"condicion":"cae_mas_de","valor":5,"unidad":"%","ventana":"semanal","id":"alerta_ventas_netas_semanal_2ssn3d","estado":"propuesta","creada":"2026-10-20T16:03:22.857Z","confirmadaPor":null,"canal":"ninguno"},"evaluacion":{"ventana":"semanal","actual":128921.1846,"anterior":90386.1832,"cambio":42.6337301075459,"dispararia":false,"periodos":["2026-09-14","2026-09-21"]}}
```

## crear_alerta --aplicar SIN quien confirme → rechazo (3)

```
$ estudio-dashboards crear_alerta --entrada '{"regla":{"metrica":"ventas_netas","filtros":[],"condicion":"cae_mas_de","valor":5,"unidad":"%","ventana":"mensual"}}' --aplicar
# código de salida: 3
{"error":"esquema · confirmada_por: una alerta se registra solo con la confirmación de una persona (confirmada_por)","errores":[{"codigo":"esquema","ruta":"confirmada_por","mensaje":"una alerta se registra solo con la confirmación de una persona (confirmada_por)"}]}
```

## proponer_metrica: se arma con piezas que existen → diff, sin PR

```
$ estudio-dashboards proponer_metrica --entrada '{"nombre":"venta_ecommerce_por_pedido","etiqueta":"Venta e-commerce por pedido","descripcion":"Ventas e-commerce entre pedidos","tipo":"ratio","numerador":"ventas_ecommerce","denominador":"pedidos","dueno":"Digital","unidad":"MXN"}'
# código de salida: 0
{"tipo":"diff","nombre":"venta_ecommerce_por_pedido","diff":"--- a/models/semantic/sem_metricas.yml\n+++ b/models/semantic/sem_metricas.yml\n@@ métricas: se agrega venta_ecommerce_por_pedido al final @@\n+\n+  - name: venta_ecommerce_por_pedido\n+    label: \"Venta e-commerce por pedido\"\n+    description: \"Ventas e-commerce entre pedidos\"\n+    type: ratio\n+    type_params:\n+      numerator: ventas_ecommerce\n+      denominator: pedidos\n+    meta: {dueno: \"Digital\", unidad: \"MXN\"}","motivo":"la métrica se compone de piezas que ya existen en la capa","siguientePaso":"una persona abre el PR con este diff, una prueba de la métrica y la aprobación de Digital; el Estudio no lo abre"}
```

## proponer_metrica: NPS no existe en la capa → requiere datos

```
$ estudio-dashboards proponer_metrica --entrada '{"nombre":"nps","etiqueta":"NPS","descripcion":"Net Promoter Score","tipo":"simple","medida":"respuestas_nps","dueno":"Experiencia","unidad":"puntos"}'
# código de salida: 0
{"tipo":"requiere_datos","nombre":"nps","diff":null,"motivo":"no existe en la capa: respuestas_nps. Antes que la métrica hace falta el dato (fuente, ELT y modelo dbt).","siguientePaso":"abrir una solicitud de datos con el dueño; la métrica se propone cuando exista su medida"}
```

## comparar_versiones 0 → 1 (componentes y cifras)

```
$ estudio-dashboards comparar_versiones --entrada '{"tablero":"ejecutivo","a":0,"b":1}'
# código de salida: 0
{"diferencia":{"agregados":[],"quitados":[],"cambiados":[{"id":"por_region","campos":["dimension","grano","serie","tipo"]}],"movidos":[],"globales":[]},"cifras":[{"componente":"por_region","clave":"ventas_netas · Golfo","antes":23498096.8263,"despues":null},{"componente":"por_region","clave":"ventas_netas · Centro","antes":16689490.4392,"despues":null},{"componente":"por_region","clave":"ventas_netas · Norte","antes":13931687.2142,"despues":null},{"componente":"por_region","clave":"ventas_netas · Occidente","antes":11450989.5196,"despues":null},{"componente":"por_region","clave":"ventas_netas · Sureste","antes":8960068.0497,"despues":null},{"componente":"por_region","clave":"ventas_netas · C… (5420 caracteres)
```

## volver_version EN SECO

```
$ estudio-dashboards volver_version --entrada '{"tablero":"ejecutivo","n":0}'
# código de salida: 0
{"aplicado":false,"version":2,"dashboard":{"esquema":"estudio.dashboard/1","titulo":"Ventas ejecutivo","palanca":"ticket","filtros":{"periodo":{"desde":"2026-01","hasta":"2026-09"},"comparar":"anio_anterior","dimensiones":[]},"componentes":[{"id":"kpis","tipo":"kpis","metricas":["ventas_netas","margen_bruto_pct","pedidos","ticket_promedio"],"comparar":"anio_anterior"},{"id":"tendencia","tipo":"linea","metrica":"ventas_netas","grano":"month"},{"id":"por_region","tipo":"barras","metrica":"ventas_netas","dimension":"tienda__region"},{"id":"por_categoria","tipo":"barras","metrica":"margen_bruto_pct","dimension":"linea__categoria"},{"id":"tiendas","tipo":"tabla","metricas":["ventas_netas","margen… (761 caracteres)
```

## fijar_oficial --aplicar

```
$ estudio-dashboards fijar_oficial --entrada '{"tablero":"ejecutivo","n":1}' --aplicar
# código de salida: 0
{"aplicado":true,"oficial":1}
```

## agente EN SECO (LLM real, modelo pineado de la config)

```
$ estudio-dashboards agente '¿Cómo se calcula el ticket promedio?' --tablero ejecutivo
# código de salida: 0
{"aplicado":false,"entendi":"tipo: explicar · métrica: ticket_promedio","texto":"Ticket promedio (ticket_promedio): sin descripción en la capa. Tipo ratio; fórmula ventas_netas / pedidos. Dueño: Comercial; unidad: MXN. Ojo: no se suma entre categorías: cada total es su propia consulta.","plan":{"tipo":"explicar","responde":true,"entendi":{"metricas":["ticket_promedio"],"dimensiones":[],"filtros":[],"periodo":null,"comparar":null},"componentes":[],"operaciones":[],"quitar_filtros":[],"titulo":null,"alerta":null,"sin_metrica":null,"resumen":"Explicaré cómo se calcula el ticket promedio."},"tocados":[],"error":null,"modelo":"anthropic/claude-haiku-5.5-20261007","versionPrompt":"estudio-agente/4… (737 caracteres)
```

## error de uso → 2

```
$ estudio-dashboards consultar_metricas --entrada '{roto'
# código de salida: 2
{"error":"Expected property name or '}' in JSON at position 1 (line 1 column 2)"}
```

## métrica inventada → 3

```
$ estudio-dashboards describir_metrica --entrada '{"metrica":"ventas_magicas"}'
# código de salida: 3
{"error":"metrica_inexistente · metrica: la métrica «ventas_magicas» no existe en el catálogo; se puede proponer con proponer_metrica","errores":[{"codigo":"metrica_inexistente","ruta":"metrica","mensaje":"la métrica «ventas_magicas» no existe en el catálogo; se puede proponer con proponer_metrica"}]}
```

## SQL libre en un filtro → 3

```
$ estudio-dashboards consultar_metricas --entrada '{"metricas":["ventas_netas"],"filtros":[{"dimension":"tienda__region","operador":"en","valores":["Golfo' union select * from raw_clientes --"]}]}'
# código de salida: 3
{"error":"valor_fuera_de_dominio · consulta.filtros[0]: «Golfo' union select * from raw_clientes --» no es un valor de tienda__region (valores: Centro, Golfo, Norte, Occidente, Sureste)","errores":[{"codigo":"valor_fuera_de_dominio","ruta":"consulta.filtros[0]","mensaje":"«Golfo' union select * from raw_clientes --» no es un valor de tienda__region (valores: Centro, Golfo, Norte, Occidente, Sureste)"}]}
```

## sin capa (solo la foto del catálogo): consultar falla, no inventa → 4

```
$ estudio-dashboards consultar_metricas --entrada '{"metricas":["ventas_netas"]}'
# código de salida: 4
{"error":"sin capa semántica: la config solo trae la foto del catálogo"}
```

## agente sin llave → 5

```
$ estudio-dashboards agente 'muéstrame ventas' --tablero ejecutivo
# código de salida: 5
{"error":"modelo no disponible: falta OPENROUTER_API_KEY en el entorno; "}
```

