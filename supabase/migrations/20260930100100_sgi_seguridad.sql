-- PRP-013 fase 7: seguridad del sistema integrado.
--   1. Pertenencia y rol (security definer, search_path vacío, nombres calificados).
--   2. Huellas SHA-256 calculadas POR LA BASE desde el contenido: nadie puede aprobar una versión y que se aplique otra.
--   3. Estados que solo cambia una aprobación («aprobado», «firmado», «eficaz», «cerrada»).
--   4. Aprobaciones inmutables (solo se revocan) y con el rol correcto; la tabla de quién aprueba qué es la MISMA
--      que APROBADORES/ROL_CIERRE en tools/sistema-integrado/src/motor (una prueba compara las dos).
--   5. La puerta de fase verificada EN SQL al cerrar: aunque alguien salte la app, sin evidencia no hay cierre.
--   6. RLS en toda tabla. Ninguna política para `anon`.
-- Idempotente y no destructiva.
--
-- Toda función SECURITY DEFINER vive en el esquema `sgi_privado`, que la API (PostgREST) no expone: los disparadores no
-- necesitan permiso de ejecución al dispararse, y los ayudantes de pertenencia que usan las políticas solo los ejecuta
-- `authenticated` desde la RLS, nunca por /rpc (regla del repo que vigila `prueba:migraciones`). Las dos funciones que sí
-- se consultan por la API (`sgi_faltantes_puerta`, `sgi_fases_cerradas`) son SECURITY INVOKER: las protege la RLS de
-- quien pregunta.

create schema if not exists sgi_privado;
revoke all on schema sgi_privado from public;
grant usage on schema sgi_privado to authenticated;

-- ───────────────────────── 1. pertenencia y rol ─────────────────────────

create or replace function sgi_privado.sgi_es_miembro(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sgi_membresia m where m.organizacion_id = p_org and m.user_id = (select auth.uid()));
$$;

create or replace function sgi_privado.sgi_tiene_rol(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sgi_membresia m
    where m.organizacion_id = p_org and m.user_id = (select auth.uid()) and m.rol = any (p_roles));
$$;

create or replace function sgi_privado.sgi_en_despacho(p_despacho uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sgi_despacho_miembro d where d.despacho_id = p_despacho and d.user_id = (select auth.uid()));
$$;

-- Marca blanca: la pyme ve la marca del despacho que la acompaña.
create or replace function sgi_privado.sgi_ve_despacho(p_despacho uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select sgi_privado.sgi_en_despacho(p_despacho) or exists (
    select 1 from public.sgi_organizacion o join public.sgi_membresia m on m.organizacion_id = o.id
    where o.despacho_id = p_despacho and m.user_id = (select auth.uid()));
$$;

-- Quién aprueba qué. ESPEJO de APROBADORES y ROL_CIERRE (motor). El consultor no aparece: nunca aprueba.
create or replace function public.sgi_rol_aprueba(p_tipo text, p_fase integer, p_rol text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'cierre_fase' then p_rol = (array['admin_pyme', 'admin_pyme', 'alta_direccion', 'alta_direccion', 'admin_pyme', 'admin_pyme', 'alta_direccion', 'admin_pyme', 'alta_direccion'])[p_fase + 1]
    when 'politica' then p_rol in ('alta_direccion')
    when 'soa' then p_rol in ('alta_direccion')
    when 'evaluacion_impacto' then p_rol in ('alta_direccion')
    when 'objetivos' then p_rol in ('alta_direccion')
    when 'riesgos' then p_rol in ('alta_direccion', 'admin_pyme')
    when 'plan_proyecto' then p_rol in ('alta_direccion', 'admin_pyme')
    when 'procedimiento' then p_rol in ('admin_pyme', 'dueno_proceso')
    when 'documento_general' then p_rol in ('admin_pyme', 'alta_direccion')
    when 'evidencia' then p_rol in ('admin_pyme', 'dueno_proceso', 'alta_direccion')
    when 'plan_capacitacion' then p_rol in ('admin_pyme')
    when 'proveedor' then p_rol in ('admin_pyme')
    when 'hallazgo' then p_rol in ('auditor_interno')
    when 'eficacia_accion' then p_rol in ('auditor_interno', 'admin_pyme')
    else false
  end;
$$;

-- Tipo de documento → qué aprobación le toca. ESPEJO de APROBACION_DE_DOCUMENTO (motor).
create or replace function public.sgi_aprobacion_de_documento(p_tipo text)
returns text language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'politica' then 'politica' when 'procedimiento' then 'procedimiento' when 'formato' then 'procedimiento'
    when 'soa' then 'soa' when 'evaluacion_impacto' then 'evaluacion_impacto' when 'objetivos' then 'objetivos'
    when 'riesgos' then 'riesgos' when 'plan_proyecto' then 'plan_proyecto' when 'plan_capacitacion' then 'plan_capacitacion'
    when 'contexto' then 'documento_general' when 'alcance' then 'documento_general' when 'informe' then 'documento_general'
  end;
$$;

-- ───────────────────────── 2. huellas calculadas por la base ─────────────────────────

create or replace function public.sgi_sha(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select 'sha256:' || encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(p_texto, ''), 'UTF8')), 'hex');
$$;

