-- Una conversación con el asistente por fila: turnos, costo (null si ningún turno trajo costo: no es cero) y urgencias.
with u as (select clinica, conversacion, count(*) as urgencias from {{ ref('stg_urgencia_derivada') }} group by 1, 2)
select
  t.clinica || ':' || t.conversacion as conversacion_id, t.clinica, t.conversacion, min(t.en) as inicio, count(*) as turnos,
  sum(t.costo_usd) as costo_usd, count(t.costo_usd) as turnos_con_costo, coalesce(max(u.urgencias), 0) as urgencias
from {{ ref('stg_asistente_turno') }} t
left join u on u.clinica = t.clinica and u.conversacion = t.conversacion
group by t.clinica, t.conversacion
