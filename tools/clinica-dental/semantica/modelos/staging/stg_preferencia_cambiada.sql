-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'preferencia')::text as preferencia,
  (datos::jsonb ->> 'habilitado')::boolean as habilitado
from {{ ref('raw_eventos') }}
where tipo = 'preferencia_cambiada'
