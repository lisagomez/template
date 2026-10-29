-- =============================================================================
-- Ágora · 009 · RLS FORZADA en toda tabla de `agora`, las políticas por principal y los privilegios. Idempotente.
--
-- Un solo lugar para auditar quién ve y quién escribe qué. Reglas:
--   · Personas: leen lo de su organización según su alcance (el nodo, sus ancestros y lo de abajo); escriben
--     solo lo que su rol permite, y como sí mismas. Nada de otra organización existe para ellas.
--   · Agentes: leen y escriben SOLO dentro de su alcance, con su token de tarea verificado por la base.
--     Insertan mensajes, propuestas, su gasto de modelo y avisos. No actualizan ni borran nada. No aprueban.
--   · La Puerta: ninguna tabla; solo sus tres funciones.
--   · Aprobaciones y decisiones de póliza: dos cierres — la política restrictiva `decidida_por = agora_priv.uid()` y
--     ningún rol de servicio ni de agente con INSERT (se revoca explícito a `service_role`).
-- =============================================================================
set check_function_bodies = off;

-- Cada categoría nueva nace con su canal en el buzón.
create or replace function agora_priv.canal_de_categoria() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'categoria' then
    insert into agora.canal (org_id, categoria_id, nombre) values (new.org_id, new.id, new.nombre) on conflict (categoria_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists tg_canal_de_categoria on agora.nodo;
create trigger tg_canal_de_categoria after insert on agora.nodo for each row execute function agora_priv.canal_de_categoria();

create or replace function agora_priv.ve_canal(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.canal c where c.id = cid and agora_priv.ve_nodo(c.org_id, c.categoria_id))
$$;
create or replace function agora_priv.publica_en(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.canal c where c.id = cid and agora_priv.tiene_rol(c.org_id, c.categoria_id, array['propietario', 'administrador', 'aprobador', 'editor', 'colaborador', 'finanzas', 'contabilidad']))
$$;
create or replace function agora_priv.agente_ve_canal(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.canal c where c.id = cid and agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), c.categoria_id))
$$;
create or replace function agora_priv.ve_propuesta(pid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.propuesta p where p.id = pid and (agora_priv.ve_nodo(p.org_id, p.categoria_id)
                 or agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), p.categoria_id)))
$$;
create or replace function agora_priv.ve_item(iid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.item i where i.id = iid and (agora_priv.ve_nodo(i.org_id, i.categoria_id)
                 or agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), i.categoria_id)))
