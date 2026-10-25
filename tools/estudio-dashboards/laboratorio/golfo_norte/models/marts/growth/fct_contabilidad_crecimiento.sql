-- Contabilidad de crecimiento por tienda y mes: nuevos + retenidos + reactivados − perdidos.
with cm as (select * from {{ ref('fct_clientes_mes') }}),
perdidos as (
    -- activos el mes anterior que no compraron este mes
    select a.tienda_id, a.mes + interval 1 month as mes, count(*) as perdidos
    from cm a
    left join cm b on b.cliente_id = a.cliente_id and b.mes = a.mes + interval 1 month
    where b.cliente_id is null
      and a.mes + interval 1 month <= (select max(mes) from cm)
    group by 1, 2
),
activos as (
    select tienda_id, mes,
           sum(es_nuevo) as nuevos, sum(es_retenido) as retenidos, sum(es_reactivado) as reactivados, sum(es_base_inicial) as base_inicial,
           count(*) as activos
    from cm group by 1, 2
)
select
    a.tienda_id || '-' || strftime(a.mes, '%Y-%m') as tienda_mes_id,
    a.tienda_id, a.mes, a.activos, a.base_inicial, a.nuevos, a.retenidos, a.reactivados,
    coalesce(p.perdidos, 0) as perdidos
from activos a
left join perdidos p using (tienda_id, mes)
