-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
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
