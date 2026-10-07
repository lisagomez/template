-- Cada cliente tiene una fila por mes desde su alta, sin huecos ni meses repetidos.
select cliente_id
from {{ ref('fct_cliente_mes') }}
group by cliente_id
having count(*) <> max(meses_desde_alta) + 1 or min(meses_desde_alta) <> 0
