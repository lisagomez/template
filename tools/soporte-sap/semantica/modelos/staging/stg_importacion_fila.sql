-- El resultado de cada fila importada (limpia, en revisión o descartada), sin su contenido ni su motivo.
select
  crudo_id::text          as crudo_id,
  indice,
  crudo_id::text || '#' || indice::text as fila_id,
  consultora_id::text     as consultora_id,
  cliente_id::text        as cliente_id,
  herramienta,
  version_mapeo,
  resultado,
  decidido_en::timestamptz as decidido_en
from {{ entrada('ss_importacion_fila') }}
