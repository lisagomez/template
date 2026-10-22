select
    md5(pedido_id || '-' || producto_id) as linea_id,
    pedido_id,
    producto_id,
    cast(cantidad as integer)                              as cantidad,
    cast(precio_unitario as decimal(12,2))                 as precio_unitario,
    cast(descuento_pct as decimal(5,4))                    as descuento_pct,
    cast(costo_unitario as decimal(12,2))                  as costo_unitario
from {{ source('raw', 'lineas_pedido') }}
