-- Un turno del asistente por fila: intención, ruta (enrutador, cerebro, urgencia, barrera), latencia y costo. Sin texto.
select
  t.clinica || ':' || t.evento_id as turno_id, t.clinica, t.sujeto, t.conversacion, t.en, t.modo, t.ruta, t.intencion,
  t.latencia_ms, t.costo_usd, t.tokens_entrada, t.tokens_salida, t.uso_padecimiento, t.sujeto like 'pac_%' as de_paciente,
  coalesce(t.canal, 'portal') as canal
from {{ ref('stg_asistente_turno') }} t
