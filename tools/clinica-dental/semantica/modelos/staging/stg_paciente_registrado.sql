-- GENERADO desde el contrato de eventos v1 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'visitante')::text as visitante,
  (datos::jsonb ->> 'via')::text as via,
  (datos::jsonb ->> 'menor')::boolean as menor,
  (datos::jsonb ->> 'convenio')::boolean as convenio,
  (datos::jsonb -> 'categorias') as categorias,
  (datos::jsonb ->> 'canal_adquisicion')::text as canal_adquisicion,
  (datos::jsonb ->> 'segundos_registro')::numeric as segundos_registro
from {{ ref('raw_eventos') }}
where tipo = 'paciente_registrado'
