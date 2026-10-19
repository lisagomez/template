-- Un mensaje que ENTRÓ por WhatsApp y cómo se atendió (asistente, vinculación, botón, Flow, foto, baja, recepción,
-- silencio, frontera). Ni el texto ni el número: solo su forma y si venía de un número vinculado.
select
  e.clinica || ':' || e.evento_id as entrante_id, e.clinica, e.en, e.sujeto, e.conversacion, e.tipo_mensaje, e.manejo, e.vinculado
from {{ ref('stg_whatsapp_entrante') }} e
