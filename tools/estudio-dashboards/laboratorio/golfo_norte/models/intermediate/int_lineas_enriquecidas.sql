-- Une cada línea con su pedido, producto y tienda, y calcula importes.
with lineas as (select * from {{ ref('stg_lineas_pedido') }}),
pedidos as (select * from {{ ref('stg_pedidos') }}),
productos as (select * from {{ ref('stg_productos') }}),
tiendas as (select * from {{ ref('stg_tiendas') }})

select
    l.linea_id,
    l.pedido_id,
    p.fecha_pedido,
    p.tienda_id,
    t.region,
    p.cliente_id,
    p.canal,
    p.campana_id,
    p.es_devuelto,
    l.producto_id,
    pr.categoria,
    l.cantidad,
    l.cantidad * l.precio_unitario                          as venta_bruta,
    l.cantidad * l.precio_unitario * l.descuento_pct        as descuento,
    l.cantidad * l.precio_unitario * (1 - l.descuento_pct)  as venta_neta,
    l.cantidad * l.costo_unitario                           as costo
from lineas l
join pedidos p   using (pedido_id)
join productos pr using (producto_id)
join tiendas t   on t.tienda_id = p.tienda_id
