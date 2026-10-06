-- Ninguna incidencia se pierde entre staging y la tabla de hechos (los joins son internos).
select 'faltan hechos' as problema
from (select count(*) as n from {{ ref('stg_incidencia') }}) a
cross join (select count(*) as n from {{ ref('fct_incidencia') }}) b
where a.n <> b.n
