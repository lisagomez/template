-- GENERADO desde el contrato de eventos v1 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'conversacion')::text as conversacion,
  (datos::jsonb ->> 'regla')::text as regla,
  (datos::jsonb ->> 'destino')::text as destino
from {{ ref('raw_eventos') }}
where tipo = 'urgencia_derivada'
