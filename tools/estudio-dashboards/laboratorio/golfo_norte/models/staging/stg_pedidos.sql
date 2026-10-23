select
    pedido_id,
    cast(fecha as date)                   as fecha_pedido,
    tienda_id,
    cliente_id,
    canal,
    nullif(campana_id, '')                as campana_id,
    lower(estatus)                        as estatus,
    lower(estatus) = 'devuelto'           as es_devuelto
from {{ source('raw', 'pedidos') }}
