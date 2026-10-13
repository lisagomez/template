-- La cuenta cerrada de cada crudo importado: los índices van de 0 a n−1 sin huecos, así que
-- entrada = limpias + revisión + descartadas. Devuelve los crudos que no cuadran (debe estar vacía).
select crudo_id, count(*) as filas, max(indice) + 1 as entrada
from {{ ref('stg_importacion_fila') }}
group by crudo_id
having max(indice) + 1 <> count(*)
