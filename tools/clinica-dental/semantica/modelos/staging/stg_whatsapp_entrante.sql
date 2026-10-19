-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'conversacion')::text as conversacion,
  (datos::jsonb ->> 'tipo_mensaje')::text as tipo_mensaje,
  (datos::jsonb ->> 'manejo')::text as manejo,
  (datos::jsonb ->> 'vinculado')::boolean as vinculado
from {{ ref('raw_eventos') }}
where tipo = 'whatsapp_entrante'
