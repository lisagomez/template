-- GENERADO desde el contrato de eventos v1 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'asistio')::boolean as asistio,
  (datos::jsonb ->> 'simulada')::boolean as simulada
from {{ ref('raw_eventos') }}
where tipo = 'cita_asistencia'
