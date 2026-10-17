-- GENERADO desde el contrato de eventos v1 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'via')::text as via
from {{ ref('raw_eventos') }}
where tipo = 'newsletter_baja'
