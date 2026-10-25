select
    tienda_id || '-' || producto_id as inventario_id,
    tienda_id, producto_id, fecha_corte, existencias, punto_reorden,
    case when existencias < punto_reorden then 1 else 0 end as bajo_reorden_flag
from {{ ref('stg_inventario') }}
