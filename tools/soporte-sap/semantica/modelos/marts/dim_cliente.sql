-- Un cliente (N3) con su perfil y su tiempo al primer valor (días del alta a la primera resolución).
select distinct on (cliente_id)
  cliente_id,
  consultora_id,
  tamano,
  alta_en,
  primer_valor_en,
  case when primer_valor_en is not null
       then round((extract(epoch from primer_valor_en - alta_en) / 86400.0)::numeric, 2) end as dias_al_primer_valor
from {{ ref('int_cliente_ciclo') }}
order by cliente_id, mes
