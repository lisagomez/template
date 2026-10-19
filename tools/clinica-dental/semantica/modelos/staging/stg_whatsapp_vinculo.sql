-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'paso')::text as paso,
  (datos::jsonb ->> 'coincide_celular')::boolean as coincide_celular
from {{ ref('raw_eventos') }}
where tipo = 'whatsapp_vinculo'
