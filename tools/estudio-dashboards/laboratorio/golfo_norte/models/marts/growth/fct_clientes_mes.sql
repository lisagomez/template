-- Grano: cliente × mes activo. Fuente de métricas de clientes activos, nuevos y frecuencia.
select
    m.cliente_id || '-' || strftime(m.mes, '%Y-%m') as cliente_mes_id,
    m.cliente_id, m.mes, m.tienda_id, m.pedidos, m.venta_neta, m.cohorte_mes, m.estado, m.meses_desde_alta,
    case when m.estado = 'nuevo' then 1 else 0 end      as es_nuevo,
    case when m.estado = 'retenido' then 1 else 0 end   as es_retenido,
    case when m.estado = 'reactivado' then 1 else 0 end as es_reactivado,
    case when m.estado = 'base_inicial' then 1 else 0 end as es_base_inicial,
    c.origen, c.canal_adquisicion, c.segmento
from {{ ref('int_cliente_mes') }} m
join {{ ref('dim_clientes') }} c using (cliente_id)
