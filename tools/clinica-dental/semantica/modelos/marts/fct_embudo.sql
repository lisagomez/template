-- Un visitante por fila (seudónimo al azar por pestaña) y hasta dónde llegó: visita → inicio de registro → registro →
-- cita → asistencia. El canal es el de su llegada.
with vis as (select clinica, sujeto as visitante, min(en) as visita_en, min(canal_adquisicion) as canal, min(dispositivo) as dispositivo from {{ ref('stg_portal_visitado') }} group by 1, 2),
ini as (select clinica, sujeto as visitante, min(en) as inicio_en from {{ ref('stg_registro_iniciado') }} group by 1, 2),
reg as (select clinica, visitante, min(sujeto) as paciente from {{ ref('stg_paciente_registrado') }} where visitante is not null group by 1, 2),
cita as (select clinica, sujeto as paciente, min(en) as cita_en from {{ ref('stg_cita_confirmada') }} group by 1, 2),
asis as (
  select c.clinica, c.sujeto as paciente, bool_or(a.asistio) as asistio
  from {{ ref('stg_cita_asistencia') }} a join {{ ref('stg_cita_confirmada') }} c on c.clinica = a.clinica and c.cita = a.cita group by 1, 2
)
select
  vis.clinica || ':' || vis.visitante as embudo_id, vis.clinica, vis.visitante, vis.visita_en, vis.canal, vis.dispositivo,
  ini.inicio_en is not null as inicio_registro, reg.paciente is not null as registrado, cita.cita_en is not null as con_cita, coalesce(asis.asistio, false) as asistio
from vis
left join ini on ini.clinica = vis.clinica and ini.visitante = vis.visitante
left join reg on reg.clinica = vis.clinica and reg.visitante = vis.visitante
left join cita on cita.clinica = reg.clinica and cita.paciente = reg.paciente
left join asis on asis.clinica = reg.clinica and asis.paciente = reg.paciente
