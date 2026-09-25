-- ═══════════════════════════════════════════════════════════════════
-- PRP-004 · Fase 4 · re-ubicación del ERP en el catálogo de LA CASA
-- ═══════════════════════════════════════════════════════════════════
-- Aprobada por lisagomez (el laboratorio) el 2026-09-25: «apruebo la fase 4:
-- re-ubicar ACT-0012 en producción, con lisagomez (el laboratorio) como
-- aprobador». Ensayada antes contra una copia del catálogo
-- (erp/casa/ensayo-fase4.sh).
--
-- Qué cambia (medido en producción, solo lectura):
--   · ACT-0012 «ERP agéntico (ERP-0)», activo, ubicacion 'erp/' (relativa al
--     repo de origen) → 'template/erp/'. Conserva folio, costo, versiones y
--     clasificación: es re-ubicación, no baja + alta (Gotcha del PRP).
-- Qué NO cambia, a propósito:
--   · ACT-0002 «dummy gate D», en BAJA, ubicacion 'businessos/erp/bin/…': es el
--     activo de prueba del cierre del 2026-07-26. Re-ubicarlo falsearía la
--     historia. El detector ignora las filas en baja.
--
-- UN SOLO ARCHIVO para los dos sitios donde corre:
--   · SQL Editor de Supabase (entra como postgres, miembro de los roles por el
--     puente): se pega tal cual. Sin comandos de psql.
--   · Ensayo o psql: los parámetros se pueden fijar antes en la sesión
--       set fase4.cliente = '<uuid>'; set fase4.aprobado_por = '<quien>';
--       set fase4.sentido = 'vuelta';          -- el REVERSO
--     Si no vienen, valen los de la ejecución aprobada (abajo).
-- Todo en UNA transacción, como rol_exe_fin y con el tenant fijado (RLS real,
-- sin BYPASSRLS): si una guarda falla, no queda nada escrito.
-- ═══════════════════════════════════════════════════════════════════
begin;
set local role rol_exe_fin;
select set_config('app.cliente_id',
  coalesce(nullif(current_setting('fase4.cliente', true), ''), '2de8835a-439c-461a-990c-a2b95d29f3a4'),
  true);

do $$
declare
  aprobado text := coalesce(nullif(current_setting('fase4.aprobado_por', true), ''),
                            'lisagomez (el laboratorio)');
  vuelta   boolean := coalesce(nullif(current_setting('fase4.sentido', true), ''), 'ida') = 'vuelta';
  de       text := case when vuelta then 'template/erp/' else 'erp/' end;
  a        text := case when vuelta then 'erp/' else 'template/erp/' end;
  traza    uuid := gen_random_uuid();
  n int; n0 int; f0 int; c0 numeric;
begin
  -- Totales ANTES: los mismos deben quedar DESPUÉS.
  select count(*), count(distinct folio), sum(costo_acumulado) into n0, f0, c0 from erp.act_activo;

  update erp.act_activo
     set ubicacion = a, updated_at = now()
   where folio = 'ACT-0012' and estado = 'activo' and ubicacion = de;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'ACT-0012 no está como se midió (activo, %): % filas; no se re-ubica nada', de, n;
  end if;

  insert into erp.sis_bitacora (cliente_id, traza_id, actor, actor_tipo, modulo, verbo,
                                entidad_tipo, entidad_id, payload, resultado, aprobado_por)
  values (current_setting('app.cliente_id')::uuid, traza, 'prp-004-fase-4', 'humano', 'act', 'reubicar',
          'act_activo', 'ACT-0012',
          jsonb_build_object('de', de, 'a', a, 'prp', 'PRP-004 fase 4',
                             'motivo', 'el ERP vive en el monorepo privado (template/erp/)'),
          'ok', aprobado);

  if (select count(*) from erp.act_activo) <> n0
     or (select count(distinct folio) from erp.act_activo) <> f0
     or (select sum(costo_acumulado) from erp.act_activo) is distinct from c0 then
    raise exception 'los totales del catálogo cambiaron: se deshace todo';
  end if;
  raise notice 'ACT-0012 re-ubicado: % -> % · traza %', de, a, traza;
end $$;
commit;

-- Resultado (fuera de la transacción, solo lectura): lo que quedó.
select folio, estado, ubicacion, updated_at
  from erp.act_activo where folio = 'ACT-0012';
select created_at, verbo, payload->>'de' as de, payload->>'a' as a, aprobado_por, traza_id
  from erp.sis_bitacora where verbo = 'reubicar' order by created_at desc limit 1;
