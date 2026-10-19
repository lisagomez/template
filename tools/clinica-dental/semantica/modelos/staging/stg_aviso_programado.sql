-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'aviso')::text as aviso,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'canal')::text as canal,
  (datos::jsonb ->> 'clase')::text as clase,
  (datos::jsonb ->> 'para')::timestamptz as para
from {{ ref('raw_eventos') }}
where tipo = 'aviso_programado'