$$;
create or replace function agora_priv.soy_interno() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.agente yo where yo.id = agora_priv.agente_de_tarea() and yo.origen = 'interno')
$$;
create or replace function agora_priv.ve_dinero(o uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select agora_priv.tiene_rol(o, null, array['propietario', 'finanzas', 'contabilidad'])
$$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'agora' loop
    execute format('alter table agora.%I enable row level security', t);
    execute format('alter table agora.%I force row level security', t);
  end loop;
end $$;

-- Las políticas se rehacen enteras (idempotente): primero se borran todas las de `agora`.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'agora' loop
    execute format('drop policy %I on agora.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- --- Personas (authenticated) ------------------------------------------------------------------------------------
create policy p_org on agora.org for select to authenticated using (agora_priv.es_de_org(id));
create policy p_org_config on agora.org_config for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_nodo on agora.nodo for select to authenticated using (agora_priv.ve_nodo(org_id, id));
create policy p_nodo_alta on agora.nodo for insert to authenticated
  with check (agora_priv.tiene_rol(org_id, padre_id, array['propietario', 'administrador']));
create policy p_persona on agora.persona for select to authenticated using (org_id = agora_priv.org_de_persona());
create policy p_membresia on agora.membresia for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_membresia_alta on agora.membresia for insert to authenticated
  with check (agora_priv.tiene_rol(org_id, null, array['propietario']) or (agora_priv.tiene_rol(org_id, null, array['administrador']) and rol not in ('propietario', 'finanzas', 'contabilidad')));
create policy p_matriz on agora.matriz_regla for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_matriz_alta on agora.matriz_regla for insert to authenticated with check (agora_priv.tiene_rol(org_id, null, array['propietario']));
create policy p_decision_org on agora.decision_org for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_agente on agora.agente for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_agente_alta on agora.agente for insert to authenticated
  with check (agora_priv.tiene_rol(org_id, null, array['propietario']) and estado = 'solicitado');
create policy p_alcance on agora.agente_alcance for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_alcance_alta on agora.agente_alcance for insert to authenticated with check (agora_priv.tiene_rol(org_id, null, array['propietario'])
  and exists (select 1 from agora.agente a where a.id = agente_id and a.estado in ('solicitado', 'en_revision')));
create policy p_version on agora.agente_version for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_firma on agora.agente_firma for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_revocacion on agora.revocacion for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_llave on agora.llave_revocada for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_llamada on agora.a2a_llamada for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_tarea on agora.a2a_tarea for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_item on agora.item for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_item_escribe on agora.item for insert to authenticated
  with check (agora_priv.tiene_rol(org_id, categoria_id, array['propietario', 'administrador', 'aprobador', 'editor']));
create policy p_item_cambia on agora.item for update to authenticated
  using (agora_priv.tiene_rol(org_id, categoria_id, array['propietario', 'administrador', 'aprobador', 'editor', 'colaborador']))
  with check (agora_priv.tiene_rol(org_id, categoria_id, array['propietario', 'administrador', 'aprobador', 'editor', 'colaborador']));
create policy p_dependencia on agora.dependencia for select to authenticated using (agora_priv.ve_item(item_id));
create policy p_dependencia_escribe on agora.dependencia for insert to authenticated
  with check (exists (select 1 from agora.item i where i.id = item_id and agora_priv.tiene_rol(i.org_id, i.categoria_id, array['propietario', 'administrador', 'aprobador', 'editor'])));
create policy p_dependencia_quita on agora.dependencia for delete to authenticated
  using (exists (select 1 from agora.item i where i.id = item_id and agora_priv.tiene_rol(i.org_id, i.categoria_id, array['propietario', 'administrador', 'aprobador', 'editor'])));
create policy p_historial on agora.item_historial for select to authenticated using (agora_priv.ve_item(item_id));
create policy p_columna on agora.columna for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_recordatorio on agora.recordatorio for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_item_evento on agora.item_evento for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_aviso on agora.aviso for select to authenticated using (agora_priv.es_de_org(org_id)
  and (para_persona = agora_priv.uid() or para_rol is null or agora_priv.tiene_rol(org_id, nodo_id, array[para_rol])));
create policy p_canal on agora.canal for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_mensaje on agora.mensaje for select to authenticated using (agora_priv.ve_canal(canal_id));
create policy p_mensaje_publica on agora.mensaje for insert to authenticated
  with check (autor_tipo = 'humano' and autor_persona = agora_priv.uid() and origen = 'sala' and agora_priv.publica_en(canal_id));
create policy p_propuesta on agora.propuesta for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_propuesta_humana on agora.propuesta for insert to authenticated
  with check (autor_persona = agora_priv.uid() and autor_agente is null
              and agora_priv.tiene_rol(org_id, categoria_id, array['propietario', 'administrador', 'aprobador', 'editor', 'colaborador', 'finanzas']));
create policy p_aprobacion on agora.aprobacion for select to authenticated using (agora_priv.ve_propuesta(propuesta_id));
create policy p_aprobacion_en_org on agora.aprobacion for insert to authenticated with check (agora_priv.es_de_org(org_id));
create policy p_aprobacion_solo_humana on agora.aprobacion as restrictive for insert to authenticated with check (decidida_por = agora_priv.uid());
create policy p_tipo_cambio on agora.tipo_cambio for select to authenticated using (true);
create policy p_periodo on agora.periodo for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_presupuesto on agora.presupuesto for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_compromiso on agora.compromiso for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_costo on agora.costo for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_costo_registra on agora.costo for insert to authenticated with check (agora_priv.tiene_rol(org_id, null, array['finanzas']));
create policy p_costo_evidencia on agora.costo for update to authenticated using (agora_priv.tiene_rol(org_id, null, array['finanzas']))
  with check (agora_priv.tiene_rol(org_id, null, array['finanzas']));
create policy p_gasto on agora.gasto_modelo for select to authenticated using (agora_priv.ve_nodo(org_id, categoria_id));
create policy p_cuenta on agora.cuenta for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_plantilla on agora.plantilla_asiento for select to authenticated using (agora_priv.es_de_org(org_id));
create policy p_poliza on agora.poliza for select to authenticated using (agora_priv.ve_dinero(org_id));
create policy p_movimiento on agora.poliza_movimiento for select to authenticated using (agora_priv.ve_dinero(org_id));
create policy p_decision on agora.poliza_decision for select to authenticated using (agora_priv.ve_dinero(org_id));
create policy p_decision_en_org on agora.poliza_decision for insert to authenticated with check (agora_priv.es_de_org(org_id));
create policy p_decision_solo_humana on agora.poliza_decision as restrictive for insert to authenticated with check (decidida_por = agora_priv.uid());
create policy p_bitacora on agora.bitacora for select to authenticated using (agora_priv.tiene_rol(org_id, null, array['propietario', 'administrador', 'finanzas', 'contabilidad']));

-- --- Agentes (agora_agente): solo dentro de su alcance, con su token verificado ------------------------------------
create policy a_org on agora.org for select to agora_agente using (id = agora_priv.org_de_agente());
create policy a_org_config on agora.org_config for select to agora_agente using (org_id = agora_priv.org_de_agente());
create policy a_nodo on agora.nodo for select to agora_agente using (agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), id));
create policy a_agente on agora.agente for select to agora_agente using (org_id = agora_priv.org_de_agente()
  and (id = agora_priv.agente_de_tarea() or agora_priv.soy_interno()));
