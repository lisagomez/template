-- Un cliente por mes, con su etapa del ciclo de vida.
select cliente_mes_id, cliente_id, consultora_id, tamano, mes, meses_desde_alta, etapa
from {{ ref('int_cliente_ciclo') }}
