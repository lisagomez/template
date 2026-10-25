-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
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
