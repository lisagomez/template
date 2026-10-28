-- =============================================================================
-- Ágora · 013 · lo que escribe el VIGÍA (eventos de calendario, recordatorios y avisos, todos idempotentes por clave) y
-- la capa semántica de métricas (modelos con medidas y dimensiones; las métricas se compilan sobre ellos). Idempotente.
-- =============================================================================
set check_function_bodies = off;

create or replace function agora_priv.soy_vigia() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.agente v where v.id = agora_priv.agente_de_tarea() and v.rol = 'vigia' and v.origen = 'interno')
$$;

/** El evento del calendario de la fecha de un ítem: UNO por clave item:<id>:fecha:v<n>. Repetirlo no crea otro. */
-- Los parámetros y variables no se llaman como una columna (clave, tipo, …): en plpgsql «on conflict (clave)» sería ambiguo.
create or replace function agora.vigia_evento(it uuid, version int, ref text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i agora.item;
  k text;
  n int;
begin
  if not agora_priv.soy_vigia() and not agora_priv.llama_la_base() then raise exception 'solo el vigía calendariza' using errcode = 'AG403'; end if;
  select * into i from agora.item where id = it;
  if not found then raise exception 'no existe' using errcode = 'AG404'; end if;
  k := 'item:' || it || ':fecha:v' || version;
  insert into agora.item_evento (org_id, item_id, version_fecha, clave, evento_ref) values (i.org_id, it, version, k, ref) on conflict (clave) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('clave', k, 'nuevo', n = 1);
end $$;

drop function if exists agora.vigia_recordatorio(uuid, text, timestamptz, text);
create or replace function agora.vigia_recordatorio(it uuid, p_tipo text, p_cuando timestamptz, p_clave text) returns boolean language plpgsql security definer set search_path = '' as $$
declare o uuid; n int;
begin
  if not agora_priv.soy_vigia() and not agora_priv.llama_la_base() then raise exception 'solo el vigía programa recordatorios' using errcode = 'AG403'; end if;
  select i.org_id into o from agora.item i where i.id = it;
  insert into agora.recordatorio (org_id, item_id, tipo, cuando, clave) values (o, it, p_tipo, p_cuando, p_clave) on conflict (clave) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

/** Al pasar a «Listo», sus recordatorios se cancelan (el cierre del ciclo de la fecha). */
create or replace function agora_priv.cierra_ciclo_fecha() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'done' and old.estado <> 'done' then
    update agora.recordatorio set estado = 'cancelado' where item_id = new.id and estado = 'programado';
  end if;
  if new.version_fecha <> old.version_fecha then
    update agora.recordatorio set estado = 'cancelado' where item_id = new.id and estado = 'programado' and clave not like '%:v' || new.version_fecha || ':%';
  end if;
  return null;
end $$;
drop trigger if exists tg_cierra_ciclo_fecha on agora.item;
create trigger tg_cierra_ciclo_fecha after update on agora.item for each row execute function agora_priv.cierra_ciclo_fecha();

drop function if exists agora.vigia_aviso(uuid, text, text, text, uuid, uuid, uuid, text, boolean);
create or replace function agora.vigia_aviso(o uuid, p_clave text, p_tipo text, p_rol text, p_nodo uuid, p_item uuid, p_agente uuid, p_texto text, al_hilo boolean) returns boolean language plpgsql security definer set search_path = '' as $$
declare n int; canal uuid;
begin
  if not agora_priv.soy_vigia() and not agora_priv.llama_la_base() then raise exception 'solo el vigía avisa' using errcode = 'AG403'; end if;
  insert into agora.aviso (org_id, clave, tipo, para_rol, nodo_id, item_id, agente_id, texto) values (o, p_clave, p_tipo, p_rol, p_nodo, p_item, p_agente, p_texto) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 1 and al_hilo and p_nodo is not null then
    select c.id into canal from agora.canal c where c.categoria_id = p_nodo;
    if canal is not null then
      insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_agente, cuerpo, item_id, clave) values (o, canal, 'agente', agora_priv.agente_de_tarea(), p_texto, p_item, 'vigia:' || p_clave)
      on conflict do nothing;
    end if;
  end if;
  return n = 1;
