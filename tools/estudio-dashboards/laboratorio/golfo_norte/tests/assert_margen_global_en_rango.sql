-- Falla si el margen bruto global sale del rango esperado para el negocio (10% a 40%).
select margen
from (select {{ margen_pct('sum(venta_neta)', 'sum(costo)') }} as margen from {{ ref('fct_ventas_lineas') }})
where margen not between 10 and 40
