# golfo_norte — proyecto dbt de ejemplo (datos dummy)

Proyecto dbt de la propuesta "Estudio de Dashboards con Agente". Modela las ventas de
**Distribuidora Golfo Norte**, una empresa ficticia con 21 tiendas en México (ene-2025 a sep-2026).

## Ejecutar en local (DuckDB, sin servidor)

```bash
pip install dbt-duckdb            # dbt-core 1.12 + adaptador DuckDB
export DBT_PROFILES_DIR=.
dbt build                         # 22 modelos + 45 pruebas
dbt docs generate && dbt docs serve
```

Los CSV crudos están en `data/raw/` y se leen como fuentes externas (`_sources.yml`).
Para producción cambia solo `profiles.yml` (BigQuery, Snowflake, Databricks, Postgres) y
apunta las fuentes al esquema que llena tu ELT.

## Capas

| Capa | Carpeta | Materialización | Qué hace |
| --- | --- | --- | --- |
| staging | `models/staging` | vista | Renombra, tipa y limpia cada tabla cruda (1 a 1) |
| intermediate | `models/intermediate` | vista | Une pedidos, líneas, productos y tiendas; calcula importes; clasifica cada cliente-mes (base inicial, nuevo, retenido, reactivado) |
| marts/core | `models/marts/core` | tabla | Dimensiones y hechos: `fct_ventas_lineas`, `fct_pedidos`, `fct_inventario`, `dim_*` |
| marts/marketing | `models/marts/marketing` | tabla | `fct_campanas_desempeno` con ROAS incremental |
| marts/growth | `models/marts/growth` | tabla | `fct_clientes_mes`, `fct_contabilidad_crecimiento`, `fct_cohortes` |
| semantic | `models/semantic` | — | 10 modelos semánticos y 31 métricas para MetricFlow (incluye `sem_growth.yml`) |

## Métricas

Ventas y rentabilidad (`sem_metricas.yml`): ventas_brutas, descuentos, ventas_netas, costo_ventas, margen_bruto,
margen_bruto_pct, unidades, pedidos, ticket_promedio, ventas_ecommerce, participacion_ecommerce_pct,
crecimiento_ventas_yoy_pct, pedidos_totales, pedidos_devueltos_m, tasa_devolucion, combinaciones_bajo_reorden,
inversion_marketing, ventas_incrementales_m, roas_incremental.

Growth (`sem_growth.yml`): clientes_activos, clientes_nuevos, clientes_recurrentes, clientes_reactivados,
clientes_perdidos, frecuencia_compra, pedidos_clientes, ventas_por_cliente, ventas_clientes, retencion_m3_pct,
retenidos_m3, tamano_cohorte.

Los clientes que ya compraban en el primer mes de datos (ene 2025) se marcan como `base_inicial`: no cuentan como
nuevos ni forman cohorte.

Consulta de ejemplo con MetricFlow (requiere `dbt-metricflow`):

```bash
mf query --metrics ventas_netas,margen_bruto_pct --group-by metric_time__month,tienda__region \
         --where "{{ TimeDimension('metric_time', 'day') }} >= '2026-01-01'"
```

## Pruebas

Genéricas (unique, not_null, relationships, accepted_values) y tres singulares:
`assert_venta_neta_no_mayor_a_bruta`, `assert_margen_global_en_rango` y `assert_activos_cuadran`
(activos = base inicial + nuevos + retenidos + reactivados).

## Regenerar los datos

`scripts/gen_data.py` crea los CSV con semilla fija (`numpy` 42) y `scripts/lifecycle.py` asigna clientes con
adquisición, frecuencia y abandono (semilla 7). Siembra tres señales para el agente de growth: clientes establecidos
que compran menos en Mérida y Oaxaca en 2026, clientes de campaña con menor retención y tiendas que crecen con
inventario bajo.
