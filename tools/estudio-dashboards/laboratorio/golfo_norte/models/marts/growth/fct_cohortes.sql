-- Retención por cohorte: % de la cohorte que compra en el mes N desde su alta, por origen.
-- Excluye la base inicial (clientes que ya compraban en el primer mes de datos).
with cm as (select * from {{ ref('fct_clientes_mes') }} where cohorte_mes > (select min(mes) from {{ ref('fct_clientes_mes') }})),
tam as (select cohorte_mes, origen, count(distinct cliente_id) as tamano from cm where es_nuevo = 1 group by 1, 2),
ret3 as (
    select c.cohorte_mes, c.origen, count(distinct c.cliente_id) as retenidos_m3
    from cm c where c.meses_desde_alta between 1 and 3 group by 1, 2
),
curva as (
    select cohorte_mes, origen, meses_desde_alta, count(distinct cliente_id) as activos
    from cm group by 1, 2, 3
)
select
    k.cohorte_mes || '-' || k.origen || '-' || k.meses_desde_alta as cohorte_id,
    k.cohorte_mes, k.origen, k.meses_desde_alta, k.activos, t.tamano,
    round(100.0 * k.activos / t.tamano, 1) as retencion_pct,
    case when k.meses_desde_alta = 0 then coalesce(r.retenidos_m3, 0) else 0 end as retenidos_m3,
    case when k.meses_desde_alta = 0 then t.tamano else 0 end                    as tamano_base,
    -- solo cohortes con 3 meses completos de observación cuentan para retención M+3
    k.cohorte_mes + interval 3 month <= (select max(mes) from cm) as cohorte_madura
from curva k
join tam t using (cohorte_mes, origen)
left join ret3 r using (cohorte_mes, origen)
