-- Una fila por incidencia (la última versión si una carga la repite), módulo en mayúsculas y
-- prioridad dentro del vocabulario ITIL. Sin texto: el rol de métricas no lo puede leer.
select distinct on (id)
  id::text                              as incidencia_id,
  consultora_id::text                   as consultora_id,
  cliente_id::text                      as cliente_id,
  sistema,
  upper(coalesce(modulo, 'SIN_MODULO')) as modulo,
  prioridad,
  coalesce(complejidad, 'alta')         as complejidad,
  regla_aplicada,
  estado,
  creada_en::timestamptz                as creada_en,
  primera_respuesta_en::timestamptz     as primera_respuesta_en,
  resuelta_en::timestamptz              as resuelta_en,
  cerrada_en::timestamptz               as cerrada_en
from {{ entrada('ss_incidencia') }}
order by id, creada_en desc