create or replace function public.sgi_huella()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'sgi_documento_version' then new.huella := public.sgi_sha(new.contenido::text);
  elsif tg_table_name = 'sgi_evidencia' then new.huella := public.sgi_sha(new.titulo || E'\n' || new.contenido);
  elsif tg_table_name = 'sgi_proveedor' then
    new.huella := public.sgi_sha(concat_ws('|', new.nombre, new.tipo, new.suministra, new.puntaje, new.recomendacion, new.reevaluar_en));
  elsif tg_table_name = 'sgi_hallazgo' then
    new.huella := public.sgi_sha(concat_ws('|', new.requisito_id, new.clasificacion, new.descripcion, new.evidencia_observada));
  elsif tg_table_name = 'sgi_accion_correctiva' then
    new.huella := public.sgi_sha(concat_ws('|', new.accion, new.responsable_puesto, new.vence));
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sgi_documento_version', 'sgi_evidencia', 'sgi_proveedor', 'sgi_hallazgo', 'sgi_accion_correctiva'] loop
    execute format('drop trigger if exists sgi_huella on public.%I', t);
    execute format('create trigger sgi_huella before insert or update on public.%I for each row execute function public.sgi_huella()', t);
  end loop;
end $$;

-- Un hijo no puede colgarse de un padre de OTRA organización (el FK solo mira que exista).
create or replace function sgi_privado.sgi_misma_org()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_col text := tg_argv[0];
  v_tabla text := tg_argv[1];
  v_id uuid := (to_jsonb(new) ->> v_col)::uuid;
  v_org uuid;
begin
  if v_id is null then return new; end if;
  execute format('select organizacion_id from public.%I where id = $1', v_tabla) into v_org using v_id;
  if v_org is distinct from new.organizacion_id then
    raise exception 'sgi: % pertenece a otra organización', v_col using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare par text[];
