-- =============================================================================
-- sala-a2a · propuesta de esquema (alineada con SPEC-sala-a2a r2, hermes-os-a2a@e122f54)
--
-- NO se aplica a ninguna base: se prueba en un Postgres efímero (PGlite) y se tira. Idempotente.
--
-- Diferencias con la spec de origen, por el stack de este monorepo:
--   · No hay `organizaciones` ni `app.tenant_actual()`: el tenant es un uuid que pone el producto
--     que usa la sala, y quién participa lo dice `sala_participante` (lo puebla ese producto).
--   · El humano que firma es `auth.uid()` (decisión 5 de la spec, D4 del producto).
--   · El agente escribe con su propio rol, `sala_agente` (nobypassrls), acotado al tenant de su
--     tarea por `sala.tenant`.
--
-- EL INVARIANTE: ningún componente que ejecuta un modelo puede fabricar una aprobación. Dos
-- cierres independientes, y hacen falta los dos:
--   1. la política `aprobacion_solo_humana` es RESTRICTIVA: `decidida_por = auth.uid()` (un
--      humano legítimo no firma por otro);
--   2. ningún rol de servicio ni de agente tiene INSERT sobre `sala_aprobaciones` (se revoca
--      explícitamente a `service_role`, que en Supabase recibe todo por defecto y tiene bypassrls).
-- =============================================================================

create schema if not exists sala_priv;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'sala_agente') then
    create role sala_agente nologin nobypassrls;
  end if;
end $$;

create table if not exists public.sala_participante (
  tenant_id  uuid not null,
  usuario_id uuid not null,
  rol        text not null default 'miembro' check (rol in ('miembro', 'moderador', 'solo_lectura')),
  primary key (tenant_id, usuario_id)
);

create or replace function sala_priv.es_participante(t uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sala_participante p where p.tenant_id = t and p.usuario_id = auth.uid())
$$;

create or replace function sala_priv.tenant_de_tarea() returns uuid language sql stable set search_path = '' as $$
  select case when current_setting('sala.tenant', true) ~* '^[0-9a-f-]{36}$' then current_setting('sala.tenant', true)::uuid end
$$;

create table if not exists public.sala_canales (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  slug         text not null,
  nombre       text not null,
  tipo         text not null check (tipo in ('publico', 'privado', 'dm', 'departamento')),
  departamento text,
  archivado_en timestamptz,
  creado_en    timestamptz not null default now(),
  unique (tenant_id, slug),
  constraint depto_solo_en_canal_depto check ((tipo = 'departamento') = (departamento is not null))
);

create table if not exists public.sala_miembros (
  canal_id       uuid not null references public.sala_canales (id) on delete cascade,
  tenant_id      uuid not null,
  principal_tipo text not null check (principal_tipo in ('humano', 'agente')),
  usuario_id     uuid,
  agente_slug    text,
  principal_ref  text generated always as (coalesce(usuario_id::text, agente_slug)) stored,
  rol            text not null default 'miembro' check (rol in ('miembro', 'moderador', 'solo_lectura')),
  agregado_en    timestamptz not null default now(),
  constraint un_solo_principal check (
    (principal_tipo = 'humano' and usuario_id is not null and agente_slug is null) or
    (principal_tipo = 'agente' and agente_slug is not null and usuario_id is null)),
  primary key (canal_id, principal_tipo, principal_ref)
);

create table if not exists public.sala_mensajes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  canal_id      uuid not null references public.sala_canales (id) on delete cascade,
  hilo_id       uuid references public.sala_mensajes (id) on delete cascade,
  autor_tipo    text not null check (autor_tipo in ('humano', 'agente', 'sistema')),
  autor_usuario uuid,
  autor_agente  text,
  departamento  text,
  task_id       text,
  cuerpo        text not null,
  bloques       jsonb not null default '[]'::jsonb,
  origen        text not null default 'sala' check (origen in ('sala', 'espejo_slack', 'espejo_telegram', 'espejo_correo', 'chat_hil')),
  editado_en    timestamptz,
  creado_en     timestamptz not null default now(),
  constraint autor_coherente check (
    (autor_tipo = 'humano' and autor_usuario is not null and autor_agente is null) or
    (autor_tipo = 'agente' and autor_agente is not null and autor_usuario is null) or
    (autor_tipo = 'sistema' and autor_usuario is null and autor_agente is null)),
  constraint depto_solo_de_agente check (departamento is null or autor_tipo in ('agente', 'sistema'))
);

