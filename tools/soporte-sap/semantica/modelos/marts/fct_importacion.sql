-- Una fila por fila importada: el onboarding de los datos de una consultora.
select
  fila_id,
  crudo_id,
  consultora_id,
  cliente_id,
  herramienta,
  version_mapeo,
  resultado,
  decidido_en
from {{ ref('stg_importacion_fila') }}
