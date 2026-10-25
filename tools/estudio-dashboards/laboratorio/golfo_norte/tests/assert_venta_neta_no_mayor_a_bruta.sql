-- Falla si alguna línea tiene venta neta mayor que la bruta (descuento negativo).
select linea_id from {{ ref('fct_ventas_lineas') }} where venta_neta > venta_bruta + 0.01