create index if not exists ix_sala_mensajes_canal on public.sala_mensajes (canal_id, creado_en desc);
create index if not exists ix_sala_mensajes_hilo on public.sala_mensajes (hilo_id, creado_en) where hilo_id is not null;
create index if not exists ix_sala_mensajes_task on public.sala_mensajes (task_id) where task_id is not null;

create table if not exists public.sala_reacciones (
  mensaje_id uuid not null references public.sala_mensajes (id) on delete cascade,
  tenant_id  uuid not null,
  usuario_id uuid not null,
  emoji      text not null,
  primary key (mensaje_id, usuario_id, emoji)
);

create table if not exists public.sala_lecturas (
  canal_id     uuid not null references public.sala_canales (id) on delete cascade,
  tenant_id    uuid not null,
  usuario_id   uuid not null,
  ultimo_leido timestamptz not null default now(),
  primary key (canal_id, usuario_id)
);

create table if not exists public.sala_aprobaciones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  mensaje_id       uuid not null references public.sala_mensajes (id) on delete cascade,
  accion           text not null check (accion in ('aprobar', 'rechazar', 'a_revision')),
  task_id          text,
  sha256_artefacto text check (sha256_artefacto is null or sha256_artefacto ~ '^[0-9a-f]{64}$'),
  decidida_por     uuid not null,
  decidida_en      timestamptz not null default now(),
  unique (mensaje_id, decidida_por)
);

-- Hilos de un solo nivel: lo impone un disparador, no la confianza.
create or replace function sala_priv.hilo_un_nivel() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.hilo_id is not null and exists (select 1 from public.sala_mensajes m where m.id = new.hilo_id and m.hilo_id is not null) then
    raise exception 'los hilos son de un solo nivel';
  end if;
  return new;
end $$;
drop trigger if exists tg_sala_hilo_un_nivel on public.sala_mensajes;
create trigger tg_sala_hilo_un_nivel before insert or update of hilo_id on public.sala_mensajes
  for each row execute function sala_priv.hilo_un_nivel();

-- --- RLS ---------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sala_participante', 'sala_canales', 'sala_miembros', 'sala_mensajes', 'sala_reacciones', 'sala_lecturas', 'sala_aprobaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
  foreach t in array array['sala_canales', 'sala_miembros', 'sala_reacciones', 'sala_lecturas'] loop
    execute format('drop policy if exists %I on public.%I', 'tenant_' || t, t);
    execute format('create policy %I on public.%I for all to authenticated using (sala_priv.es_participante(tenant_id)) with check (sala_priv.es_participante(tenant_id))', 'tenant_' || t, t);
  end loop;
end $$;

drop policy if exists sala_participante_lee on public.sala_participante;
create policy sala_participante_lee on public.sala_participante for select to authenticated
  using (sala_priv.es_participante(tenant_id));

-- Mensajes: un humano lee los de su tenant y escribe solo como sí mismo.
drop policy if exists tenant_sala_mensajes on public.sala_mensajes;
create policy tenant_sala_mensajes on public.sala_mensajes for select to authenticated
  using (sala_priv.es_participante(tenant_id));
drop policy if exists sala_mensaje_humano on public.sala_mensajes;
create policy sala_mensaje_humano on public.sala_mensajes for insert to authenticated
  with check (sala_priv.es_participante(tenant_id) and autor_tipo = 'humano' and autor_usuario = auth.uid());

