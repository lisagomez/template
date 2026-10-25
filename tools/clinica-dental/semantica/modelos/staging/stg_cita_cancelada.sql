-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'motivo')::text as motivo,
  (datos::jsonb ->> 'horas_antes')::numeric as horas_antes
from {{ ref('raw_eventos') }}
where tipo = 'cita_cancelada'