end $$;

revoke execute on function agora.vigia_evento(uuid, int, text), agora.vigia_recordatorio(uuid, text, timestamptz, text),
  agora.vigia_aviso(uuid, text, text, text, uuid, uuid, uuid, text, boolean), agora_priv.soy_vigia() from public;
grant execute on function agora.vigia_evento(uuid, int, text), agora.vigia_recordatorio(uuid, text, timestamptz, text),
  agora.vigia_aviso(uuid, text, text, text, uuid, uuid, uuid, text, boolean), agora_priv.soy_vigia() to agora_agente;
grant select on agora.item_evento, agora.aviso, agora.periodo, agora.a2a_llamada to agora_agente;
drop policy if exists a_item_evento on agora.item_evento;
create policy a_item_evento on agora.item_evento for select to agora_agente using (org_id = agora_priv.org_de_agente());
drop policy if exists a_aviso on agora.aviso;
create policy a_aviso on agora.aviso for select to agora_agente using (org_id = agora_priv.org_de_agente() and agora_priv.soy_interno());
drop policy if exists a_periodo on agora.periodo;
create policy a_periodo on agora.periodo for select to agora_agente using (org_id = agora_priv.org_de_agente() and agora_priv.soy_interno());
drop policy if exists a_llamada on agora.a2a_llamada;
create policy a_llamada on agora.a2a_llamada for select to agora_agente using (org_id = agora_priv.org_de_agente() and agora_priv.soy_vigia());

-- --- La capa semántica: modelos (una vista por modelo, con sus medidas y dimensiones) -------------------------------
-- Las métricas NO se calculan en la pantalla: se compilan sobre estos modelos (tools/agora/src/metricas.ts) y la
-- prueba exige que cada cifra coincida al centavo con el libro (v_centro_periodo) y con las filas que la originan.
create or replace view agora.sem_libro with (security_invoker = true) as
  select v.org_id, v.periodo, c.id categoria_id, c.nombre categoria, d.nombre dominio, w.id workspace_id, w.nombre workspace,
         v.presupuesto_mxn, v.comprometido_mxn, v.ejercido_mxn, v.disponible_mxn, v.gasto_modelo_mxn, v.filas_sin_costo, v.pendiente_mxn,
         (v.comprometido_mxn + v.ejercido_mxn - v.presupuesto_mxn) desviacion_mxn
    from agora.v_centro_periodo v join agora.nodo c on c.id = v.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;

create or replace view agora.sem_items with (security_invoker = true) as
  select i.org_id, i.id item_id, c.nombre categoria, d.nombre dominio, w.id workspace_id, w.nombre workspace, i.estado, i.fin, i.fecha_real,
         (i.estado = 'done') cerrado, (i.estado = 'done' and i.fecha_real <= i.fin) a_tiempo, (i.estado <> 'done' and i.fin < (now() at time zone 'America/Mexico_City')::date) vencido
    from agora.item i join agora.nodo c on c.id = i.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;

create or replace view agora.sem_propuestas with (security_invoker = true) as
  select p.org_id, p.id propuesta_id, coalesce(a.nombre, 'persona') agente, coalesce(a.origen, 'humano') origen, p.clase, p.nivel, p.estado, c.nombre categoria, d.nombre dominio, w.id workspace_id, w.nombre workspace,
         p.estado in ('aprobada', 'aplicada', 'rechazada', 'a_revision') or (p.nivel = 'A2' and p.estado = 'aplicada') decidida,
         p.estado in ('aprobada', 'aplicada') aceptada, p.estado = 'a_revision' devuelta, (p.nivel in ('A2', 'A3') and p.estado = 'aplicada') autonoma,
         extract(epoch from (p.decidida_en - p.creada_en)) / 3600 horas_a_decision, to_char(p.creada_en at time zone 'America/Mexico_City', 'YYYY-MM') periodo
    from agora.propuesta p left join agora.agente a on a.id = p.autor_agente join agora.nodo c on c.id = p.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;

