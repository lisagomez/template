-- =============================================================================
-- Ágora · 007 · lo que cambia el estado: la bitácora encadenada, aplicar lo aprobado (y deshacer A2), el ciclo
-- del agente (firmar el alta, suspender, reactivar, revocar), los topes, la segregación y el cierre del periodo
-- con su póliza propuesta. Idempotente.
--
-- Todas son `security definer` y RE-LEEN en la base lo que autoriza el cambio: quien las llama no se cree.
-- =============================================================================
set check_function_bodies = off;

-- --- La bitácora: cadena de hashes por organización, solo se agrega -----------------------------------------
create table if not exists agora.bitacora (
  id         bigserial primary key,
  org_id     uuid not null references agora.org (id) on delete cascade,
  prev       text not null,
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  actor_tipo text not null check (actor_tipo in ('humano', 'agente', 'sistema')),
  actor_ref  text,
  accion     text not null,
  objeto     text,
  detalle    jsonb not null default '{}',
  traza_id   uuid not null default gen_random_uuid(),
  cuando     timestamptz not null default now()
);
create index if not exists ix_bitacora_org on agora.bitacora (org_id, id);
drop trigger if exists tg_bitacora_solo_agregar on agora.bitacora;
create trigger tg_bitacora_solo_agregar before update or delete on agora.bitacora for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

