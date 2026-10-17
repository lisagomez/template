-- GENERADO desde el contrato de eventos v1 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'canal_adquisicion')::text as canal_adquisicion,
  (datos::jsonb ->> 'dispositivo')::text as dispositivo
from {{ ref('raw_eventos') }}
where tipo = 'portal_visitado'
