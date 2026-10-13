-- El ciclo de vida de cada cliente (N3), mes a mes, desde su alta hasta el último mes con datos.
-- Etapas (definición ÚNICA; los umbrales son SUPUESTOS del laboratorio, D11):
--   alta        el mes en que se dio de alta;
--   onboarding  después del alta y antes del mes de su primer valor (la primera incidencia resuelta);
--   renovacion  los meses 10 y 11 desde el alta (contrato anual: supuesto);
--   adopcion    del mes del primer valor hasta el tercer mes desde el alta;
--   operacion   después.
with clientes as (
  select organizacion_id as cliente_id, padre_id as consultora_id, tamano, creada_en as alta_en
  from {{ ref('stg_organizacion') }}
  where tipo = 'cliente'
),
primer_valor as (
  select cliente_id, min(resuelta_en) as primer_valor_en
  from {{ ref('stg_incidencia') }}
  where estado in ('resuelta', 'cerrada')
  group by cliente_id
),
ultimo_mes as (
  select date_trunc('month', max(creada_en)) as mes from {{ ref('stg_incidencia') }}
),
meses as (
  select c.*, p.primer_valor_en, gs::date as mes
  from clientes c
  left join primer_valor p using (cliente_id)
  cross join ultimo_mes u
  cross join lateral generate_series(date_trunc('month', c.alta_en), u.mes, interval '1 month') gs
)
select
  cliente_id || '#' || to_char(mes, 'YYYY-MM') as cliente_mes_id,
  cliente_id,
  consultora_id,
  tamano,
  mes,
  alta_en,
  primer_valor_en,
  (extract(year from age(mes, date_trunc('month', alta_en))) * 12 + extract(month from age(mes, date_trunc('month', alta_en))))::int as meses_desde_alta,
  case
    when mes = date_trunc('month', alta_en) then 'alta'
    when primer_valor_en is null or mes < date_trunc('month', primer_valor_en) then 'onboarding'
    when (extract(year from age(mes, date_trunc('month', alta_en))) * 12 + extract(month from age(mes, date_trunc('month', alta_en)))) in (10, 11) then 'renovacion'
    when (extract(year from age(mes, date_trunc('month', alta_en))) * 12 + extract(month from age(mes, date_trunc('month', alta_en)))) < 3 then 'adopcion'
    else 'operacion'
  end as etapa
from meses