create or replace function agora_priv.anota(o uuid, actor_tipo text, actor_ref text, accion text, objeto text, detalle jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  previo text;
  cuando timestamptz := clock_timestamp();
  huella text;
  nuevo bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('agora-bitacora:' || o::text, 0));
  select b.sha256 into previo from agora.bitacora b where b.org_id = o order by b.id desc limit 1;
  previo := coalesce(previo, repeat('0', 64));
  huella := encode(sha256(convert_to(concat_ws('|', previo, o::text, actor_tipo, coalesce(actor_ref, ''), accion, coalesce(objeto, ''), coalesce(detalle, '{}'::jsonb)::text, to_char(cuando at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex');
  insert into agora.bitacora (org_id, prev, sha256, actor_tipo, actor_ref, accion, objeto, detalle, cuando)
  values (o, previo, huella, actor_tipo, actor_ref, accion, objeto, coalesce(detalle, '{}'), cuando) returning id into nuevo;
  return nuevo;
end $$;

/** Recalcula la cadena de una organización: el primer eslabón roto, o null si está íntegra. */
create or replace function agora.verifica_bitacora(o uuid) returns bigint language plpgsql stable security invoker set search_path = '' as $$
declare
  b agora.bitacora;
  previo text := repeat('0', 64);
begin
  for b in select * from agora.bitacora x where x.org_id = o order by x.id loop
    if b.prev <> previo or b.sha256 <> encode(sha256(convert_to(concat_ws('|', b.prev, b.org_id::text, b.actor_tipo, coalesce(b.actor_ref, ''), b.accion, coalesce(b.objeto, ''), b.detalle::text,
                                to_char(b.cuando at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')), 'UTF8')), 'hex') then
      return b.id;
    end if;
    previo := b.sha256;
  end loop;
  return null;
end $$;

create or replace function agora_priv.actor() returns table (tipo text, ref text) language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is not null then 'humano' when agora_priv.agente_de_tarea() is not null then 'agente' else 'sistema' end,
         coalesce(auth.uid()::text, agora_priv.agente_de_tarea()::text)
$$;

-- Lo que la bitácora registra sola, para que no dependa de la app: propuestas, decisiones y decisiones de póliza.
create or replace function agora_priv.bitacora_de_propuesta() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform agora_priv.anota(new.org_id, case when new.autor_agente is not null then 'agente' else 'humano' end,
    coalesce(new.autor_agente, new.autor_persona)::text, 'propuesta.crea', new.id::text,
    jsonb_build_object('clase', new.clase, 'sha256', new.sha256, 'nivel', new.nivel, 'monto_mxn', new.monto_mxn));
  return null;
end $$;
drop trigger if exists tg_bitacora_propuesta on agora.propuesta;
create trigger tg_bitacora_propuesta after insert on agora.propuesta for each row execute function agora_priv.bitacora_de_propuesta();

create or replace function agora_priv.bitacora_de_aprobacion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform agora_priv.anota(new.org_id, 'humano', new.decidida_por::text, 'propuesta.' || new.decision, new.propuesta_id::text,
    jsonb_build_object('sha256', new.sha256, 'rol', new.rol_usado));
  return null;
end $$;
drop trigger if exists tg_bitacora_aprobacion on agora.aprobacion;
create trigger tg_bitacora_aprobacion after insert on agora.aprobacion for each row execute function agora_priv.bitacora_de_aprobacion();

create or replace function agora_priv.bitacora_de_poliza() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform agora_priv.anota(new.org_id, 'humano', new.decidida_por::text, 'poliza.' || new.decision, new.poliza_id::text, jsonb_build_object('sha256', new.sha256, 'motivo', new.motivo));
  return null;
end $$;
drop trigger if exists tg_bitacora_poliza on agora.poliza_decision;
create trigger tg_bitacora_poliza after insert on agora.poliza_decision for each row execute function agora_priv.bitacora_de_poliza();

-- --- Aplicar lo aprobado -------------------------------------------------------------------------------------
create or replace function agora_priv.campos_de(clase text) returns text[] language sql immutable set search_path = '' as $$
  select case clase
    when 'editar' then array['nombre', 'progreso', 'etiquetas', 'prioridad', 'vinculo', 'estado']
    when 'mover_fecha' then array['inicio', 'fin']
    when 'reprogramar' then array['inicio', 'fin']
    when 'asignar' then array['responsable_persona', 'responsable_agente']
    when 'asignar_externo' then array['responsable_agente']
    when 'cambiar_monto' then array['monto_mxn']
    else array[]::text[] end
$$;

/** Lo que A2 aplica sin aprobación: reversible, sin dinero y sin terceros. Nada más. */
create or replace function agora_priv.es_a2_valida(p agora.propuesta) returns boolean language sql stable security definer set search_path = '' as $$
  select p.nivel = 'A2' and p.clase = 'editar' and p.monto_mxn is null and p.autor_agente is not null
     and exists (select 1 from agora.agente a where a.id = p.autor_agente and a.origen = 'interno' and a.autonomia_max in ('A2', 'A3') and a.estado in ('aprobado', 'prueba'))
     and not exists (select 1 from jsonb_array_elements(coalesce(p.payload -> 'cambios', '[]')) c where c ->> 'campo' not in ('nombre', 'progreso', 'etiquetas', 'prioridad'))
     and jsonb_array_length(coalesce(p.payload -> 'nuevos', '[]')) = 0
$$;

create or replace function agora_priv.compromete(p agora.propuesta, it agora.item, importe numeric) returns void language plpgsql security definer set search_path = '' as $$
declare
  ap uuid;
  per text;
  disp numeric;
begin
  -- Lo que estaba comprometido para el ítem se libera: nunca se cuenta dos veces.
  update agora.compromiso c set liberado_mxn = c.importe_mxn - coalesce((select sum(x.importe_mxn) from agora.costo x where x.compromiso_id = c.id and x.estado = 'ejercido'), 0),
         estado = 'liberado'
   where c.item_id = it.id and c.estado = 'vigente' and not agora_priv.periodo_cerrado(c.org_id, c.periodo);
  if importe is null or importe = 0 then return; end if;
  select a.id into ap from agora.aprobacion a where a.propuesta_id = p.id and a.decision = 'aprobar' and a.sha256 = p.sha256 order by a.decidida_en desc limit 1;
  per := agora_priv.periodo_de_registro(p.org_id, coalesce(it.fin::timestamptz, now()));
  insert into agora.compromiso (org_id, categoria_id, item_id, periodo, importe_mxn, propuesta_id, aprobacion_id, concepto)
  values (p.org_id, it.categoria_id, it.id, per, importe, p.id, ap, it.nombre);
  select v.disponible_mxn into disp from agora.v_centro_periodo v where v.categoria_id = it.categoria_id and v.periodo = per;
  if coalesce(disp, -1) < 0 then
    raise exception 'el monto sobrepasa el presupuesto de la categoría en % (disponible %): primero se amplía el presupuesto', per, coalesce(disp, 0) using errcode = 'AG409';
  end if;
end $$;

/**
 * Aplica una propuesta. Relee en la base que tenga TODAS sus firmas sobre su huella (o que sea un A2 válido): un
 * resume falsificado, un «aprobado: true» o un rol que no es el de la matriz no aplican nada. Idempotente: una
 * propuesta aplicada no se aplica dos veces. Lo que se aplica es el payload cuyo sha256 se aprobó.
 */
create or replace function agora.aplica_propuesta(pid uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p agora.propuesta;
  c jsonb;
  n jsonb;
  it agora.item;
  campo text;
  nuevo uuid;
  claves jsonb := '{}';
  aplicados int := 0;
begin
  select * into p from agora.propuesta where id = pid for update;
  if not found then raise exception 'no existe' using errcode = 'AG404'; end if;
  -- Quien la aplica tiene que poder verla: una persona de su organización o el agente que la propuso.
  -- coalesce: con autor humano (autor_agente nulo) la comparación da null y un «if null» no rechaza.
  if not agora_priv.llama_la_base() and not (agora_priv.es_de_org(p.org_id) or coalesce(agora_priv.agente_de_tarea() = p.autor_agente, false)) then
    raise exception 'no existe' using errcode = 'AG404';
  end if;
  if p.estado = 'aplicada' then return jsonb_build_object('ok', true, 'ya', true, 'propuesta', p.id); end if;
  if not ((p.estado = 'aprobada' and agora_priv.firmas_completas(p.id)) or (p.estado = 'pendiente' and agora_priv.es_a2_valida(p))) then
    raise exception 'sin su fila de aprobación no se aplica (estado %)', p.estado using errcode = 'AG403';
  end if;
  if p.vence_en <= now() and p.estado = 'pendiente' then raise exception 'la propuesta venció' using errcode = 'AG409'; end if;
  perform set_config('agora.propuesta', p.id::text, true);
  perform set_config('agora.nivel', p.nivel, true);
  perform set_config('agora.autor_agente', coalesce(p.autor_agente::text, ''), true);
  perform set_config('agora.autor_persona', coalesce(p.autor_persona::text, ''), true);
  if p.clase in ('editar', 'mover_fecha', 'reprogramar', 'asignar', 'asignar_externo', 'cambiar_monto') then
    for c in select * from jsonb_array_elements(coalesce(p.payload -> 'cambios', '[]')) loop
      campo := c ->> 'campo';
      if not campo = any (agora_priv.campos_de(p.clase)) then raise exception 'el campo % no es de la clase %', campo, p.clase using errcode = 'AG400'; end if;
      select * into it from agora.item where id = (c ->> 'item')::uuid for update;
      if not found or it.categoria_id <> p.categoria_id then raise exception 'el ítem no es de la categoría de la propuesta' using errcode = 'AG400'; end if;
      if (to_jsonb(it) -> campo) is distinct from (c -> 'antes') then
        raise exception 'el ítem cambió desde la propuesta (%): se propone de nuevo', campo using errcode = 'AG409';
      end if;
      if campo = 'responsable_agente' and (c ->> 'despues') is not null and p.clase = 'asignar'
         and exists (select 1 from agora.agente a where a.id = (c ->> 'despues')::uuid and a.origen = 'externo') then
        raise exception 'asignar a un externo es otra clase (pide aprobador)' using errcode = 'AG403';
      end if;
      case campo
        when 'nombre' then update agora.item set nombre = c ->> 'despues' where id = it.id;
        when 'estado' then update agora.item set estado = c ->> 'despues' where id = it.id;
        when 'prioridad' then update agora.item set prioridad = c ->> 'despues' where id = it.id;
        when 'vinculo' then update agora.item set vinculo = c ->> 'despues' where id = it.id;
        when 'progreso' then update agora.item set progreso = (c ->> 'despues')::int where id = it.id;
        when 'etiquetas' then update agora.item set etiquetas = array(select jsonb_array_elements_text(c -> 'despues')) where id = it.id;
        when 'inicio' then update agora.item set inicio = (c ->> 'despues')::date where id = it.id;
        when 'fin' then update agora.item set fin = (c ->> 'despues')::date where id = it.id;
        when 'responsable_persona' then update agora.item set responsable_persona = (c ->> 'despues')::uuid, responsable_agente = null where id = it.id;
        when 'responsable_agente' then update agora.item set responsable_agente = (c ->> 'despues')::uuid, responsable_persona = null where id = it.id;
        when 'monto_mxn' then
          update agora.item set monto_mxn = (c ->> 'despues')::numeric where id = it.id;
          select * into it from agora.item where id = it.id;
          perform agora_priv.compromete(p, it, (c ->> 'despues')::numeric);
      end case;
      aplicados := aplicados + 1;
    end loop;
  elsif p.clase = 'crear_item' then
    for n in select * from jsonb_array_elements(coalesce(p.payload -> 'nuevos', '[]')) loop
      insert into agora.item (org_id, categoria_id, grupo, nombre, estado, prioridad, inicio, fin, responsable_persona, responsable_agente, etiquetas, monto_mxn)
      values (p.org_id, p.categoria_id, coalesce(n ->> 'grupo', 'General'), n ->> 'nombre', 'todo', coalesce(n ->> 'prioridad', 'media'),
              (n ->> 'inicio')::date, (n ->> 'fin')::date, (n ->> 'responsable_persona')::uuid, (n ->> 'responsable_agente')::uuid,
              coalesce(array(select jsonb_array_elements_text(n -> 'etiquetas')), '{}'), (n ->> 'monto_mxn')::numeric)
      returning id into nuevo;
      claves := claves || jsonb_build_object(coalesce(n ->> 'clave', nuevo::text), nuevo);
      select * into it from agora.item where id = nuevo;
      if it.monto_mxn is not null and it.monto_mxn > 0 then perform agora_priv.compromete(p, it, it.monto_mxn); end if;
      aplicados := aplicados + 1;
    end loop;
    -- Las dependencias de lo nuevo: a ítems existentes (uuid) o a otros nuevos por su clave.
    for n in select * from jsonb_array_elements(coalesce(p.payload -> 'nuevos', '[]')) loop
      insert into agora.dependencia (org_id, item_id, depende_de)
      select p.org_id, (claves ->> coalesce(n ->> 'clave', ''))::uuid, coalesce((claves ->> d)::uuid, d::uuid)
        from jsonb_array_elements_text(coalesce(n -> 'depende_de', '[]')) d
       where claves ? coalesce(n ->> 'clave', '');
    end loop;
  elsif p.clase = 'presupuesto' then
    insert into agora.presupuesto (org_id, categoria_id, periodo, version, importe_mxn, motivo, quien, aprobado_por, propuesta_id)
    values (p.org_id, p.categoria_id, p.payload ->> 'periodo', 1, (p.payload ->> 'importe_mxn')::numeric, p.payload ->> 'motivo',
            p.solicitada_por, (select a.decidida_por from agora.aprobacion a where a.propuesta_id = p.id and a.decision = 'aprobar' and a.rol_usado = 'finanzas' limit 1), p.id);
    aplicados := 1;
  elsif p.clase in ('tope_gasto', 'tope_cuota') then
    perform agora_priv.cambia_tope((p.payload ->> 'agente')::uuid, p.payload ->> 'tope', (p.payload ->> 'despues')::numeric,
                                   'subida aprobada (propuesta ' || p.id::text || ')', p.solicitada_por);
    aplicados := 1;
  else
    raise exception 'la clase % no se aplica desde una propuesta', p.clase using errcode = 'AG400';
  end if;
  update agora.propuesta set estado = 'aplicada', aplicada_en = now() where id = p.id;
  perform agora_priv.anota(p.org_id, (select x.tipo from agora_priv.actor() x), (select x.ref from agora_priv.actor() x), 'propuesta.aplica', p.id::text,
    jsonb_build_object('sha256', p.sha256, 'nivel', p.nivel, 'cambios', aplicados));
  return jsonb_build_object('ok', true, 'propuesta', p.id, 'cambios', aplicados, 'nuevos', claves);
end $$;

/** Deshacer un cambio que A2 aplicó solo, con un clic durante 24 h. Lo hace una persona con rol de edición. */
create or replace function agora.deshaz(hid bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h agora.item_historial;
  it agora.item;
begin
  select * into h from agora.item_historial where id = hid;
  if not found or not agora_priv.es_de_org(h.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  select * into it from agora.item where id = h.item_id for update;
  if not agora_priv.tiene_rol(it.org_id, it.categoria_id, array['propietario', 'administrador', 'aprobador', 'editor']) then
    raise exception 'deshacer pide rol de edición en la categoría' using errcode = 'AG403';
  end if;
  if h.deshacer_hasta is null or h.deshacer_hasta <= now() then raise exception 'eso ya no se deshace con un clic (solo A2, 24 h)' using errcode = 'AG409'; end if;
  if exists (select 1 from agora.item_historial x where x.deshace = h.id) then raise exception 'ya se deshizo' using errcode = 'AG409'; end if;
  if (to_jsonb(it) -> h.campo) is distinct from h.despues then raise exception 'el campo volvió a cambiar después: se edita a mano' using errcode = 'AG409'; end if;
  perform set_config('agora.autor_persona', auth.uid()::text, true);
  case h.campo
    when 'nombre' then update agora.item set nombre = h.antes #>> '{}' where id = it.id;
    when 'prioridad' then update agora.item set prioridad = h.antes #>> '{}' where id = it.id;
    when 'progreso' then update agora.item set progreso = (h.antes #>> '{}')::int where id = it.id;
    when 'etiquetas' then update agora.item set etiquetas = array(select jsonb_array_elements_text(h.antes)) where id = it.id;
    else raise exception 'ese campo no se deshace con un clic' using errcode = 'AG400';
  end case;
  perform agora_priv.anota(it.org_id, 'humano', auth.uid()::text, 'item.deshaz', hid::text, jsonb_build_object('campo', h.campo));
  return jsonb_build_object('ok', true);
end $$;

-- --- El ciclo del agente -------------------------------------------------------------------------------------
/** Las firmas del alta: la Propietaria y un Aprobador del dominio del alcance, cada uno con su sesión. */
create or replace function agora.firma_alta(aid uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  rol text;
begin
  select * into a from agora.agente where id = aid for update;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if a.estado not in ('solicitado', 'en_revision') then raise exception 'el alta ya no espera firmas (%)', a.estado using errcode = 'AG409'; end if;
  if agora_priv.tiene_rol(a.org_id, null, array['propietario']) then rol := 'propietario';
  elsif exists (select 1 from agora.agente_alcance x where x.agente_id = a.id and agora_priv.tiene_rol(a.org_id, x.nodo_id, array['aprobador'])) then rol := 'aprobador';
  else raise exception 'el alta la firman la Propietaria y el Aprobador del dominio' using errcode = 'AG403';
  end if;
  insert into agora.agente_firma (agente_id, org_id, version, persona_id, rol_usado) values (a.id, a.org_id, a.version, auth.uid(), rol)
  on conflict do nothing;
  update agora.agente set estado = 'en_revision' where id = a.id and estado = 'solicitado';
  if (select count(distinct f.rol_usado) from agora.agente_firma f where f.agente_id = a.id and f.version = a.version) = 2 then
    update agora.agente set estado = 'prueba' where id = a.id;
  end if;
  perform agora_priv.anota(a.org_id, 'humano', auth.uid()::text, 'agente.firma_alta', a.id::text, jsonb_build_object('rol', rol, 'version', a.version));
  return jsonb_build_object('ok', true, 'estado', (select x.estado from agora.agente x where x.id = a.id));
end $$;

/** Del periodo de prueba a activo: lo decide la Propietaria. */
create or replace function agora.activa_agente(aid uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a agora.agente;
begin
  select * into a from agora.agente where id = aid for update;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not agora_priv.tiene_rol(a.org_id, null, array['propietario']) then raise exception 'activar a un agente es de la Propietaria' using errcode = 'AG403'; end if;
  if a.estado <> 'prueba' then raise exception 'solo se activa un agente en prueba (%)', a.estado using errcode = 'AG409'; end if;
  update agora.agente set estado = 'aprobado' where id = a.id;
  perform agora_priv.anota(a.org_id, 'humano', auth.uid()::text, 'agente.activa', a.id::text, '{}');
  return jsonb_build_object('ok', true);
end $$;

create or replace function agora_priv.suspende(a agora.agente, motivo text, quien uuid, quien_agente uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare congeladas int;
begin
  update agora.agente set estado = 'suspendido' where id = a.id;
  update agora.propuesta set estado = 'congelada' where autor_agente = a.id and estado = 'pendiente';
  get diagnostics congeladas = row_count;
  insert into agora.revocacion (org_id, agente_id, accion, quien, quien_agente, motivo, retirado)
  values (a.org_id, a.id, 'suspender', quien, quien_agente, motivo, jsonb_build_object('propuestas_congeladas', congeladas));
  perform agora_priv.anota(a.org_id, case when quien is not null then 'humano' else 'agente' end, coalesce(quien, quien_agente)::text, 'agente.suspende', a.id::text,
                           jsonb_build_object('motivo', motivo, 'congeladas', congeladas));
  return jsonb_build_object('ok', true, 'congeladas', congeladas);
end $$;

/** Suspender: reversible. La Propietaria, el Administrador o el Aprobador de un dominio de su alcance. */
create or replace function agora.suspende_agente(aid uuid, motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a agora.agente;
begin
  select * into a from agora.agente where id = aid for update;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not (agora_priv.tiene_rol(a.org_id, null, array['propietario', 'administrador'])
          or exists (select 1 from agora.agente_alcance x where x.agente_id = a.id and agora_priv.tiene_rol(a.org_id, x.nodo_id, array['aprobador']))) then
    raise exception 'suspender: Propietaria, Administrador o el Aprobador de su dominio' using errcode = 'AG403';
  end if;
  if a.estado not in ('aprobado', 'prueba') then raise exception 'el agente no está activo (%)', a.estado using errcode = 'AG409'; end if;
  return agora_priv.suspende(a, motivo, auth.uid(), null);
end $$;

/** El vigía suspende solo: deriva de la tarjeta, firma inválida o inyección repetida. */
create or replace function agora.suspende_por_vigia(aid uuid, motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  vigia uuid := agora_priv.agente_de_tarea();
begin
  if vigia is null or not exists (select 1 from agora.agente v where v.id = vigia and v.rol = 'vigia' and v.origen = 'interno') then
    raise exception 'solo el vigía suspende por su cuenta' using errcode = 'AG403';
  end if;
  if motivo not in ('deriva_tarjeta', 'firma_invalida', 'inyeccion') then raise exception 'el vigía suspende solo por deriva, firma o inyección' using errcode = 'AG400'; end if;
  select * into a from agora.agente where id = aid for update;
  if not found or a.org_id <> (select v.org_id from agora.agente v where v.id = vigia) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if a.estado not in ('aprobado', 'prueba') then return jsonb_build_object('ok', true, 'ya', a.estado); end if;
  insert into agora.aviso (org_id, clave, tipo, para_rol, agente_id, texto)
  values (a.org_id, 'suspension:' || a.id || ':' || motivo || ':' || to_char(now(), 'YYYY-MM-DD"h"HH24'), 'deriva_tarjeta', 'propietario', a.id,
          'El vigía suspendió a ' || a.nombre || ' (' || replace(motivo, '_', ' ') || '). Revísalo antes de reactivarlo.')
  on conflict do nothing;
  return agora_priv.suspende(a, motivo, null, vigia);
end $$;

create or replace function agora.reactiva_agente(aid uuid, motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  n int;
begin
  select * into a from agora.agente where id = aid for update;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not agora_priv.tiene_rol(a.org_id, null, array['propietario']) then raise exception 'reactivar es de la Propietaria' using errcode = 'AG403'; end if;
  if a.estado <> 'suspendido' then raise exception 'solo se reactiva a un agente suspendido (%)', a.estado using errcode = 'AG409'; end if;
  update agora.agente set estado = 'aprobado' where id = a.id;
  update agora.propuesta set estado = 'pendiente' where autor_agente = a.id and estado = 'congelada' and vence_en > now();
  get diagnostics n = row_count;
  insert into agora.revocacion (org_id, agente_id, accion, quien, motivo, retirado) values (a.org_id, a.id, 'reactivar', auth.uid(), motivo, jsonb_build_object('descongeladas', n));
  perform agora_priv.anota(a.org_id, 'humano', auth.uid()::text, 'agente.reactiva', a.id::text, jsonb_build_object('motivo', motivo));
  return jsonb_build_object('ok', true, 'descongeladas', n);
end $$;

/**
 * Revocar: definitivo, con motivo y por el freno (la cita textual queda). TODO en una transacción: el idCard a
 * revocado y su kid a la lista de llaves revocadas; sus propuestas, retiradas; sus tareas A2A, canceladas; sus
 * ítems, sin responsable (con aviso al aprobador del dominio); sus recordatorios, cancelados. La Puerta lee el
 * idCard sin caché: la siguiente llamada ya falla aunque el token siga vigente.
 */
create or replace function agora.revoca_agente(aid uuid, motivo text, cita text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  props int; tareas int; items int; recs int;
  r record;
begin
  select * into a from agora.agente where id = aid for update;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not agora_priv.tiene_rol(a.org_id, null, array['propietario', 'administrador']) then raise exception 'revocar es de la Propietaria o el Administrador' using errcode = 'AG403'; end if;
  if a.estado = 'revocado' then raise exception 'el agente ya está revocado' using errcode = 'AG409'; end if;
  if length(coalesce(btrim(cita), '')) < 8 then raise exception 'revocar va por el freno: falta la cita textual' using errcode = 'AG400'; end if;
  perform agora_priv.consume_testigo(cita, 'revoca_agente'); -- la cita la dijo ESTA persona, una vez y hace ≤ 15 min (014)
  update agora.agente set estado = 'revocado' where id = a.id;
  if a.kid is not null then insert into agora.llave_revocada (org_id, kid) values (a.org_id, a.kid) on conflict do nothing; end if;
  update agora.propuesta set estado = 'retirada' where autor_agente = a.id and estado in ('pendiente', 'congelada', 'a_revision');
  get diagnostics props = row_count;
  update agora.a2a_tarea set estado = 'canceled' where agente_id = a.id and estado in ('submitted', 'working', 'input-required');
  get diagnostics tareas = row_count;
  for r in select i.id, i.categoria_id, i.nombre from agora.item i where i.responsable_agente = a.id loop
    insert into agora.aviso (org_id, clave, tipo, para_rol, nodo_id, item_id, agente_id, texto)
    values (a.org_id, 'sin_responsable:' || r.id || ':' || a.id, 'sin_responsable', 'aprobador', r.categoria_id, r.id, a.id,
            '«' || r.nombre || '» quedó sin responsable: se revocó a ' || a.nombre || '.')
    on conflict do nothing;
  end loop;
  update agora.item set responsable_agente = null where responsable_agente = a.id;
  get diagnostics items = row_count;
  update agora.recordatorio set estado = 'cancelado' where agente_id = a.id and estado = 'programado';
  get diagnostics recs = row_count;
  insert into agora.revocacion (org_id, agente_id, accion, quien, motivo, cita, retirado)
  values (a.org_id, a.id, 'revocar', auth.uid(), motivo, cita, jsonb_build_object('propuestas', props, 'tareas', tareas, 'items', items, 'recordatorios', recs));
  perform agora_priv.anota(a.org_id, 'humano', auth.uid()::text, 'agente.revoca', a.id::text,
                           jsonb_build_object('motivo', motivo, 'kid', a.kid, 'propuestas', props, 'tareas', tareas, 'items', items, 'recordatorios', recs));
  return jsonb_build_object('ok', true, 'propuestas', props, 'tareas', tareas, 'items', items, 'recordatorios', recs);
end $$;

-- --- Los topes ------------------------------------------------------------------------------------------------
create or replace function agora_priv.cambia_tope(aid uuid, tope text, valor numeric, motivo text, quien uuid) returns void language plpgsql security definer set search_path = '' as $$
declare a agora.agente;
begin
  select * into a from agora.agente where id = aid for update;
  if tope = 'gasto' then update agora.agente set tope_gasto_mes_mxn = valor, version = version + 1 where id = aid;
  elsif tope = 'mensajes' then update agora.agente set tope_mensajes_hora = valor::int, version = version + 1 where id = aid;
  elsif tope = 'propuestas' then update agora.agente set tope_propuestas_dia = valor::int, version = version + 1 where id = aid;
  else raise exception 'tope desconocido: %', tope using errcode = 'AG400';
  end if;
  select * into a from agora.agente where id = aid;
  insert into agora.agente_version (agente_id, org_id, version, idcard, idcard_sha256, motivo, quien)
  values (a.id, a.org_id, a.version, to_jsonb(a) - 'llave_publica', encode(sha256(convert_to((to_jsonb(a) - 'llave_publica')::text, 'UTF8')), 'hex'), motivo, quien);
  perform agora_priv.anota(a.org_id, case when quien is null then 'sistema' else 'humano' end, quien::text, 'agente.tope', a.id::text,
                           jsonb_build_object('tope', tope, 'valor', valor, 'version', a.version));
end $$;

/** Bajar un tope es directo para la Propietaria o el Administrador. Subirlo es una propuesta (la Propietaria, y el
 *  de gasto también Finanzas): esta función solo baja. */
create or replace function agora.baja_tope(aid uuid, tope text, valor numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  actual numeric;
begin
  select * into a from agora.agente where id = aid;
  if not found or not agora_priv.es_de_org(a.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not agora_priv.tiene_rol(a.org_id, null, array['propietario', 'administrador']) then raise exception 'bajar un tope: Propietaria o Administrador' using errcode = 'AG403'; end if;
  actual := case tope when 'gasto' then a.tope_gasto_mes_mxn when 'mensajes' then a.tope_mensajes_hora when 'propuestas' then a.tope_propuestas_dia end;
  if actual is null then raise exception 'tope desconocido: %', tope using errcode = 'AG400'; end if;
  if valor >= actual then raise exception 'subir un tope es una propuesta (la Propietaria; el de gasto, también Finanzas)' using errcode = 'AG403'; end if;
  perform agora_priv.cambia_tope(a.id, tope, valor, 'baja directa', auth.uid());
  return jsonb_build_object('ok', true, 'antes', actual, 'despues', valor);
end $$;

-- --- Segregación de funciones: quitarla es una decisión registrada de la organización (por el freno) -----------
create or replace function agora.cambia_segregacion(o uuid, activa boolean, cita text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not agora_priv.tiene_rol(o, null, array['propietario']) then raise exception 'la segregación la decide la Propietaria' using errcode = 'AG403'; end if;
  if length(coalesce(btrim(cita), '')) < 8 then raise exception 'esto va por el freno: falta la cita textual' using errcode = 'AG400'; end if;
  if not activa then perform agora_priv.consume_testigo(cita, 'quita_segregacion'); end if; -- quitarla va por el freno; ponerla no
  update agora.org_config set segregacion = activa where org_id = o;
  insert into agora.decision_org (org_id, tipo, quien, cita) values (o, case when activa then 'segregacion_on' else 'segregacion_off' end, auth.uid(), cita);
  perform agora_priv.anota(o, 'humano', auth.uid()::text, 'org.segregacion', o::text, jsonb_build_object('activa', activa));
  return jsonb_build_object('ok', true, 'segregacion', activa);
end $$;

/** Finanzas libera lo que quedó comprometido y no se va a ejercer (vuelve al disponible). */
create or replace function agora.libera_compromiso(cid uuid, motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare k record;
begin
  select * into k from agora.v_compromiso_saldo where id = cid;
  if not found or not agora_priv.es_de_org(k.org_id) then raise exception 'no existe' using errcode = 'AG404'; end if;
  if not agora_priv.tiene_rol(k.org_id, null, array['finanzas']) then raise exception 'liberar un compromiso es de Finanzas' using errcode = 'AG403'; end if;
  update agora.compromiso set liberado_mxn = k.importe_mxn - k.ejercido_mxn, estado = 'liberado' where id = cid;
  perform agora_priv.anota(k.org_id, 'humano', auth.uid()::text, 'compromiso.libera', cid::text, jsonb_build_object('liberado', k.vigente_mxn, 'motivo', motivo));
  return jsonb_build_object('ok', true, 'liberado', k.vigente_mxn);
end $$;

-- --- El cierre del periodo y su póliza propuesta -------------------------------------------------------------
/** La plantilla que aplica a un origen en una categoría (la de la categoría o la de toda la organización). */
-- Ojo: en una función SQL un parámetro con el nombre de una columna PIERDE contra la columna («pl.origen = origen» era
-- siempre verdadero). Lo cazó la re-verificación independiente de la póliza: los parámetros no se llaman como columnas.
drop function if exists agora_priv.plantilla(uuid, text, uuid);
create or replace function agora_priv.plantilla(p_org uuid, p_origen text, p_categoria uuid) returns agora.plantilla_asiento language sql stable security definer set search_path = '' as $$
  select pl.* from agora.plantilla_asiento pl
   where pl.org_id = p_org and pl.origen = p_origen and (pl.categoria_slug = (select n.slug from agora.nodo n where n.id = p_categoria) or pl.categoria_slug is null)
   order by pl.categoria_slug nulls last limit 1
$$;

/**
 * Cierra los costos del periodo (IRREVERSIBLE; llega por el freno de la capa con la cita textual de quien cierra)
 * y deja la póliza PROPUESTA de diario: por cada ejercido con CFDI o comprobante, cargo al gasto de su plantilla y
 * abono a su proveedor, con el UUID; por cada reclasificación, cargo al destino y abono al origen; y el gasto de
 * modelo con costo en MXN, por categoría. Lo que va sin costo (null) no entra: se declara en `sin_costear`.
 */
create or replace function agora.cierra_periodo(o uuid, per text, cita text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  folio text;
  orden int := 0;
  x record;
  pl agora.plantilla_asiento;
  pendientes int;
  sin_costo int;
  lineas int := 0;
begin
  if not agora_priv.tiene_rol(o, null, array['finanzas']) then raise exception 'cerrar el periodo es de Finanzas' using errcode = 'AG403'; end if;
  if length(coalesce(btrim(cita), '')) < 8 then raise exception 'cerrar el periodo va por el freno: falta la cita textual' using errcode = 'AG400'; end if;
  if agora_priv.periodo_cerrado(o, per) then raise exception 'el periodo % ya está cerrado', per using errcode = 'AG409'; end if;
  if per >= to_char(now() at time zone coalesce((select c.zona from agora.org_config c where c.org_id = o), 'America/Mexico_City'), 'YYYY-MM') then
    raise exception 'el periodo % no ha terminado: se cierra un mes vencido', per using errcode = 'AG409';
  end if;
  select count(*) into pendientes from agora.costo where org_id = o and periodo = per and estado = 'pendiente';
  if pendientes > 0 then raise exception 'hay % costo(s) del periodo sin evidencia: nada queda pendiente al cierre', pendientes using errcode = 'AG409'; end if;
  perform agora_priv.consume_testigo(cita, 'cierra_periodo'); -- después de validar: un cierre imposible no gasta la cita
  select count(*) into sin_costo from agora.gasto_modelo where org_id = o and periodo = per and costo_mxn is null;
  if not exists (select 1 from agora.costo where org_id = o and periodo = per and estado = 'ejercido')
     and not exists (select 1 from agora.gasto_modelo where org_id = o and periodo = per and costo_mxn is not null) then
    insert into agora.periodo (org_id, periodo, estado, cerrado_por, cerrado_en, cita) values (o, per, 'cerrado', auth.uid(), now(), cita)
    on conflict (org_id, periodo) do update set estado = 'cerrado', cerrado_por = excluded.cerrado_por, cerrado_en = excluded.cerrado_en, cita = excluded.cita;
    perform agora_priv.anota(o, 'humano', auth.uid()::text, 'periodo.cierra', per, jsonb_build_object('poliza', null, 'lineas', 0, 'sin_costear', sin_costo));
    return jsonb_build_object('ok', true, 'poliza', null, 'lineas', 0, 'sin_costear', sin_costo);
  end if;
  folio := 'POL-' || per || '-D-' || lpad((coalesce((select count(*) from agora.poliza p where p.org_id = o and p.periodo = per), 0) + 1)::text, 3, '0');
  insert into agora.poliza (org_id, periodo, tipo, folio, concepto, sin_costear)
  values (o, per, 'diario', folio, 'Provisión de costos del periodo ' || per || ' (Ágora, propuesta)', sin_costo) returning id into pid;
  for x in select c.*, n.slug cat from agora.costo c join agora.nodo n on n.id = c.categoria_id
            where c.org_id = o and c.periodo = per and c.estado = 'ejercido' and c.tipo <> 'reclasificacion' order by c.cuando, c.id loop
    pl := agora_priv.plantilla(o, x.tipo, x.categoria_id);
    if pl.org_id is null then raise exception 'no hay plantilla de asiento para % en %', x.tipo, x.cat using errcode = 'AG400'; end if;
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, uuid_cfdi, rfc_tercero, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_cargo, 'cargo', x.importe_mxn, x.evidencia_uuid, x.proveedor_rfc, coalesce(x.evidencia_uuid::text, 'comprobante ' || left(x.evidencia_sha256, 12)), x.categoria_id, x.concepto);
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, uuid_cfdi, rfc_tercero, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_abono, 'abono', x.importe_mxn, x.evidencia_uuid, x.proveedor_rfc, coalesce(x.evidencia_uuid::text, 'comprobante ' || left(x.evidencia_sha256, 12)), x.categoria_id, coalesce(x.proveedor, x.concepto));
    lineas := lineas + 1;
  end loop;
  for x in select c.*, o2.importe_mxn original from agora.costo c join agora.costo o2 on o2.id = c.reclasifica
            where c.org_id = o and c.periodo = per and c.estado = 'ejercido' and c.tipo = 'reclasificacion' order by c.cuando, c.id loop
    pl := agora_priv.plantilla(o, 'comprobante', x.categoria_id);
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_cargo, 'cargo', x.importe_mxn, 'reclasificación ' || x.reclasifica, x.categoria_id, x.concepto);
    pl := agora_priv.plantilla(o, 'comprobante', x.de_categoria_id);
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_cargo, 'abono', x.importe_mxn, 'reclasificación ' || x.reclasifica, x.de_categoria_id, x.concepto);
    lineas := lineas + 1;
  end loop;
  for x in select g.categoria_id, sum(g.costo_mxn) mxn, sum(g.costo_usd) usd, count(*) n, min(t.valor_mxn) tc_min, max(t.valor_mxn) tc_max, min(t.fuente) fuente
             from agora.gasto_modelo g left join agora.tipo_cambio t on t.id = g.tipo_cambio_id
            where g.org_id = o and g.periodo = per and g.costo_mxn is not null group by g.categoria_id loop
    pl := agora_priv.plantilla(o, 'gasto_modelo', x.categoria_id);
    if pl.org_id is null then raise exception 'no hay plantilla de asiento para el gasto de modelo' using errcode = 'AG400'; end if;
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_cargo, 'cargo', x.mxn, 'uso de modelo: ' || x.n || ' llamada(s), USD ' || round(x.usd, 4) || ', TC ' || x.tc_min || '–' || x.tc_max || ' (' || x.fuente || ')', x.categoria_id, 'Gasto de modelo de los agentes');
    orden := orden + 1;
    insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, documento, categoria_id, concepto)
    values (pid, o, orden, pl.cuenta_abono, 'abono', x.mxn, 'uso de modelo: ' || x.n || ' llamada(s)', x.categoria_id, 'Proveedor de modelo (extranjero)');
    lineas := lineas + 1;
  end loop;
  update agora.poliza set sha256 = agora.huella_poliza(pid) where id = pid;
  insert into agora.periodo (org_id, periodo, estado, cerrado_por, cerrado_en, cita) values (o, per, 'cerrado', auth.uid(), now(), cita)
  on conflict (org_id, periodo) do update set estado = 'cerrado', cerrado_por = excluded.cerrado_por, cerrado_en = excluded.cerrado_en, cita = excluded.cita;
  perform agora_priv.anota(o, 'humano', auth.uid()::text, 'periodo.cierra', per, jsonb_build_object('poliza', pid, 'lineas', lineas, 'sin_costear', sin_costo));
  return jsonb_build_object('ok', true, 'poliza', pid, 'folio', folio, 'lineas', lineas, 'sin_costear', sin_costo);
end $$;
