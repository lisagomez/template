-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'motivo')::text as motivo,
  (datos::jsonb ->> 'horas_antes')::numeric as horas_antes,
  (datos::jsonb ->> 'via')::text as via
from {{ ref('raw_eventos') }}
where tipo = 'cita_cancelada'