create policy a_alcance on agora.agente_alcance for select to agora_agente using (agente_id = agora_priv.agente_de_tarea());
create policy a_canal on agora.canal for select to agora_agente using (agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), categoria_id));
create policy a_mensaje on agora.mensaje for select to agora_agente using (agora_priv.agente_ve_canal(canal_id));
create policy a_mensaje_publica on agora.mensaje for insert to agora_agente
  with check (autor_tipo = 'agente' and autor_agente = agora_priv.agente_de_tarea() and origen in ('sala', 'puerta') and agora_priv.agente_ve_canal(canal_id));
create policy a_item on agora.item for select to agora_agente using (agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), categoria_id));
create policy a_dependencia on agora.dependencia for select to agora_agente using (agora_priv.ve_item(item_id));
create policy a_propuesta on agora.propuesta for select to agora_agente using (agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), categoria_id));
create policy a_propuesta_crea on agora.propuesta for insert to agora_agente
  with check (autor_agente = agora_priv.agente_de_tarea() and autor_persona is null and agora_priv.agente_alcanza(autor_agente, categoria_id));
create policy a_aprobacion on agora.aprobacion for select to agora_agente using (agora_priv.ve_propuesta(propuesta_id));
create policy a_tipo_cambio on agora.tipo_cambio for select to agora_agente using (true);
create policy a_gasto on agora.gasto_modelo for select to agora_agente using (agente_id = agora_priv.agente_de_tarea() or ejecutado_por = agora_priv.agente_de_tarea());
create policy a_gasto_registra on agora.gasto_modelo for insert to agora_agente with check (ejecutado_por = agora_priv.agente_de_tarea() and org_id = agora_priv.org_de_agente());
create policy a_columna on agora.columna for select to agora_agente using (org_id = agora_priv.org_de_agente());
create policy a_recordatorio on agora.recordatorio for select to agora_agente using (org_id = agora_priv.org_de_agente());

-- --- Privilegios ------------------------------------------------------------------------------------------------
grant usage on schema agora, agora_priv to authenticated, agora_agente, agora_puerta;
grant usage on schema extensions to authenticated, agora_agente, agora_puerta;
revoke all on all tables in schema agora from anon, authenticated, agora_agente, agora_puerta;
grant select on all tables in schema agora to authenticated;
grant insert on agora.nodo, agora.membresia, agora.matriz_regla, agora.agente, agora.agente_alcance, agora.item, agora.dependencia,
  agora.mensaje, agora.propuesta, agora.aprobacion, agora.costo, agora.poliza_decision to authenticated;
grant update on agora.item, agora.costo to authenticated;
grant delete on agora.dependencia to authenticated;
grant select on agora.org, agora.org_config, agora.nodo, agora.agente, agora.agente_alcance, agora.canal, agora.mensaje, agora.item, agora.dependencia,
  agora.propuesta, agora.aprobacion, agora.tipo_cambio, agora.gasto_modelo, agora.columna, agora.recordatorio to agora_agente;
grant insert on agora.mensaje, agora.propuesta, agora.gasto_modelo to agora_agente;

-- El segundo cierre del invariante, explícito: nadie que no sea una persona escribe aprobaciones ni decide pólizas.
revoke insert, update, delete on agora.aprobacion, agora.poliza_decision from agora_agente, agora_puerta;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke insert, update, delete on agora.aprobacion, agora.poliza_decision from service_role';
  end if;
end $$;
revoke update, delete on agora.aprobacion, agora.poliza_decision from authenticated;

-- Funciones: nada por defecto (PUBLIC), y luego lo justo.
revoke execute on all functions in schema agora_priv from public;
revoke execute on all functions in schema agora from public;
grant execute on all functions in schema agora_priv to authenticated, agora_agente, agora_puerta;
-- Las que ESCRIBEN no se llaman a mano: solo desde las funciones de la base.
revoke execute on function agora_priv.anota(uuid, text, text, text, text, jsonb), agora_priv.suspende(agora.agente, text, uuid, uuid),
  agora_priv.cambia_tope(uuid, text, numeric, text, uuid), agora_priv.compromete(agora.propuesta, agora.item, numeric),
  agora_priv.avisa_tope(agora.agente, text, numeric, numeric, text, uuid) from authenticated, agora_agente, agora_puerta;
grant execute on function agora.aplica_propuesta(uuid), agora.puede_llamar_modelo(uuid) to authenticated, agora_agente;
grant execute on function agora.deshaz(bigint), agora.firma_alta(uuid), agora.activa_agente(uuid), agora.suspende_agente(uuid, text),
  agora.reactiva_agente(uuid, text), agora.revoca_agente(uuid, text, text), agora.baja_tope(uuid, text, numeric),
  agora.cambia_segregacion(uuid, boolean, text), agora.libera_compromiso(uuid, text), agora.cierra_periodo(uuid, text, text),
  agora.exporta_poliza(uuid), agora.huella_poliza(uuid), agora.verifica_bitacora(uuid) to authenticated;
grant execute on function agora.suspende_por_vigia(uuid, text) to agora_agente;
grant execute on function agora.puerta_lee(text, text), agora.puerta_toma_jti(uuid, text, timestamptz),
  agora.puerta_anota(uuid, uuid, text, text, text, text, text, int, int) to agora_puerta;
