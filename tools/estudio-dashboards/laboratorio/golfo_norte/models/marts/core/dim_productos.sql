select
    *,
    {{ margen_pct('precio_lista', 'costo_unitario') }} as margen_lista_pct
from {{ ref('stg_productos') }}
