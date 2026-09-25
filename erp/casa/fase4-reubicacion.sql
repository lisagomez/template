-- ═══════════════════════════════════════════════════════════════════
-- PRP-004 · Fase 4 · re-ubicación del ERP en el catálogo de LA CASA
-- ═══════════════════════════════════════════════════════════════════
-- ⛔ GATE HUMANO. Escrito y ensayado (erp/casa/ensayo-fase4.sh); NO se ha
--    corrido en producción. Se corre solo con el sí del laboratorio, y quien
--    aprueba queda en la bitácora (variable aprobado_por, obligatoria).
--
-- Qué cambia (medido en producción el 2026-09-25, solo lectura):
--   · ACT-0012 «ERP agéntico (ERP-0)», activo, ubicacion 'erp/' (relativa al
--     repo de origen) → 'template/erp/'. Conserva folio, costo, versiones y
--     clasificación: es re-ubicación, no baja + alta (Gotcha del PRP).
-- Qué NO cambia, a propósito:
--   · ACT-0002 «dummy gate D», en BAJA, ubicacion 'businessos/erp/bin/…': es el
--     activo de prueba del cierre del 2026-07-26. Re-ubicarlo falsearía la
--     historia (ese archivo nunca existió en el template). El detector ignora
--     las filas en baja.
--   · El SQL que planteaba el PRP (where ubicacion like 'businessos/erp/%')
--     habría movido SOLO a ACT-0002 y dejado el ERP donde estaba.
--
-- Uso (el puente interino, D-03; nunca service_role):
--   psql "$ERP_DB_URL" -v aprobado_por='<id del humano que aprueba>' \
--        -v cliente='<ERP_TENANT_ID de la casa>' -f erp/casa/fase4-reubicacion.sql
-- Reverso (mismo gate): el mismo archivo con -v reverso=1 deja 'erp/' otra vez.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\if :{?aprobado_por}
\else
  \echo 'falta -v aprobado_por=…: una re-ubicación sin aprobador no se corre'
  \quit 3
\endif
\if :{?cliente}
\else
  \echo 'falta -v cliente=<uuid del tenant de la casa>'
  \quit 3
\endif
\if :{?reverso}
  \set de 'template/erp/'
  \set a 'erp/'
\else
  \set de 'erp/'
  \set a 'template/erp/'
\endif
select gen_random_uuid() as traza \gset

begin;
set local role rol_exe_fin;
select set_config('app.cliente_id', :'cliente', true) \g /dev/null
select set_config('fase4.de', :'de', true), set_config('fase4.a', :'a', true) \g /dev/null

-- Totales ANTES (los mismos deben quedar DESPUÉS)
select count(*) as n_antes, count(distinct folio) as folios_antes, sum(costo_acumulado) as costo_antes
  from erp.act_activo \gset
select set_config('fase4.n', :'n_antes', true), set_config('fase4.folios', :'folios_antes', true),
       set_config('fase4.costo', :'costo_antes', true) \g /dev/null

do $$
declare n int;
begin
  update erp.act_activo
     set ubicacion = current_setting('fase4.a'), updated_at = now()
   where folio = 'ACT-0012' and estado = 'activo' and ubicacion = current_setting('fase4.de');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'ACT-0012 no está como se midió (activo, %): % filas; no se re-ubica nada',
      current_setting('fase4.de'), n;
  end if;
end $$;

insert into erp.sis_bitacora (cliente_id, traza_id, actor, actor_tipo, modulo, verbo,
                              entidad_tipo, entidad_id, payload, resultado, aprobado_por)
values (:'cliente', :'traza', 'prp-004-fase-4', 'humano', 'act', 'reubicar',
        'act_activo', 'ACT-0012',
        jsonb_build_object('de', :'de', 'a', :'a', 'prp', 'PRP-004 fase 4',
                           'motivo', 'el ERP vive en el monorepo privado (template/erp/)'),
        'ok', :'aprobado_por');

-- Totales DESPUÉS: si algo más se movió, no se confirma nada.
do $$
begin
  if (select count(*) from erp.act_activo) <> current_setting('fase4.n')::int
     or (select count(distinct folio) from erp.act_activo) <> current_setting('fase4.folios')::int
     or (select sum(costo_acumulado) from erp.act_activo) <> current_setting('fase4.costo')::numeric then
    raise exception 'los totales del catálogo cambiaron: se deshace';
  end if;
end $$;
commit;
\echo 'ACT-0012 re-ubicado:' :'de' '->' :'a' ' · traza' :'traza'
