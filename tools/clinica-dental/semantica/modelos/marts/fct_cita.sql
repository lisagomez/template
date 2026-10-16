-- Una cita confirmada por fila, con cómo terminó (asistió, no asistió, cancelada, reprogramada o pendiente), su
-- precio y su costo variable SUPUESTO (de la declaración de la clínica) y el canal por el que llegó el paciente.
with c as (select * from {{ ref('stg_cita_confirmada') }}),
cancel as (select clinica, cita, max(motivo) as motivo from {{ ref('stg_cita_cancelada') }} group by 1, 2),
asis as (select clinica, cita, bool_or(asistio) as asistio from {{ ref('stg_cita_asistencia') }} group by 1, 2),
pac as (select clinica, sujeto, canal_adquisicion from {{ ref('stg_paciente_registrado') }})
select
  c.clinica || ':' || c.cita as cita_id, c.clinica, c.cita, c.sujeto as paciente, c.en as confirmada_en, c.inicio, c.categoria, c.servicio,
  c.anticipacion_horas, jsonb_array_length(c.canales) as canales_aviso, c.via,
  case when cancel.motivo = 'reprogramada' then 'reprogramada' when cancel.motivo is not null then 'cancelada'
       when asis.asistio is true then 'asistio' when asis.asistio is false then 'inasistencia' else 'pendiente' end as estado_final,
  s.precio_mxn, s.costo_variable_mxn, pac.canal_adquisicion
from c
left join cancel on cancel.clinica = c.clinica and cancel.cita = c.cita
left join asis on asis.clinica = c.clinica and asis.cita = c.cita
left join {{ ref('servicios') }} s on s.clinica = c.clinica and s.servicio = c.servicio
left join pac on pac.clinica = c.clinica and pac.sujeto = c.sujeto
