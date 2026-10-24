-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'cita_anterior')::text as cita_anterior,
  (datos::jsonb ->> 'inicio_anterior')::timestamptz as inicio_anterior,
  (datos::jsonb ->> 'inicio_nuevo')::timestamptz as inicio_nuevo
from {{ ref('raw_eventos') }}
where tipo = 'cita_reprogramada'
