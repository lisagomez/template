-- Una fila por cliente con su cohorte (mes de primera compra) y origen de adquisición.
with ped as (
    select cliente_id,
           max(fecha_pedido) as ultima_compra,
           count(*)          as pedidos_historicos
    from {{ ref('stg_pedidos') }}
    where not es_devuelto
    group by 1
)
select
    c.*,
    date_trunc('month', c.fecha_alta)                                        as cohorte_mes,
    case when c.campana_adquisicion is not null then 'Campaña' else 'Orgánico' end as origen,
    ped.ultima_compra,
    coalesce(ped.pedidos_historicos, 0)                                      as pedidos_historicos
from {{ ref('stg_clientes') }} c
left join ped using (cliente_id)
