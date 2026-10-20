-- Falla si en algún tienda-mes los activos no son la suma de base inicial, nuevos, retenidos y reactivados.
select tienda_mes_id from {{ ref('fct_contabilidad_crecimiento') }}
where activos <> base_inicial + nuevos + retenidos + reactivados
