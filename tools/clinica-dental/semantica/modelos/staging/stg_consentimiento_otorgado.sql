-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'consentimiento')::text as consentimiento,
  (datos::jsonb ->> 'version_aviso')::text as version_aviso
from {{ ref('raw_eventos') }}
where tipo = 'consentimiento_otorgado'
