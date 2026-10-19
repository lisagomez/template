-- Cada vez que la recepción toma un chat de WhatsApp: porque contestó desde su celular (coexistencia) o porque la
-- persona pidió hablar con alguien.
select r.clinica || ':' || r.evento_id as recepcion_id, r.clinica, r.en, r.sujeto, r.conversacion, r.motivo
from {{ ref('stg_recepcion_atiende') }} r
