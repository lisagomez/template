-- Ventas netas diarias por tienda (pedidos completados); base para comparables y baseline de campañas.
select
    fecha_pedido,
    tienda_id,
    sum(venta_neta)  as venta_neta,
    sum(costo)       as costo,
    count(distinct pedido_id) as pedidos
from {{ ref('int_lineas_enriquecidas') }}
where not es_devuelto
group by 1, 2
