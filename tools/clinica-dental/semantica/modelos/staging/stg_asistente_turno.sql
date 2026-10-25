-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v1 por semantica/genera.ts. No lo edites a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'conversacion')::text as conversacion,
  (datos::jsonb ->> 'modo')::text as modo,
  (datos::jsonb ->> 'ruta')::text as ruta,
  (datos::jsonb ->> 'intencion')::text as intencion,
  (datos::jsonb ->> 'latencia_ms')::numeric as latencia_ms,
  (datos::jsonb ->> 'costo_usd')::numeric as costo_usd,
  (datos::jsonb ->> 'tokens_entrada')::numeric as tokens_entrada,
  (datos::jsonb ->> 'tokens_salida')::numeric as tokens_salida,
  (datos::jsonb ->> 'uso_padecimiento')::boolean as uso_padecimiento
from {{ ref('raw_eventos') }}
where tipo = 'asistente_turno'
