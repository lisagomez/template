# Cifras de la propuesta: MetricFlow vs conteo directo

Generado por `laboratorio/corre.mjs` (2026-10-20). Versiones: dbt-core 1.12.5, dbt-duckdb 1.11.0, dbt-metricflow 0.15.0, dbt-postgres 1.11.0, duckdb 1.5.5, metricflow 0.213.0.

| Bloque | Cifra | Propuesta | MetricFlow | Directo | MF = directo | Cuadra con la propuesta | Explicación |
|---|---|---|---|---|---|---|---|
| Foto | Ventas netas ene–sep 2025 (M MXN) | 60.7 | 60,730,397.3 | 60,730,397.3 | ✓ | ✓ |  |
| Foto | Ventas netas ene–sep 2026 (M MXN) | 74.5 | 74,530,332 | 74,530,332 | ✓ | ✓ |  |
| Foto | Ventas netas, variación (%) | 22.7 | 22.72 | 22.72 | ✓ | ✓ |  |
| Foto | crecimiento_ventas_yoy_pct a grano año con ene–sep 2026 (TRAMPA documentada) | 22.7 | -17.02 | 22.72 | ✗ (trampa esperada) | ✗ | Divergencia esperada, no error de modelado: a grano año el desfase de 1 año agrega 2025 COMPLETO (ene–dic) antes de que el filtro ene–sep llegue, y compara 9 meses contra 12 (−17.0 %). La métrica es correcta a grano mes (fila siguiente). Por eso el Estudio compara periodos con dos consultas y no deja usar una métrica con desfase sobre un periodo de varios meses. |
| Foto | Control: crecimiento_ventas_yoy_pct a grano mes, julio 2026 | — | 44.84 | 44.84 | ✓ | — (control) | Fila de control (no está en la propuesta): la métrica con desfase, usada a su grano, cuadra con el conteo directo. |
| Foto | Tiendas comparables | 19 | 19.00 | 19.00 | ✓ | ✓ |  |
| Foto | Ventas de tiendas comparables, variación (%) | 18.5 | 18.46 | 18.46 | ✓ | ✓ |  |
| Foto | Margen bruto ene–sep 2025 (%) | 24.8 | 24.76 | 24.76 | ✓ | ✓ |  |
| Foto | Margen bruto ene–sep 2026 (%) | 23.8 | 23.84 | 23.84 | ✓ | ✓ |  |
| Foto | Margen bruto, variación (pp) | -0.9 | -0.924 | -0.924 | ✓ | ✓ | Redondeo: 24.8 − 23.8 = 1.0 con los publicados, pero sin redondear es 24.763 − 23.839 = 0.924, que se publica como −0.9. Se compara el valor sin redondear. |
| Foto | Pedidos ene–sep 2025 | 60283 | 60,283 | 60,283 | ✓ | ✓ |  |
| Foto | Pedidos ene–sep 2026 | 72554 | 72,554 | 72,554 | ✓ | ✓ |  |
| Foto | Pedidos, variación (%) | 20.4 | 20.36 | 20.36 | ✓ | ✓ |  |
| Foto | Ticket promedio ene–sep 2025 (MXN) | 1007 | 1,007.4 | 1,007.4 | ✓ | ✓ |  |
| Foto | Ticket promedio ene–sep 2026 (MXN) | 1027 | 1,027.2 | 1,027.2 | ✓ | ✓ |  |
| Foto | Ticket promedio, variación (%) | 2 | 1.967 | 1.967 | ✓ | ✓ |  |
| Foto | Clientes activos ene–sep 2025 | 9692 | 9,692 | 9,692 | ✓ | ✓ |  |
| Foto | Clientes activos ene–sep 2026 | 14234 | 14,234 | 14,234 | ✓ | ✓ |  |
| Foto | Clientes activos, variación (%) | 46.9 | 46.86 | 46.86 | ✓ | ✓ |  |
| Foto | Frecuencia ene–sep 2025 (pedidos por cliente) | 6.2 | 6.220 | 6.220 | ✓ | ✓ |  |
| Foto | Frecuencia ene–sep 2026 (pedidos por cliente) | 5.1 | 5.097 | 5.097 | ✓ | ✓ |  |
| Foto | Frecuencia, variación (%) | -18 | -18.05 | -18.05 | ✓ | ✓ |  |
| Foto | Combinaciones tienda-SKU bajo reorden (30-sep-2026) | 119 | 119.00 | 119.00 | ✓ | ✓ |  |
| Foto | Combinaciones tienda-SKU totales | 735 | — | 735.00 | sin métrica | ✓ | Sin métrica en el catálogo: no hay una que cuente combinaciones totales (solo las bajo reorden). Cuadra el conteo directo; no se inventa la consulta. |
| Catálogo | Participación e-commerce ene–sep 2026 (%) | 10 | 9.970 | 9.970 | ✓ | ✓ |  |
| Catálogo | Tasa de devolución ene–sep 2026 (%) | 2.5 | 2.471 | 2.471 | ✓ | ✓ | La métrica se publica como proporción 0–1 (meta.unidad = «proporción»); se multiplica por 100 solo para comparar. |
| Catálogo | ROAS incremental Hot Sale 2026 (×) | -0.17 | -0.174 | -0.174 | ✓ | ✓ |  |
| Catálogo | ROAS incremental Verano Bebidas (×) | 15.6 | 15.59 | 15.59 | ✓ | ✓ |  |
| Catálogo | Clientes nuevos ene–sep 2026 | 7418 | 7,418 | 7,418 | ✓ | ✓ |  |
| Catálogo | Clientes recurrentes ene–sep 2026 | 6816 | 6,816 | 6,816 | ✓ | ✓ |  |
| Catálogo | Retención a 3 meses, todas las cohortes maduras (%) | 70 | 72.50 | 72.50 | ✓ | ✗ | Divergencia de ventana, no de definición: con todas las cohortes maduras da 72.5 %. La columna del catálogo de la propuesta dice «Valor ene–sep 2026», y con las cohortes de 2026 da 70.0 % (fila siguiente). Los 66.3 % y 82.7 % por origen, en cambio, son de todas las cohortes: la propuesta mezcla dos ventanas. |
| Catálogo | Retención a 3 meses, cohortes ene–sep 2026 (%) | 70 | 69.97 | 69.97 | ✓ | ✓ |  |
| Catálogo | Base inicial (clientes de enero de 2025) | 3395 | 3,395 | 3,395 | ✓ | ✓ |  |
| Growth por área | Mérida: meses con compra de los establecidos, abr–sep 2026 vs 2025 (%) | -28 | — | -28.46 | sin métrica | ✓ | Sin métrica: «meses con compra por cliente establecido» (alta antes de abril de 2025, por tienda preferida) no existe en el catálogo; clientes_mes no expone cohorte ni tienda preferida como dimensión. La propuesta da un rango (28–30 %) para Mérida y Oaxaca juntas. |
| Growth por área | Oaxaca: meses con compra de los establecidos, abr–sep 2026 vs 2025 (%) | -30 | — | -30.32 | sin métrica | ✓ | Igual que Mérida: sin métrica en el catálogo. |
| Growth por área | Mérida: días entre compras de los establecidos, abr–sep 2025 | 23 | — | 23.77 | sin métrica | ✓ | Sin métrica: no hay medida de días entre compras. La propuesta TRUNCA (23.77 → 23); redondeado sería 24. |
| Growth por área | Mérida: días entre compras de los establecidos, abr–sep 2026 | 42 | — | 42.51 | sin métrica | ✓ | Sin métrica: no hay medida de días entre compras. La propuesta TRUNCA (42.51 → 42); redondeado sería 43. |
| Growth por área | Nuevos que llegan en meses de campaña, todas las cohortes (%) | 70 | 70.14 | 70.14 | ✓ | ✓ | Origen «Campaña» = adquirido en un mes con campaña activa (dim_clientes). La propuesta no dice el periodo: con todas las cohortes da 70.1 %; solo ene–sep 2026 daría 83.9 % (conteo directo). |
| Growth por área | Retención M+3 de clientes de campaña (%) | 66.3 | 66.30 | 66.30 | ✓ | ✓ |  |
| Growth por área | Retención M+3 de clientes orgánicos (%) | 82.7 | 82.72 | 82.72 | ✓ | ✓ |  |
| Growth por área | Valor en 6 meses, clientes de campaña (MXN) | 4636 | — | 4,635.6 | sin métrica | ✓ | Sin métrica: las ventas por cliente no se cortan por meses desde el alta (meses_desde_alta solo vive en el modelo de cohortes, sin ventas). Conteo directo, dos intentos: (1) mes de alta + 5, cohortes con 6 meses observados = 4,635.4; (2) solo altas hasta marzo de 2026 = 4,635.6, que es la ventana con que cuadra. La propuesta no declara la ventana. |
| Growth por área | Valor en 6 meses, clientes orgánicos (MXN) | 6730 | — | 6,730.2 | sin métrica | ✓ | Sin métrica (igual que campaña). Intento (1) = 6,718.3; intento (2), altas hasta marzo de 2026 = 6,730.2, que cuadra. Misma ventana no declarada. |
| Growth por área | Salidas mensuales de clientes ene–sep 2026 | 20134 | 20,134 | 20,134 | ✓ | ✓ |  |
| Growth por área | Reactivaciones ene–sep 2026 | 10710 | 10,710 | 10,710 | ✓ | ✓ |  |
| Growth por área | Tampico: crecimiento de ventas (%) | 34.8 | 34.79 | 34.79 | ✓ | ✓ |  |
| Growth por área | Tampico: SKU bajo reorden (de 35) | 10 | 10.00 | 10.00 | ✓ | ✓ |  |
| Growth por área | Polanco: SKU bajo reorden | 7 | 7.000 | 7.000 | ✓ | ✓ |  |
| Growth por área | Participación digital ene–sep 2025 (%) | 7.3 | 7.309 | 7.309 | ✓ | ✓ |  |
| Hallazgos | Occidente: crecimiento de ventas (%) | 33.7 | 33.72 | 33.72 | ✓ | ✓ |  |
| Hallazgos | Centro: crecimiento de ventas (%) | 32.7 | 32.66 | 32.66 | ✓ | ✓ |  |
| Hallazgos | Sureste: crecimiento de ventas (%) | 14 | 14.00 | 14.00 | ✓ | ✓ |  |
| Hallazgos | Mérida: crecimiento de ventas (%) | -2.4 | -2.393 | -2.393 | ✓ | ✓ |  |
| Hallazgos | Oaxaca: crecimiento de ventas (%) | 2.8 | 2.810 | 2.810 | ✓ | ✓ |  |
| Hallazgos | Mayoreo: % de los pedidos, ene–sep 2026 | 4.1 | 4.094 | 4.094 | ✓ | ✓ | Los pedidos por canal SÍ suman al total (cada pedido tiene un solo canal), por eso aquí la suma de filas es legítima; no lo sería con clientes_activos. |
| Hallazgos | Mayoreo: % de las ventas, ene–sep 2026 | 52.7 | 52.71 | 52.71 | ✓ | ✓ |  |
| Hallazgos | E-commerce: crecimiento de ventas (%) | 67.4 | 67.40 | 67.40 | ✓ | ✓ |  |
| Hallazgos | Margen Cuidado personal, ene–sep 2026 (%) | 35.6 | 35.62 | 35.62 | ✓ | ✓ |  |
| Hallazgos | Margen Limpieza, ene–sep 2026 (%) | 32.1 | 32.14 | 32.14 | ✓ | ✓ |  |
| Hallazgos | Margen Lácteos, ene–sep 2026 (%) | 15.1 | 15.06 | 15.06 | ✓ | ✓ |  |
| Hallazgos | Margen Frescos, ene–sep 2026 (%) | 12 | 11.96 | 11.96 | ✓ | ✓ |  |
| Hallazgos | Julio 2026: días en campaña (%) | 100 | — | 100.00 | sin métrica | ✓ | Sin métrica de días en campaña; en_campana es dimensión de líneas, no un conteo de días. |
| Hallazgos | Julio 2026: caída del margen frente a julio 2025 (pp) | -7.8 | -7.825 | -7.825 | ✓ | ✓ | La propuesta no dice contra qué: contra julio de 2025 da −7.8 pp; contra junio de 2026 daría −7.2 pp (ver julio_margen_vs_junio_pp en el directo). |
