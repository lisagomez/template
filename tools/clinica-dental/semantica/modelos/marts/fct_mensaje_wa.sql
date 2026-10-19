-- Un mensaje de WhatsApp que Meta reportó ENTREGADO (o leído), con lo que vale: su categoría (utility, service…),
-- si fue cobrable y el costo con la tarifa de lista de México. `mensaje`: aviso del portal o respuesta en el chat.
select
  w.clinica || ':' || w.evento_id as mensaje_id, w.clinica, w.en, w.sujeto, w.categoria, w.tipo_precio, w.billable, w.costo_usd, w.mensaje
from {{ ref('stg_whatsapp_cobro') }} w
