-- Un aviso programado por fila y lo que le pasó: entregado, fallido (definitivo, con motivo), cancelado o pendiente.
with p as (select * from {{ ref('stg_aviso_programado') }}),
ent as (select clinica, aviso, max(en) as entregado_en, sum(costo_usd) as costo_usd from {{ ref('stg_aviso_entregado') }} group by 1, 2),
fal as (select clinica, aviso, bool_or(definitivo) as definitivo, max(motivo) filter (where definitivo) as motivo, count(*) as fallos from {{ ref('stg_aviso_fallido') }} group by 1, 2),
can as (select clinica, aviso, max(motivo) as motivo from {{ ref('stg_aviso_cancelado') }} group by 1, 2)
select
  p.clinica || ':' || p.aviso as aviso_id, p.clinica, p.aviso, p.sujeto as paciente, p.cita, p.canal, p.clase, p.en as programado_en, p.para,
  ent.aviso is not null as entregado, coalesce(fal.definitivo, false) and ent.aviso is null as fallido, fal.motivo as motivo_fallo,
  coalesce(fal.fallos, 0) as intentos_fallidos, can.aviso is not null as cancelado, can.motivo as motivo_cancelacion, ent.costo_usd, ent.entregado_en
from p
left join ent on ent.clinica = p.clinica and ent.aviso = p.aviso
left join fal on fal.clinica = p.clinica and fal.aviso = p.aviso
left join can on can.clinica = p.clinica and can.aviso = p.aviso
