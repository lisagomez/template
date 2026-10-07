-- El resultado del reloj de SLA (src/sla.ts es su ÚNICA definición): aquí no se recalcula nada.
select distinct on (incidencia_id)
  incidencia_id::text   as incidencia_id,
  contrato_id,
  contrato_version,
  prioridad,
  respuesta_min,
  resolucion_min,
  meta_respuesta_min,
  meta_resolucion_min,
  cumple_respuesta,
  cumple_resolucion,
  estado                as estado_reloj,
  pausado_min,
  reabierta,
  espero_cliente
from {{ entrada('ss_sla_resultado') }}
order by incidencia_id, contrato_version desc
