select
    cliente_id,
    segmento,
    tienda_preferida                          as tienda_preferida_id,
    cast(fecha_alta as date)                  as fecha_alta,
    canal_adquisicion,
    nullif(campana_adquisicion, '')           as campana_adquisicion
from {{ source('raw', 'clientes') }}
