select
    campana_id,
    nombre                                 as campana_nombre,
    plataforma,
    cast(inicio as date)                   as fecha_inicio,
    cast(fin as date)                      as fecha_fin,
    cast(inversion_mxn as decimal(14,2))   as inversion_mxn
from {{ source('raw', 'campanas') }}