create or replace view agora.sem_gasto with (security_invoker = true) as
  select g.org_id, g.periodo, a.nombre agente, a.origen, c.nombre categoria, w.id workspace_id, w.nombre workspace, g.costo_usd, g.costo_mxn, (g.costo_mxn is null) sin_costo
    from agora.gasto_modelo g join agora.agente a on a.id = g.agente_id join agora.nodo c on c.id = g.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;

create or replace view agora.sem_puerta with (security_invoker = true) as
  select l.org_id, coalesce(a.nombre, '(desconocido)') agente, l.resultado, l.motivo, to_char(l.cuando at time zone 'America/Mexico_City', 'YYYY-MM') periodo,
         (l.resultado = 'admitida' and exists (select 1 from agora.revocacion r where r.agente_id = l.agente_id and r.accion = 'revocar' and r.cuando < l.cuando)) tras_revocar
    from agora.a2a_llamada l left join agora.agente a on a.id = l.agente_id;

create or replace view agora.sem_suspensiones with (security_invoker = true) as
  select r.org_id, a.nombre agente, r.accion, r.motivo, (r.quien_agente is not null) por_vigia, to_char(r.cuando at time zone 'America/Mexico_City', 'YYYY-MM') periodo
    from agora.revocacion r join agora.agente a on a.id = r.agente_id;

grant select on agora.sem_libro, agora.sem_items, agora.sem_propuestas, agora.sem_gasto, agora.sem_puerta, agora.sem_suspensiones to authenticated;

-- Las versiones del tablero de métricas (la especificación; deshacer es volver a una anterior). Solo se agregan.
-- «A tiempo» se mide contra la fecha real: un ítem cerrado sin ella se saldría de la cuenta sin que nadie lo vea.
alter table agora.item drop constraint if exists item_cerrado_con_fecha;
alter table agora.item add constraint item_cerrado_con_fecha check (estado <> 'done' or fecha_real is not null);

create table if not exists agora.metricas_tablero (
  id      bigserial primary key,
  org_id  uuid not null references agora.org (id) on delete cascade,
  version int not null,
  spec    jsonb not null,
  quien   uuid not null default agora_priv.uid(),
  motivo  text not null,
  cuando  timestamptz not null default now(),
  unique (org_id, version)
);
alter table agora.metricas_tablero enable row level security;
alter table agora.metricas_tablero force row level security;
drop policy if exists p_metricas on agora.metricas_tablero;
create policy p_metricas on agora.metricas_tablero for select to authenticated using (agora_priv.es_de_org(org_id));
drop policy if exists p_metricas_guarda on agora.metricas_tablero;
create policy p_metricas_guarda on agora.metricas_tablero for insert to authenticated with check (agora_priv.es_de_org(org_id) and quien = agora_priv.uid());
grant select, insert on agora.metricas_tablero to authenticated;
grant usage on sequence agora.metricas_tablero_id_seq to authenticated;
drop trigger if exists tg_metricas_solo_agregar on agora.metricas_tablero;
create trigger tg_metricas_solo_agregar before update or delete on agora.metricas_tablero for each row when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

/** Los meses ya vencidos que tuvieron movimiento en el libro y siguen abiertos (para el calendario de cierre del vigía). */
create or replace function agora.vigia_periodos_abiertos() returns setof text language sql stable security definer set search_path = '' as $$
  select distinct v.periodo from agora.v_centro_periodo v
   where v.org_id = agora_priv.org_de_agente() and agora_priv.soy_vigia()
     and v.periodo < to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')
     and not agora_priv.periodo_cerrado(v.org_id, v.periodo)
   order by 1
$$;
revoke execute on function agora.vigia_periodos_abiertos() from public;
grant execute on function agora.vigia_periodos_abiertos() to agora_agente;
