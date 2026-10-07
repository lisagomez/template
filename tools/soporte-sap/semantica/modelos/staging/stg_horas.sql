-- Horas de consultor por incidencia (sin quién: el rol de métricas no lee la columna `consultor`).
select
  consultora_id::text  as consultora_id,
  cliente_id::text     as cliente_id,
  incidencia_id::text  as incidencia_id,
  minutos,
  fecha::date          as fecha
from {{ entrada('ss_horas') }}
where minutos > 0
