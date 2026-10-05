-- Organizaciones del árbol: laboratorio → consultora → cliente, con el perfil del cliente.
select
  id::text                 as organizacion_id,
  tipo,
  padre_id::text           as padre_id,
  creada_en::timestamptz   as creada_en,
  tamano,
  sistema,
  usuarios_sap
from {{ entrada('ss_organizacion') }}
