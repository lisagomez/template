select
    tienda_id,
    producto_id,
    cast(existencias as integer)    as existencias,
    cast(punto_reorden as integer)  as punto_reorden,
    cast(fecha_corte as date)       as fecha_corte
from {{ source('raw', 'inventario') }}
