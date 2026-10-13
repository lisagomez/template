-- La tabla de hechos que lee MetricFlow: una fila por incidencia.
select * from {{ ref('int_incidencia_hechos') }}
