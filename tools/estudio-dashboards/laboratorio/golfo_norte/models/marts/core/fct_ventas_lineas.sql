-- Grano: una línea de producto de un pedido COMPLETADO. Las devoluciones se miden en fct_pedidos.
select
    linea_id, pedido_id, fecha_pedido, tienda_id, cliente_id, producto_id, campana_id,
    canal, categoria, region,
    campana_id is not null as en_campana,
    cantidad, venta_bruta, descuento, venta_neta, costo
from {{ ref('int_lineas_enriquecidas') }}
where not es_devuelto
