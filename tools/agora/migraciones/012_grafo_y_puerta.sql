-- =============================================================================
-- Ágora · 012 · el grafo del coordinador (puntos de control del interrupt) y lo que la Puerta y las métricas leen:
-- el gasto del socio en su lectura sin caché y las llamadas admitidas DESPUÉS de revocar (la meta es cero). Idempotente.
-- =============================================================================
set check_function_bodies = off;

-- Un punto de control por paso del grafo: thread_id = categoria:<id>:hilo:<mensaje>. Al reanudar NO se confía en el
-- dato de reanudación: el nodo relee en la base la aprobación de su propuesta.
create table if not exists agora.grafo_punto (
  id           bigserial primary key,
  org_id       uuid not null references agora.org (id) on delete cascade,
  thread_id    text not null,
  paso         int not null,
  nodo         text not null check (nodo in ('ingesta', 'enrutador', 'coordinador', 'supervisor', 'politica', 'aprobacion', 'aplicar', 'bitacora', 'fin')),
  estado       jsonb not null default '{}',
  propuesta_id uuid references agora.propuesta (id),
  agente_id    uuid references agora.agente (id),
  creado_en    timestamptz not null default now(),
  unique (thread_id, paso)
);
-- El estado del grafo es de SU agente y de su organización: otro agente (interno, o de otra organización con los mismos
-- ids) no ocupa los pasos del coordinador (2026-10-28, tercera pasada del verificador: secuestraba el hilo, o hacía
-- que el coordinador perdiera su estado y cobrara el modelo dos veces).
alter table agora.grafo_punto drop constraint if exists grafo_punto_thread_id_paso_key;
create unique index if not exists grafo_punto_dueno on agora.grafo_punto (org_id, agente_id, thread_id, paso);
alter table agora.grafo_punto enable row level security;
alter table agora.grafo_punto force row level security;
drop policy if exists p_grafo on agora.grafo_punto;
create policy p_grafo on agora.grafo_punto for select to authenticated using (agora_priv.es_de_org(org_id));
drop policy if exists a_grafo on agora.grafo_punto;
create policy a_grafo on agora.grafo_punto for select to agora_agente using (org_id = agora_priv.org_de_agente() and agora_priv.soy_interno());
drop policy if exists a_grafo_escribe on agora.grafo_punto;
create policy a_grafo_escribe on agora.grafo_punto for insert to agora_agente with check (org_id = agora_priv.org_de_agente() and agora_priv.soy_interno() and agente_id = agora_priv.agente_de_tarea());
grant select on agora.grafo_punto to authenticated, agora_agente;
grant insert on agora.grafo_punto to agora_agente;
grant usage on sequence agora.grafo_punto_id_seq to agora_agente;
drop trigger if exists tg_grafo_solo_agregar on agora.grafo_punto;
create trigger tg_grafo_solo_agregar before update or delete on agora.grafo_punto for each row when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

-- La Puerta también lee el gasto del socio (al 100 %, 429): un solo dato, el del libro.
create or replace function agora.puerta_gasto(aid uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a agora.agente;
begin
  if agora_priv.rol_que_llama() <> 'agora_puerta' and not agora_priv.llama_la_base() then raise exception 'solo la Puerta' using errcode = 'AG403'; end if;
  select * into a from agora.agente where id = aid;
  if not found then return null; end if;
  return jsonb_build_object('uso', agora_priv.uso_gasto_mes(a.id), 'tope', a.tope_gasto_mes_mxn, 'reintenta', agora_priv.reintenta_en(a.id, 'gasto'),
                            'org', agora_priv.gasto_org_mes(a.org_id), 'tope_org', (select c.tope_gasto_org_mxn from agora.org_config c where c.org_id = a.org_id));
end $$;
revoke execute on function agora.puerta_gasto(uuid) from public;
grant execute on function agora.puerta_gasto(uuid) to agora_puerta;

-- Las llamadas ADMITIDAS después del eslabón de revocación de su agente. La meta es cero.
create or replace view agora.v_llamadas_tras_revocar with (security_invoker = true) as
  select r.org_id, r.agente_id, r.cuando revocado_en, count(l.id)::int llamadas
    from agora.revocacion r left join agora.a2a_llamada l on l.agente_id = r.agente_id and l.resultado = 'admitida' and l.cuando > r.cuando
   where r.accion = 'revocar' group by r.org_id, r.agente_id, r.cuando;

/** La tarea A2A de una llamada admitida (idempotente por agente y messageId: un reintento devuelve la misma). */
drop function if exists agora.puerta_registra_tarea(uuid, text, text, text);
create or replace function agora.puerta_registra_tarea(aid uuid, contexto text, mensaje text, nuevo_estado text) returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if agora_priv.rol_que_llama() <> 'agora_puerta' and not agora_priv.llama_la_base() then raise exception 'solo la Puerta' using errcode = 'AG403'; end if;
  insert into agora.a2a_tarea (org_id, agente_id, context_id, message_id, estado)
  select a.org_id, a.id, contexto, mensaje, nuevo_estado from agora.agente a where a.id = aid
  on conflict (agente_id, message_id) do nothing returning id into t;
  if t is null then select x.id into t from agora.a2a_tarea x where x.agente_id = aid and x.message_id = mensaje; end if;
  return t;
end $$;
revoke execute on function agora.puerta_registra_tarea(uuid, text, text, text) from public;
grant execute on function agora.puerta_registra_tarea(uuid, text, text, text) to agora_puerta;

-- Un agente ve SUS tareas A2A (GetTask y ListTasks cerrados: nunca las de otro).
drop policy if exists a_tarea on agora.a2a_tarea;
create policy a_tarea on agora.a2a_tarea for select to agora_agente using (agente_id = agora_priv.agente_de_tarea());
grant select on agora.a2a_tarea to agora_agente;

-- Lo creado después de 009 no hereda su `grant select on all tables`: se dice aquí.
grant select on agora.v_llamadas_tras_revocar to authenticated;
