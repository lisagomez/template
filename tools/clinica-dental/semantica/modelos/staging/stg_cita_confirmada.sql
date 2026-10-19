-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
select
  clinica,
  seq,
  evento_id,
  en::timestamptz as en,
  sujeto,
  (datos::jsonb ->> 'cita')::text as cita,
  (datos::jsonb ->> 'categoria')::text as categoria,
  (datos::jsonb ->> 'servicio')::text as servicio,
  (datos::jsonb ->> 'inicio')::timestamptz as inicio,
  (datos::jsonb ->> 'duracion_min')::numeric as duracion_min,
  (datos::jsonb ->> 'anticipacion_horas')::numeric as anticipacion_horas,
  (datos::jsonb -> 'canales') as canales,
  (datos::jsonb ->> 'via')::text as via
from {{ ref('raw_eventos') }}
where tipo = 'cita_confirmada'
