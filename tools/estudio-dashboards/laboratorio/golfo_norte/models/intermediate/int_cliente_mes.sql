-- Grano: cliente × mes con compra. Clasifica cada mes activo en base_inicial, nuevo, retenido o reactivado.
with base as (
    select cliente_id,
           date_trunc('month', fecha_pedido) as mes,
           any_value(tienda_id)              as tienda_id,
           count(distinct pedido_id)         as pedidos,
           sum(venta_neta)                   as venta_neta
    from {{ ref('int_lineas_enriquecidas') }}
    where not es_devuelto
    group by 1, 2
),
marcado as (
    select b.*,
           lag(mes) over (partition by cliente_id order by mes)  as mes_anterior,
           min(mes) over (partition by cliente_id)               as cohorte_mes
    from base b
)
select
    cliente_id, mes, tienda_id, pedidos, venta_neta, cohorte_mes,
    case
        -- quien ya compraba en el primer mes de datos es base inicial, no cliente nuevo
        when mes = cohorte_mes and cohorte_mes = (select min(mes) from base) then 'base_inicial'
        when mes = cohorte_mes                         then 'nuevo'
        when mes_anterior = mes - interval 1 month     then 'retenido'
        else 'reactivado'
    end as estado,
    date_diff('month', cohorte_mes, mes) as meses_desde_alta
from marcado
