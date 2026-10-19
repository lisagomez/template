-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'categoria')::text as categoria,
  (datos::jsonb ->> 'servicio')::text as servicio
from {{ ref('raw_eventos') }}
where tipo = 'cita_solicitada'
