-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'aviso')::text as aviso,
  (datos::jsonb ->> 'canal')::text as canal,
  (datos::jsonb ->> 'clase')::text as clase,
  (datos::jsonb ->> 'intento')::numeric as intento
from {{ ref('raw_eventos') }}
where tipo = 'aviso_enviado'
