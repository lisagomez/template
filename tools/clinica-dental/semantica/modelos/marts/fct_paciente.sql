-- Un paciente registrado por fila: de dónde llegó, cómo se registró y cuánto tardó en confirmar su primera cita.
with reg as (select * from {{ ref('stg_paciente_registrado') }}),
primera as (select clinica, sujeto, min(en) as primera_cita_en from {{ ref('stg_cita_confirmada') }} group by 1, 2)
select
  reg.clinica || ':' || reg.sujeto as paciente_id, reg.clinica, reg.sujeto as paciente, reg.en as registrado_en,
  reg.canal_adquisicion, reg.via, reg.menor, reg.convenio, reg.segundos_registro, primera.primera_cita_en,
  case when primera.primera_cita_en is null then null else extract(epoch from (primera.primera_cita_en - reg.en)) / 3600.0 end as horas_registro_a_cita
from reg left join primera on primera.clinica = reg.clinica and primera.sujeto = reg.sujeto
