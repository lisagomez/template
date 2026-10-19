-- GENERADO desde el contrato de eventos v2 por semantica/genera.ts: no se edita a mano.
-- Convergencia: por cada tipo del contrato, las filas de su staging = los eventos que el libro tiene de ese tipo
-- (contados DIRECTO sobre el libro por corre.mjs, en la semilla conteo_libro). Cualquier fila aquí es una pérdida.
with staging as (
select 'portal_visitado' as tipo, count(*) as filas from {{ ref('stg_portal_visitado') }}
union all
select 'registro_iniciado' as tipo, count(*) as filas from {{ ref('stg_registro_iniciado') }}
union all
select 'paciente_registrado' as tipo, count(*) as filas from {{ ref('stg_paciente_registrado') }}
union all
select 'consentimiento_otorgado' as tipo, count(*) as filas from {{ ref('stg_consentimiento_otorgado') }}
union all
select 'consentimiento_retirado' as tipo, count(*) as filas from {{ ref('stg_consentimiento_retirado') }}
union all
select 'cita_solicitada' as tipo, count(*) as filas from {{ ref('stg_cita_solicitada') }}
union all
select 'cita_confirmada' as tipo, count(*) as filas from {{ ref('stg_cita_confirmada') }}
union all
select 'cita_reprogramada' as tipo, count(*) as filas from {{ ref('stg_cita_reprogramada') }}
union all
select 'cita_cancelada' as tipo, count(*) as filas from {{ ref('stg_cita_cancelada') }}
union all
select 'cita_asistencia' as tipo, count(*) as filas from {{ ref('stg_cita_asistencia') }}
union all
select 'aviso_programado' as tipo, count(*) as filas from {{ ref('stg_aviso_programado') }}
union all
select 'aviso_enviado' as tipo, count(*) as filas from {{ ref('stg_aviso_enviado') }}
union all
select 'aviso_entregado' as tipo, count(*) as filas from {{ ref('stg_aviso_entregado') }}
union all
select 'aviso_fallido' as tipo, count(*) as filas from {{ ref('stg_aviso_fallido') }}
union all
select 'aviso_cancelado' as tipo, count(*) as filas from {{ ref('stg_aviso_cancelado') }}
union all
select 'newsletter_baja' as tipo, count(*) as filas from {{ ref('stg_newsletter_baja') }}
union all
select 'telegram_vinculado' as tipo, count(*) as filas from {{ ref('stg_telegram_vinculado') }}
union all
select 'asistente_turno' as tipo, count(*) as filas from {{ ref('stg_asistente_turno') }}
union all
select 'urgencia_derivada' as tipo, count(*) as filas from {{ ref('stg_urgencia_derivada') }}
union all
select 'preferencia_cambiada' as tipo, count(*) as filas from {{ ref('stg_preferencia_cambiada') }}
union all
select 'whatsapp_vinculo' as tipo, count(*) as filas from {{ ref('stg_whatsapp_vinculo') }}
union all
select 'aviso_leido' as tipo, count(*) as filas from {{ ref('stg_aviso_leido') }}
union all
select 'asistencia_confirmada' as tipo, count(*) as filas from {{ ref('stg_asistencia_confirmada') }}
union all
select 'whatsapp_entrante' as tipo, count(*) as filas from {{ ref('stg_whatsapp_entrante') }}
union all
select 'whatsapp_cobro' as tipo, count(*) as filas from {{ ref('stg_whatsapp_cobro') }}
union all
select 'recepcion_atiende' as tipo, count(*) as filas from {{ ref('stg_recepcion_atiende') }}
)
select coalesce(s.tipo, c.tipo) as tipo, s.filas as en_staging, c.eventos as en_libro
from staging s full outer join {{ ref('conteo_libro') }} c on c.tipo = s.tipo
where coalesce(s.filas, 0) <> coalesce(c.eventos, 0)
