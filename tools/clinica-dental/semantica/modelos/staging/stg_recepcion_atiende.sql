-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'conversacion')::text as conversacion,
  (datos::jsonb ->> 'motivo')::text as motivo
from {{ ref('raw_eventos') }}
where tipo = 'recepcion_atiende'
