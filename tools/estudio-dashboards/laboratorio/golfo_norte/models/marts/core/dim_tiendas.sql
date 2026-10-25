select
    t.*,
    -- Tienda comparable: abierta antes del inicio del año anterior completo al corte.
    t.fecha_apertura < date_trunc('year', cast('{{ var("fecha_corte") }}' as date)) - interval 1 year as es_comparable
from {{ ref('stg_tiendas') }} t
