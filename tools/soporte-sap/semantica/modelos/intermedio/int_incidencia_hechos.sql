-- Los hechos de cada incidencia, enriquecidos con el reloj de SLA, las horas y el perfil del cliente.
-- Aquí se definen UNA vez las banderas que usan las métricas (resuelta, primer contacto, SLA medido).
with horas as (
  select incidencia_id, sum(minutos) / 60.0 as horas_consultor
  from {{ ref('stg_horas') }}
  group by incidencia_id
)
select
  i.incidencia_id,
  i.consultora_id,
  i.cliente_id,
  c.tamano,
  i.sistema,
  i.modulo,
  i.prioridad,
  i.complejidad,
  i.prioridad in ('P1', 'P2')                                            as es_critica,
  i.complejidad = 'alta'                                                 as es_compleja,
  i.estado,
  i.creada_en,
  i.primera_respuesta_en,
  i.resuelta_en,
  i.estado in ('resuelta', 'cerrada')                                    as esta_resuelta,
  i.regla_aplicada is not null                                           as resuelta_por_regla,
  s.reabierta,
  s.espero_cliente,
  -- Resolución al primer contacto: resuelta sin esperar al cliente y sin reabrirse.
  i.estado in ('resuelta', 'cerrada') and not s.reabierta and not s.espero_cliente as primer_contacto,
  case when i.primera_respuesta_en is not null then s.respuesta_min / 60.0 end   as respuesta_horas,
  case when i.estado in ('resuelta', 'cerrada') then s.resolucion_min / 60.0 end as resolucion_horas,
  s.pausado_min,
  -- SLA MEDIDO: hay meta y el reloj ya decidió (cumplió o se pasó). Lo que sigue en plazo no cuenta.
  s.cumple_respuesta is not null                                         as sla_respuesta_medido,
  coalesce(s.cumple_respuesta, false)                                    as sla_respuesta_cumplido,
  s.cumple_resolucion is not null                                        as sla_resolucion_medido,
  coalesce(s.cumple_resolucion, false)                                   as sla_resolucion_cumplido,
  coalesce(h.horas_consultor, 0)                                         as horas_consultor
from {{ ref('stg_incidencia') }} i
join {{ ref('stg_sla_resultado') }} s using (incidencia_id)
join {{ ref('stg_organizacion') }} c on c.organizacion_id = i.cliente_id
left join horas h using (incidencia_id)
