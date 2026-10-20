-- Grano: un pedido (incluye devueltos) con totales.
select
    p.pedido_id, p.fecha_pedido, p.tienda_id, p.cliente_id, p.canal, p.campana_id, p.estatus,
    case when p.es_devuelto then 1 else 0 end as es_devuelto_flag,
    sum(l.venta_neta) as importe_neto,
    sum(l.cantidad)   as unidades
from {{ ref('stg_pedidos') }} p
join {{ ref('int_lineas_enriquecidas') }} l using (pedido_id)
group by all
