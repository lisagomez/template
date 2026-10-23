select
    tienda_id,
    nombre                        as tienda_nombre,
    estado,
    region,
    cast(lat as double)           as latitud,
    cast(lon as double)           as longitud,
    cast(fecha_apertura as date)  as fecha_apertura,
    cast(m2 as integer)           as superficie_m2
from {{ source('raw', 'tiendas') }}