begin
  foreach par slice 1 in array array[
    ['sgi_proyecto_tarea', 'sgi_tarea', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_traza', 'sgi_traza', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_documento', 'sgi_documento', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_documento_version_padre', 'sgi_documento_version', 'documento_id', 'sgi_documento'],
    ['sgi_proyecto_evidencia', 'sgi_evidencia', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_evidencia_req_padre', 'sgi_evidencia_requisito', 'evidencia_id', 'sgi_evidencia'],
    ['sgi_proyecto_aprobacion', 'sgi_aprobacion', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_asunto', 'sgi_asunto', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_parte', 'sgi_parte_interesada', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_riesgo', 'sgi_riesgo', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_sistema_riesgo', 'sgi_riesgo', 'sistema_ia_id', 'sgi_sistema_ia'],
    ['sgi_proyecto_impacto', 'sgi_evaluacion_impacto', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_sistema_impacto', 'sgi_evaluacion_impacto', 'sistema_ia_id', 'sgi_sistema_ia'],
    ['sgi_proyecto_soa', 'sgi_control_soa', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_objetivo', 'sgi_objetivo', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_indicador', 'sgi_indicador', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_indicador_medicion', 'sgi_medicion', 'indicador_id', 'sgi_indicador'],
    ['sgi_proyecto_competencia', 'sgi_competencia', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_proyecto_auditoria', 'sgi_auditoria', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_auditoria_hallazgo', 'sgi_hallazgo', 'auditoria_id', 'sgi_auditoria'],
    ['sgi_proyecto_nc', 'sgi_no_conformidad', 'proyecto_id', 'sgi_proyecto'],
    ['sgi_nc_accion', 'sgi_accion_correctiva', 'no_conformidad_id', 'sgi_no_conformidad']
  ] loop
    execute format('drop trigger if exists %I on public.%I', par[1], par[2]);
    execute format('create trigger %I before insert or update on public.%I for each row execute function sgi_privado.sgi_misma_org(%L, %L)',
      par[1], par[2], par[3], par[4]);
  end loop;
end $$;

-- ───────────────────────── 3. estados que solo cambia una aprobación ─────────────────────────

create or replace function public.sgi_desde_aprobacion()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('sgi.desde_aprobacion', true), '') = 'si';
$$;

create or replace function public.sgi_protege_estado()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.sgi_desde_aprobacion() then return new; end if;
  -- Al CREAR tampoco se salta la aprobación: nadie da de alta algo ya «aprobado», «firmado», «eficaz» o «cerrado».
  if tg_op = 'INSERT' then
    if (tg_table_name = 'sgi_documento_version' and new.estado not in ('borrador', 'en_revision'))
      or (tg_table_name = 'sgi_hallazgo' and new.estado <> 'borrador')
      or (tg_table_name = 'sgi_proveedor' and new.estado <> 'propuesto')
      or (tg_table_name = 'sgi_accion_correctiva' and new.estado not in ('pendiente', 'hecha'))
      or (tg_table_name = 'sgi_no_conformidad' and new.estado = 'cerrada') then
      raise exception 'sgi: «%» no se asigna al crear: lo pone una aprobación', new.estado using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_table_name = 'sgi_documento_version' then
    if new.contenido is distinct from old.contenido or new.numero <> old.numero or new.documento_id <> old.documento_id then
      raise exception 'sgi: una versión no se edita; se crea una versión nueva' using errcode = '42501';
    end if;
    if new.estado is distinct from old.estado and not (
      (old.estado = 'borrador' and new.estado = 'en_revision') or (old.estado = 'en_revision' and new.estado = 'borrador')) then
      raise exception 'sgi: «%» solo lo pone una aprobación con el rol correcto', new.estado using errcode = '42501';
    end if;
  elsif tg_table_name = 'sgi_hallazgo' then
    if old.estado = 'firmado' then raise exception 'sgi: un hallazgo firmado no se edita' using errcode = '42501'; end if;
    if new.estado = 'firmado' then raise exception 'sgi: solo el auditor interno firma, aprobando la huella' using errcode = '42501'; end if;
  elsif tg_table_name = 'sgi_proveedor' then
    if new.estado is distinct from old.estado then raise exception 'sgi: el estado del proveedor lo pone su aprobación' using errcode = '42501'; end if;
    -- Editar lo evaluado revoca la aprobación: vuelve a «propuesto».
    if new.huella is distinct from old.huella then new.estado := 'propuesto'; end if;
  elsif tg_table_name = 'sgi_accion_correctiva' then
    if old.estado in ('eficaz', 'no_eficaz') then raise exception 'sgi: la eficacia ya se verificó' using errcode = '42501'; end if;
    if new.estado in ('eficaz', 'no_eficaz') then raise exception 'sgi: la eficacia la verifica una aprobación' using errcode = '42501'; end if;
  elsif tg_table_name = 'sgi_no_conformidad' then
    if old.estado = 'cerrada' then raise exception 'sgi: una NC cerrada no se reabre desde aquí' using errcode = '42501'; end if;
    if new.estado = 'cerrada' then raise exception 'sgi: una NC se cierra cuando todas sus acciones son eficaces' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['sgi_documento_version', 'sgi_hallazgo', 'sgi_proveedor', 'sgi_accion_correctiva', 'sgi_no_conformidad'] loop
    execute format('drop trigger if exists sgi_protege_estado on public.%I', t);
    execute format('create trigger sgi_protege_estado before insert or update on public.%I for each row execute function public.sgi_protege_estado()', t);
  end loop;
end $$;

-- ───────────────────────── 4. evidencia aprobada, fases cerradas, puerta ─────────────────────────

-- Las tres funciones que siguen corren como su dueño: por eso comprueban PRIMERO que quien pregunta es miembro
-- (sin esto, quien conociera el UUID de un proyecto ajeno vería qué le falta: medido en la prueba de RLS).
create or replace function sgi_privado.sgi_evidencia_aprobada(p_evidencia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sgi_evidencia e join public.sgi_aprobacion a on a.organizacion_id = e.organizacion_id
    where e.id = p_evidencia and sgi_privado.sgi_es_miembro(e.organizacion_id) and a.decision = 'aprobado' and a.revocada_en is null
      and ((a.objeto_tipo = 'evidencia' and a.objeto_id = e.id)
        or (e.origen = 'documento_aprobado' and a.objeto_id = e.documento_version_id)));
$$;

create or replace function public.sgi_fases_cerradas(p_proyecto uuid)
returns integer[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(a.fase order by a.fase), '{}') from public.sgi_aprobacion a
  where a.proyecto_id = p_proyecto and sgi_privado.sgi_es_miembro(a.organizacion_id)
    and a.objeto_tipo = 'cierre_fase' and a.decision = 'aprobado' and a.revocada_en is null;
$$;

-- ESPEJO de `puerta()` del motor. Devuelve lo que falta (vacío = la puerta puede cerrarse).
create or replace function public.sgi_faltantes_puerta(p_proyecto uuid, p_fase integer)
returns text[] language plpgsql stable security invoker set search_path = '' as $$
declare
  pr public.sgi_proyecto;
  cerradas integer[] := public.sgi_fases_cerradas(p_proyecto);
  faltan text[] := '{}';
begin
  select * into pr from public.sgi_proyecto where id = p_proyecto;
  if not found or not sgi_privado.sgi_es_miembro(pr.organizacion_id) then
    raise exception 'sgi: sin acceso a ese proyecto' using errcode = '42501';
  end if;
  if p_fase = 0 then
    if not pr.diagnostico_completo then faltan := faltan || 'diagnostico'::text; end if;
    if not exists (select 1 from public.sgi_aprobacion a where a.proyecto_id = p_proyecto and a.objeto_tipo = 'plan_proyecto'
                   and a.decision = 'aprobado' and a.revocada_en is null) then
      faltan := faltan || 'plan-proyecto'::text;
    end if;
    return faltan;
  end if;
  if not ((p_fase - 1) = any (cerradas)) then faltan := faltan || ('fase-' || (p_fase - 1)); end if;
  faltan := faltan || array(
    select r.id from public.sgi_requisito r
    where r.fase = p_fase and r.obligatorio and r.ediciones && pr.ediciones
      and coalesce(btrim(pr.no_aplica ->> r.id), '') = ''
      and not exists (
        select 1 from public.sgi_evidencia_requisito er join public.sgi_evidencia e on e.id = er.evidencia_id
        where er.requisito_id = r.id and e.proyecto_id = p_proyecto and sgi_privado.sgi_evidencia_aprobada(e.id))
    order by r.id);
  if p_fase = 8 then
    faltan := faltan || array(select 'fase-' || f from generate_series(0, 6) f where not (f = any (cerradas)) order by f);
    if not exists (select 1 from public.sgi_auditoria au where au.proyecto_id = p_proyecto and au.tipo = 'simulacro' and au.estado = 'realizada') then
      faltan := faltan || 'simulacro'::text;
    end if;
    if exists (select 1 from public.sgi_no_conformidad n where n.proyecto_id = p_proyecto and n.estado <> 'cerrada') then
      faltan := faltan || 'nc-abiertas'::text;
    end if;
  end if;
  return faltan;
end;
$$;

-- Estado de cada evidencia visto con los permisos de quien consulta.
create or replace view public.sgi_evidencia_estado with (security_invoker = true) as
  select e.id, e.organizacion_id, e.proyecto_id, sgi_privado.sgi_evidencia_aprobada(e.id) as aprobada from public.sgi_evidencia e;

-- ───────────────────────── 5. la aprobación ─────────────────────────

create or replace function sgi_privado.sgi_aprobacion_valida()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_huella text; v_proyecto uuid; v_extra text; v_numero integer; v_faltan text[];
begin
  new.aprobado_por := (select auth.uid());
  new.creado_en := now();
  new.revocada_en := null;
  if new.objeto_tipo = 'cierre_fase' then
    select organizacion_id into v_org from public.sgi_proyecto where id = new.proyecto_id;
    if v_org is distinct from new.organizacion_id then raise exception 'sgi: proyecto de otra organización' using errcode = '42501'; end if;
    if new.decision = 'aprobado' then
      v_faltan := public.sgi_faltantes_puerta(new.proyecto_id, new.fase);
      if cardinality(v_faltan) > 0 then
        raise exception 'sgi: la puerta de la fase % no se puede cerrar; faltan: %', new.fase, array_to_string(v_faltan, ', ') using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  if new.objeto_tipo = 'evidencia' then
    select organizacion_id, huella, proyecto_id into v_org, v_huella, v_proyecto from public.sgi_evidencia where id = new.objeto_id;
  elsif new.objeto_tipo = 'proveedor' then
    select organizacion_id, huella, null, estado into v_org, v_huella, v_proyecto, v_extra from public.sgi_proveedor where id = new.objeto_id;
  elsif new.objeto_tipo = 'hallazgo' then
    select h.organizacion_id, h.huella, au.proyecto_id, h.estado into v_org, v_huella, v_proyecto, v_extra
      from public.sgi_hallazgo h join public.sgi_auditoria au on au.id = h.auditoria_id where h.id = new.objeto_id;
    if v_extra = 'firmado' then raise exception 'sgi: el hallazgo ya está firmado' using errcode = '42501'; end if;
  elsif new.objeto_tipo = 'eficacia_accion' then
    select a.organizacion_id, a.huella, n.proyecto_id, a.estado into v_org, v_huella, v_proyecto, v_extra
      from public.sgi_accion_correctiva a join public.sgi_no_conformidad n on n.id = a.no_conformidad_id where a.id = new.objeto_id;
    if v_extra <> 'hecha' then raise exception 'sgi: la eficacia se verifica sobre una acción hecha' using errcode = '42501'; end if;
  else
    -- Documento: se aprueba la versión exacta, en revisión, con la aprobación que corresponde a su tipo.
    select v.organizacion_id, v.huella, d.proyecto_id, v.numero, d.tipo into v_org, v_huella, v_proyecto, v_numero, v_extra
      from public.sgi_documento_version v join public.sgi_documento d on d.id = v.documento_id
      where v.id = new.objeto_id and v.estado = 'en_revision';
    if not found then raise exception 'sgi: solo se aprueba una versión en revisión' using errcode = '42501'; end if;
    if public.sgi_aprobacion_de_documento(v_extra) is distinct from new.objeto_tipo then
      raise exception 'sgi: un documento «%» se aprueba como «%»', v_extra, public.sgi_aprobacion_de_documento(v_extra) using errcode = '42501';
    end if;
    new.version := v_numero;
  end if;
  if v_org is null or v_org <> new.organizacion_id then raise exception 'sgi: objeto inexistente o de otra organización' using errcode = '42501'; end if;
  -- O3: se aprueba EXACTAMENTE lo que se vio. Si cambió entre que se revisó y se aprobó, se rechaza.
  if new.huella is distinct from v_huella then raise exception 'sgi: la huella no coincide: lo aprobado no es lo que hay' using errcode = '42501'; end if;
  new.proyecto_id := v_proyecto;
  return new;
end;
$$;

create or replace function sgi_privado.sgi_aprobacion_aplica()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nc uuid;
begin
  perform set_config('sgi.desde_aprobacion', 'si', true);
  if new.objeto_tipo in ('politica', 'soa', 'evaluacion_impacto', 'objetivos', 'riesgos', 'plan_proyecto', 'procedimiento', 'documento_general', 'plan_capacitacion') then
    update public.sgi_documento_version set estado = case new.decision when 'aprobado' then 'aprobado' else 'rechazado' end where id = new.objeto_id;
    if new.decision = 'aprobado' then
      -- Aprobar un documento crea la evidencia que cubre sus requisitos.
      with d as (
        select v.id as version_id, v.organizacion_id, doc.proyecto_id, doc.titulo, doc.requisitos, v.numero
        from public.sgi_documento_version v join public.sgi_documento doc on doc.id = v.documento_id where v.id = new.objeto_id
      ), ev as (
        insert into public.sgi_evidencia (organizacion_id, proyecto_id, titulo, tipo, contenido, origen, documento_version_id, subida_por, huella)
        select organizacion_id, proyecto_id, titulo || ' v' || numero, 'documento', 'Versión aprobada del documento', 'documento_aprobado', version_id, new.aprobado_por, new.huella
        from d returning id, organizacion_id
      )
      insert into public.sgi_evidencia_requisito (evidencia_id, requisito_id, organizacion_id)
      select ev.id, r, ev.organizacion_id from ev, d, unnest(d.requisitos) r
      where exists (select 1 from public.sgi_requisito x where x.id = r) on conflict do nothing;
    end if;
  elsif new.objeto_tipo = 'proveedor' then
    update public.sgi_proveedor set estado = case new.decision when 'aprobado' then 'aprobado' else 'no_aprobado' end where id = new.objeto_id;
  elsif new.objeto_tipo = 'hallazgo' and new.decision = 'aprobado' then
    update public.sgi_hallazgo set estado = 'firmado' where id = new.objeto_id;
  elsif new.objeto_tipo = 'eficacia_accion' then
    update public.sgi_accion_correctiva set estado = case new.decision when 'aprobado' then 'eficaz' else 'no_eficaz' end
      where id = new.objeto_id returning no_conformidad_id into v_nc;
    if not exists (select 1 from public.sgi_accion_correctiva where no_conformidad_id = v_nc and estado <> 'eficaz') then
      update public.sgi_no_conformidad set estado = 'cerrada' where id = v_nc;
    end if;
  end if;
  perform set_config('sgi.desde_aprobacion', '', true);
  return new;
end;
$$;

-- Inmutable: lo único que cambia es la revocación, una vez, y la hace quien aprobó.
create or replace function public.sgi_aprobacion_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'revocada_en') is distinct from (to_jsonb(old) - 'revocada_en') then
    raise exception 'sgi: una aprobación no se edita; se revoca' using errcode = '42501';
  end if;
  if old.revocada_en is not null or new.revocada_en is null then
    raise exception 'sgi: la revocación ocurre una vez' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sgi_aprobacion_valida on public.sgi_aprobacion;
create trigger sgi_aprobacion_valida before insert on public.sgi_aprobacion for each row execute function sgi_privado.sgi_aprobacion_valida();
drop trigger if exists sgi_aprobacion_aplica on public.sgi_aprobacion;
create trigger sgi_aprobacion_aplica after insert on public.sgi_aprobacion for each row execute function sgi_privado.sgi_aprobacion_aplica();
drop trigger if exists sgi_aprobacion_inmutable on public.sgi_aprobacion;
create trigger sgi_aprobacion_inmutable before update on public.sgi_aprobacion for each row execute function public.sgi_aprobacion_inmutable();

-- Traza: inmutable (sin políticas de update/delete) y sin forma de cambiarla ni desde el dueño.

-- Altas: quien crea una organización queda como admin (o como consultor si la crea para su despacho); quien crea un
-- despacho queda como su miembro.
create or replace function sgi_privado.sgi_alta_organizacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    insert into public.sgi_membresia (organizacion_id, user_id, rol)
    values (new.id, (select auth.uid()),
      case when new.despacho_id is not null and sgi_privado.sgi_en_despacho(new.despacho_id) then 'consultor' else 'admin_pyme' end)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists sgi_alta_organizacion on public.sgi_organizacion;
create trigger sgi_alta_organizacion after insert on public.sgi_organizacion for each row execute function sgi_privado.sgi_alta_organizacion();

create or replace function sgi_privado.sgi_alta_despacho()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    insert into public.sgi_despacho_miembro (despacho_id, user_id) values (new.id, (select auth.uid())) on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists sgi_alta_despacho on public.sgi_despacho;
create trigger sgi_alta_despacho after insert on public.sgi_despacho for each row execute function sgi_privado.sgi_alta_despacho();

-- ───────────────────────── 6. RLS ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['sgi_despacho', 'sgi_despacho_miembro', 'sgi_organizacion', 'sgi_membresia', 'sgi_requisito', 'sgi_proyecto',
    'sgi_tarea', 'sgi_traza', 'sgi_documento', 'sgi_documento_version', 'sgi_evidencia', 'sgi_evidencia_requisito', 'sgi_aprobacion',
    'sgi_asunto', 'sgi_parte_interesada', 'sgi_sistema_ia', 'sgi_riesgo', 'sgi_evaluacion_impacto', 'sgi_control_soa', 'sgi_objetivo',
    'sgi_indicador', 'sgi_medicion', 'sgi_competencia', 'sgi_proveedor', 'sgi_auditoria', 'sgi_hallazgo', 'sgi_no_conformidad',
    'sgi_accion_correctiva', 'sgi_plantilla'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Tablas de trabajo por organización: los miembros leen, proponen, editan y borran propuestas.
do $$
declare t text;
begin
  foreach t in array array['sgi_tarea', 'sgi_asunto', 'sgi_parte_interesada', 'sgi_sistema_ia', 'sgi_riesgo', 'sgi_evaluacion_impacto',
    'sgi_control_soa', 'sgi_objetivo', 'sgi_indicador', 'sgi_medicion', 'sgi_competencia', 'sgi_proveedor', 'sgi_auditoria'] loop
    execute format('drop policy if exists "miembros: todo" on public.%I', t);
    execute format('create policy "miembros: todo" on public.%I for all to authenticated
      using ((select sgi_privado.sgi_es_miembro(organizacion_id))) with check ((select sgi_privado.sgi_es_miembro(organizacion_id)))', t);
  end loop;
  -- Historia: se lee, se agrega y (salvo excepciones abajo) se edita, pero NO se borra.
  foreach t in array array['sgi_proyecto', 'sgi_documento', 'sgi_documento_version', 'sgi_evidencia', 'sgi_evidencia_requisito',
    'sgi_hallazgo', 'sgi_no_conformidad', 'sgi_accion_correctiva'] loop
    execute format('drop policy if exists "miembros: ver" on public.%I', t);
    execute format('create policy "miembros: ver" on public.%I for select to authenticated using ((select sgi_privado.sgi_es_miembro(organizacion_id)))', t);
    execute format('drop policy if exists "miembros: agregar" on public.%I', t);
    execute format('create policy "miembros: agregar" on public.%I for insert to authenticated with check ((select sgi_privado.sgi_es_miembro(organizacion_id)))', t);
    execute format('drop policy if exists "miembros: editar" on public.%I', t);
    execute format('create policy "miembros: editar" on public.%I for update to authenticated
      using ((select sgi_privado.sgi_es_miembro(organizacion_id))) with check ((select sgi_privado.sgi_es_miembro(organizacion_id)))', t);
  end loop;
end $$;
-- La evidencia aprobada y su vínculo no se editan: se sube una nueva.
drop policy if exists "miembros: editar" on public.sgi_evidencia_requisito;

-- Traza: se lee y se agrega; nunca se edita ni se borra.
drop policy if exists "miembros: ver" on public.sgi_traza;
create policy "miembros: ver" on public.sgi_traza for select to authenticated using ((select sgi_privado.sgi_es_miembro(organizacion_id)));
drop policy if exists "miembros: agregar" on public.sgi_traza;
create policy "miembros: agregar" on public.sgi_traza for insert to authenticated
  with check ((select sgi_privado.sgi_es_miembro(organizacion_id)) and creado_por = (select auth.uid()));

-- Aprobaciones: se ven entre miembros; se crean SOLO con el rol correcto y a nombre propio; se revocan por quien aprobó.
drop policy if exists "miembros: ver" on public.sgi_aprobacion;
create policy "miembros: ver" on public.sgi_aprobacion for select to authenticated using ((select sgi_privado.sgi_es_miembro(organizacion_id)));
drop policy if exists "aprobar con el rol correcto" on public.sgi_aprobacion;
create policy "aprobar con el rol correcto" on public.sgi_aprobacion for insert to authenticated
  with check (
    aprobado_por = (select auth.uid())
    and sgi_privado.sgi_tiene_rol(organizacion_id, array[rol])
    and public.sgi_rol_aprueba(objeto_tipo, fase, rol));
drop policy if exists "revocar lo propio" on public.sgi_aprobacion;
create policy "revocar lo propio" on public.sgi_aprobacion for update to authenticated
  using (aprobado_por = (select auth.uid())) with check (aprobado_por = (select auth.uid()));

-- Organización: los miembros la ven; cualquiera con sesión da de alta la suya; solo la admin la edita.
drop policy if exists "miembros: ver" on public.sgi_organizacion;
create policy "miembros: ver" on public.sgi_organizacion for select to authenticated
  using ((select sgi_privado.sgi_es_miembro(id)) or creado_por = (select auth.uid()));
drop policy if exists "alta" on public.sgi_organizacion;
create policy "alta" on public.sgi_organizacion for insert to authenticated
  with check (creado_por = (select auth.uid()) and (despacho_id is null or (select sgi_privado.sgi_en_despacho(despacho_id))));
drop policy if exists "admin: editar" on public.sgi_organizacion;
create policy "admin: editar" on public.sgi_organizacion for update to authenticated
  using ((select sgi_privado.sgi_tiene_rol(id, array['admin_pyme']))) with check ((select sgi_privado.sgi_tiene_rol(id, array['admin_pyme'])));

-- Membresías: los miembros ven quién está; solo la admin agrega o quita (el consultor no se asigna roles).
drop policy if exists "miembros: ver" on public.sgi_membresia;
create policy "miembros: ver" on public.sgi_membresia for select to authenticated using ((select sgi_privado.sgi_es_miembro(organizacion_id)));
drop policy if exists "admin: agregar" on public.sgi_membresia;
create policy "admin: agregar" on public.sgi_membresia for insert to authenticated
  with check ((select sgi_privado.sgi_tiene_rol(organizacion_id, array['admin_pyme'])));
drop policy if exists "admin: quitar" on public.sgi_membresia;
create policy "admin: quitar" on public.sgi_membresia for delete to authenticated
  using ((select sgi_privado.sgi_tiene_rol(organizacion_id, array['admin_pyme'])));

-- Despacho (consultor) y marca blanca.
drop policy if exists "ver" on public.sgi_despacho;
create policy "ver" on public.sgi_despacho for select to authenticated
  using ((select sgi_privado.sgi_ve_despacho(id)) or creado_por = (select auth.uid()));
drop policy if exists "alta" on public.sgi_despacho;
create policy "alta" on public.sgi_despacho for insert to authenticated with check (creado_por = (select auth.uid()));
drop policy if exists "miembros: editar" on public.sgi_despacho;
create policy "miembros: editar" on public.sgi_despacho for update to authenticated
  using ((select sgi_privado.sgi_en_despacho(id))) with check ((select sgi_privado.sgi_en_despacho(id)));
drop policy if exists "miembros: ver" on public.sgi_despacho_miembro;
create policy "miembros: ver" on public.sgi_despacho_miembro for select to authenticated using ((select sgi_privado.sgi_en_despacho(despacho_id)));
drop policy if exists "miembros: agregar" on public.sgi_despacho_miembro;
create policy "miembros: agregar" on public.sgi_despacho_miembro for insert to authenticated with check ((select sgi_privado.sgi_en_despacho(despacho_id)));
drop policy if exists "miembros: todo" on public.sgi_plantilla;
create policy "miembros: todo" on public.sgi_plantilla for all to authenticated
  using ((select sgi_privado.sgi_en_despacho(despacho_id))) with check ((select sgi_privado.sgi_en_despacho(despacho_id)));

-- Catálogo: los IDs son públicos para quien tiene sesión; se escriben solo por migración.
drop policy if exists "leer" on public.sgi_requisito;
create policy "leer" on public.sgi_requisito for select to authenticated using (true);

grant execute on function public.sgi_faltantes_puerta(uuid, integer) to authenticated;
grant execute on function public.sgi_fases_cerradas(uuid) to authenticated;
revoke execute on function public.sgi_faltantes_puerta(uuid, integer) from anon;
revoke execute on function public.sgi_fases_cerradas(uuid) from anon;

-- Permisos de las funciones privadas: nadie por defecto; `authenticated` solo las que evalúa la RLS.
revoke all on all functions in schema sgi_privado from public;
grant execute on function sgi_privado.sgi_es_miembro(uuid), sgi_privado.sgi_tiene_rol(uuid, text[]),
  sgi_privado.sgi_en_despacho(uuid), sgi_privado.sgi_ve_despacho(uuid), sgi_privado.sgi_evidencia_aprobada(uuid) to authenticated;