-- Aprobaciones: se leen en el tenant; se escriben en el tenant (permisiva) Y firmadas por quien
-- tiene la sesión (restrictiva). Las permisivas se combinan con O; las restrictivas, con Y.
drop policy if exists tenant_sala_aprobaciones on public.sala_aprobaciones;
create policy tenant_sala_aprobaciones on public.sala_aprobaciones for select to authenticated
  using (sala_priv.es_participante(tenant_id));
drop policy if exists sala_aprobacion_en_tenant on public.sala_aprobaciones;
create policy sala_aprobacion_en_tenant on public.sala_aprobaciones for insert to authenticated
  with check (sala_priv.es_participante(tenant_id));
drop policy if exists aprobacion_solo_humana on public.sala_aprobaciones;
create policy aprobacion_solo_humana on public.sala_aprobaciones
  as restrictive
  for insert to authenticated
  with check (decidida_por = auth.uid());

-- Una aprobación decide SOBRE UN MENSAJE: el de su tenant, su tarea y la huella de su plan. Sin esto, un
-- humano de B aprobaba el plan de A poniendo su propio `tenant_id` y el `mensaje_id` de A, y la versión en
-- memoria sí lo impedía (PRP-010 H-06). Lee el mensaje como dueño: quien aprueba en B no ve el de A.
create or replace function sala_priv.aprobacion_del_mensaje() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m_tenant uuid;
  m_task   text;
  huellas  text[];
begin
  select m.tenant_id, m.task_id, array(select b->>'sha256' from jsonb_array_elements(m.bloques) b where b ? 'sha256')
    into m_tenant, m_task, huellas
    from public.sala_mensajes m where m.id = new.mensaje_id;
  if not found or m_tenant <> new.tenant_id then
    raise exception 'la aprobación no es del tenant de su mensaje';
  end if;
  if new.task_id is distinct from m_task then
    raise exception 'la aprobación no es de la tarea de su mensaje';
  end if;
  if cardinality(huellas) > 0 and (new.sha256_artefacto is null or not new.sha256_artefacto = any (huellas)) then
    raise exception 'la huella aprobada no es la del plan del mensaje';
  end if;
  return new;
end $$;
drop trigger if exists tg_sala_aprobacion_del_mensaje on public.sala_aprobaciones;
create trigger tg_sala_aprobacion_del_mensaje before insert on public.sala_aprobaciones
  for each row execute function sala_priv.aprobacion_del_mensaje();

-- El agente: lee canales y mensajes del tenant de su tarea y publica como agente o sistema.
drop policy if exists sala_agente_lee_canales on public.sala_canales;
create policy sala_agente_lee_canales on public.sala_canales for select to sala_agente
  using (tenant_id = sala_priv.tenant_de_tarea());
drop policy if exists sala_agente_lee on public.sala_mensajes;
create policy sala_agente_lee on public.sala_mensajes for select to sala_agente
  using (tenant_id = sala_priv.tenant_de_tarea());
drop policy if exists sala_agente_publica on public.sala_mensajes;
create policy sala_agente_publica on public.sala_mensajes for insert to sala_agente
  with check (tenant_id = sala_priv.tenant_de_tarea() and autor_tipo in ('agente', 'sistema'));

-- --- Privilegios -----------------------------------------------------------------------------------
grant usage on schema sala_priv to authenticated, sala_agente;
grant execute on all functions in schema sala_priv to authenticated, sala_agente;
grant usage on schema public to sala_agente;
grant select, insert on public.sala_canales, public.sala_miembros, public.sala_mensajes, public.sala_reacciones,
  public.sala_lecturas, public.sala_aprobaciones, public.sala_participante to authenticated;
grant update (ultimo_leido) on public.sala_lecturas to authenticated;
grant select on public.sala_canales, public.sala_mensajes to sala_agente;
grant insert on public.sala_mensajes to sala_agente;
-- El segundo cierre del invariante, explícito: nadie que no sea una persona escribe aprobaciones.
revoke insert, update, delete on public.sala_aprobaciones from sala_agente;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke insert, update, delete on public.sala_aprobaciones from service_role';
  end if;
end $$;
revoke update, delete on public.sala_aprobaciones from authenticated;
