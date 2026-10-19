-- Un paso del embudo de vinculación del WhatsApp por fila: código emitido → mensaje recibido de un número →
-- confirmado o rechazado desde la cuenta → (después) desvinculado.
select
  v.clinica || ':' || v.evento_id as vinculo_evento_id, v.clinica, v.en, v.sujeto, v.paso, v.coincide_celular
from {{ ref('stg_whatsapp_vinculo') }} v
