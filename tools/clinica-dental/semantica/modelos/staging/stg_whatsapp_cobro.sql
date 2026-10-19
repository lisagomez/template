-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'categoria')::text as categoria,
  (datos::jsonb ->> 'tipo_precio')::text as tipo_precio,
  (datos::jsonb ->> 'billable')::boolean as billable,
  (datos::jsonb ->> 'costo_usd')::numeric as costo_usd,
  (datos::jsonb ->> 'mensaje')::text as mensaje
from {{ ref('raw_eventos') }}
where tipo = 'whatsapp_cobro'
