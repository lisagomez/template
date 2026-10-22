-- ROAS incremental: ventas en la ventana de campaña menos un baseline
-- (promedio diario de los días -21 a -8 previos × días de campaña).
-- Método ingenuo: no controla estacionalidad; el agente debe advertirlo al usarlo.
with diario as (
    select fecha_pedido, sum(venta_neta) as venta_neta
    from {{ ref('int_ventas_diarias_tienda') }}
    group by 1
),
c as (select * from {{ ref('dim_campanas') }}),
ventana as (
    select c.campana_id, sum(d.venta_neta) as ventas_ventana
    from c join diario d on d.fecha_pedido between c.fecha_inicio and c.fecha_fin
    group by 1
),
base as (
    select c.campana_id,
           avg(d.venta_neta) * (date_diff('day', c.fecha_inicio, c.fecha_fin) + 1) as ventas_baseline
    from c join diario d
      on d.fecha_pedido between c.fecha_inicio - interval 21 day and c.fecha_inicio - interval 8 day
    group by c.campana_id, c.fecha_inicio, c.fecha_fin
)
select
    c.campana_id, c.campana_nombre, c.plataforma, c.fecha_inicio, c.fecha_fin, c.inversion_mxn,
    v.ventas_ventana,
    b.ventas_baseline,
    v.ventas_ventana - b.ventas_baseline                                   as ventas_incrementales,
    round((v.ventas_ventana - b.ventas_baseline) / c.inversion_mxn, 2)      as roas_incremental
from c
join ventana v using (campana_id)
join base b using (campana_id)
