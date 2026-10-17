-- El recorrido del paciente como ARISTAS (desde → hacia), cada una con el tiempo entre los dos eventos del MISMO
-- sujeto. Es la materia del grafo de atención: conteo y p50 por arista salen de MetricFlow, no de aquí.
--   visita → registro → consentimientos → agenda → cita → avisos → asistencia | inasistencia
--   ramas: cita → cancelada | reprogramada; visita/registro → asistente → urgencia; registro → baja
with vis as (select clinica, sujeto as visitante, min(en) as en from {{ ref('stg_portal_visitado') }} group by 1, 2),
reg as (select clinica, visitante, sujeto, en from {{ ref('stg_paciente_registrado') }}),
con as (select clinica, sujeto, min(en) as en from {{ ref('stg_consentimiento_otorgado') }} where consentimiento = 'aviso_privacidad' group by 1, 2),
sol as (select clinica, sujeto, min(en) as en from {{ ref('stg_cita_solicitada') }} group by 1, 2),
conf as (select clinica, sujeto, cita, en from {{ ref('stg_cita_confirmada') }}),
primera as (select clinica, sujeto, min(en) as en from conf group by 1, 2),
aviso as (
  select p.clinica, p.cita, min(e.en) as en
  from {{ ref('stg_aviso_programado') }} p join {{ ref('stg_aviso_entregado') }} e on e.clinica = p.clinica and e.aviso = p.aviso
  where p.cita is not null group by 1, 2
),
asis as (select clinica, cita, asistio, en from {{ ref('stg_cita_asistencia') }}),
canc as (select clinica, cita, motivo, en from {{ ref('stg_cita_cancelada') }}),
tur as (select clinica, sujeto, conversacion, min(en) as en from {{ ref('stg_asistente_turno') }} group by 1, 2, 3),
urg as (select clinica, conversacion, min(en) as en from {{ ref('stg_urgencia_derivada') }} group by 1, 2),
baja as (select clinica, sujeto, min(en) as en from {{ ref('stg_newsletter_baja') }} group by 1, 2),
aristas as (
  select vis.clinica, reg.sujeto, 'visita' as desde, 'registro' as hacia, reg.en, extract(epoch from reg.en - vis.en) as segundos
    from vis join reg on reg.clinica = vis.clinica and reg.visitante = vis.visitante
  union all select reg.clinica, reg.sujeto, 'registro', 'consentimientos', con.en, extract(epoch from con.en - reg.en)
    from reg join con on con.clinica = reg.clinica and con.sujeto = reg.sujeto
  union all select con.clinica, con.sujeto, 'consentimientos', 'agenda', sol.en, extract(epoch from sol.en - con.en)
    from con join sol on sol.clinica = con.clinica and sol.sujeto = con.sujeto
  union all select sol.clinica, sol.sujeto, 'agenda', 'cita', primera.en, extract(epoch from primera.en - sol.en)
    from sol join primera on primera.clinica = sol.clinica and primera.sujeto = sol.sujeto
  union all select conf.clinica, conf.sujeto, 'cita', 'avisos', aviso.en, extract(epoch from aviso.en - conf.en)
    from conf join aviso on aviso.clinica = conf.clinica and aviso.cita = conf.cita
  union all select conf.clinica, conf.sujeto, 'avisos', case when asis.asistio then 'asistencia' else 'inasistencia' end, asis.en, extract(epoch from asis.en - aviso.en)
    from conf join aviso on aviso.clinica = conf.clinica and aviso.cita = conf.cita join asis on asis.clinica = conf.clinica and asis.cita = conf.cita
  union all select conf.clinica, conf.sujeto, 'cita', case when canc.motivo = 'reprogramada' then 'reprogramada' else 'cancelada' end, canc.en, extract(epoch from canc.en - conf.en)
    from conf join canc on canc.clinica = conf.clinica and canc.cita = conf.cita
  union all select tur.clinica, tur.sujeto, case when tur.sujeto like 'vis_%' then 'visita' else 'registro' end, 'asistente', tur.en,
      extract(epoch from tur.en - coalesce(vis.en, reg.en))
    from tur left join vis on vis.clinica = tur.clinica and vis.visitante = tur.sujeto left join reg on reg.clinica = tur.clinica and reg.sujeto = tur.sujeto
    where coalesce(vis.en, reg.en) is not null
  union all select tur.clinica, tur.sujeto, 'asistente', 'urgencia', urg.en, extract(epoch from urg.en - tur.en)
    from tur join urg on urg.clinica = tur.clinica and urg.conversacion = tur.conversacion
  union all select reg.clinica, reg.sujeto, 'registro', 'baja', baja.en, extract(epoch from baja.en - reg.en)
    from reg join baja on baja.clinica = reg.clinica and baja.sujeto = reg.sujeto
)
select row_number() over (order by clinica, desde, hacia, en, sujeto) as transicion_id, clinica, sujeto, desde, hacia, desde || '→' || hacia as arista, en, greatest(segundos, 0) as segundos
from aristas
