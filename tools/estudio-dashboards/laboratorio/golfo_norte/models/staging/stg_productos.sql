select
    producto_id,
    nombre                                as producto_nombre,
    categoria,
    cast(precio_lista as decimal(12,2))   as precio_lista,
    cast(costo_unitario as decimal(12,2)) as costo_unitario
from {{ source('raw', 'productos') }}
