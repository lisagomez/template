-- =============================================================================
-- Soporte SAP · propuesta de esquema
--
-- NO se aplica a ninguna base. Se valida en un Postgres EFÍMERO (PGlite, en proceso) con un
-- Supabase mínimo imitado (pruebas/esquema.ts y pruebas/aislamiento.ts) y se tira. Idempotente:
-- la prueba lo aplica dos veces.
--
-- Tenencia en árbol: laboratorio → consultora → cliente. Toda tabla de datos lleva
-- consultora_id (y cliente_id cuando el dato es de un cliente), RLS con `force`, políticas para
-- `authenticated` (las personas) y para `soporte_sap_agente` (el agente, acotado a la consultora
-- de su tarea por la variable `ss.consultora`). Ninguna superficie usa service_role (C7).
-- Las funciones de apoyo viven en `ss_priv`, un esquema que la API no expone.
-- =============================================================================

create schema if not exists ss_priv;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'soporte_sap_agente') then
    create role soporte_sap_agente nologin nobypassrls;
  end if;
end $$;

-- --- Organizaciones y membresía ----------------------------------------------------------

create table if not exists public.ss_organizacion (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('laboratorio', 'consultora', 'cliente')),
  nombre     text not null,
  padre_id   uuid references public.ss_organizacion (id) on delete restrict,
  creada_en  timestamptz not null default now(),
  constraint ss_org_arbol check ((tipo = 'laboratorio') = (padre_id is null))
);

create table if not exists public.ss_miembro (
  organizacion_id uuid not null references public.ss_organizacion (id) on delete cascade,
  usuario_id      uuid not null,
  rol             text not null check (rol in ('superadmin', 'experto', 'consultor', 'usuario_cliente')),
  primary key (organizacion_id, usuario_id)
);

create or replace function ss_priv.valida_arbol() returns trigger language plpgsql set search_path = '' as $$
declare tipo_padre text;
begin
  if new.padre_id is null then return new; end if;
  select o.tipo into tipo_padre from public.ss_organizacion o where o.id = new.padre_id;
  if (new.tipo = 'consultora' and tipo_padre is distinct from 'laboratorio')
     or (new.tipo = 'cliente' and tipo_padre is distinct from 'consultora') then
    raise exception 'árbol inválido: % no cuelga de %', new.tipo, coalesce(tipo_padre, 'nada');
  end if;
  return new;
end $$;
drop trigger if exists ss_org_valida_arbol on public.ss_organizacion;
create trigger ss_org_valida_arbol before insert or update on public.ss_organizacion
  for each row execute function ss_priv.valida_arbol();

create or replace function ss_priv.valida_rol() returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  select o.tipo into t from public.ss_organizacion o where o.id = new.organizacion_id;
  if (new.rol in ('superadmin', 'experto') and t <> 'laboratorio')
     or (new.rol = 'consultor' and t <> 'consultora')
     or (new.rol = 'usuario_cliente' and t <> 'cliente') then
    raise exception 'el rol % no existe en una organización de tipo %', new.rol, t;
  end if;
  return new;
end $$;
drop trigger if exists ss_miembro_valida_rol on public.ss_miembro;
create trigger ss_miembro_valida_rol before insert or update on public.ss_miembro
  for each row execute function ss_priv.valida_rol();

-- --- Funciones de visibilidad (security definer: leen membresía sin recursión de RLS) ------

create or replace function ss_priv.uuid_o_nulo(t text) returns uuid language sql immutable set search_path = '' as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end
$$;

create or replace function ss_priv.es_laboratorio() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
                 where m.usuario_id = auth.uid() and o.tipo = 'laboratorio')
$$;

create or replace function ss_priv.rol_en(org uuid) returns text language sql stable security definer set search_path = '' as $$
  select m.rol from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = org
$$;

create or replace function ss_priv.ve_consultora(c uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select ss_priv.es_laboratorio()
      or exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = c)
$$;

-- Un cliente lo ven: sus usuarios, los consultores de SU consultora y el laboratorio.
create or replace function ss_priv.ve_cliente(cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select ss_priv.es_laboratorio()
      or exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = cli)
      or exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.padre_id = m.organizacion_id
                 where m.usuario_id = auth.uid() and o.id = cli and o.tipo = 'cliente')
$$;

-- El agente trabaja una consultora por tarea: la que fija `ss.consultora`. Sin ella, nada.
create or replace function ss_priv.consultora_de_tarea() returns uuid language sql stable set search_path = '' as $$
  select ss_priv.uuid_o_nulo(current_setting('ss.consultora', true))
$$;

create or replace function ss_priv.solo_agregar() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% es de solo agregar: no se cambia ni se borra', tg_table_name;
end $$;

-- --- Incidencias, eventos y adjuntos ------------------------------------------------------

create table if not exists public.ss_incidencia (
  id                   uuid primary key default gen_random_uuid(),
  consultora_id        uuid not null references public.ss_organizacion (id),
  cliente_id           uuid not null references public.ss_organizacion (id),
  titulo               text not null,
  descripcion          text not null default '',
  sistema              text,
  modulo               text,
  componente           text,
  transaccion          text,
  mensaje_error        text,
  categoria            text,
  impacto              smallint check (impacto between 1 and 3),
  urgencia             smallint check (urgencia between 1 and 3),
  prioridad            text check (prioridad in ('P1', 'P2', 'P3', 'P4')),
  complejidad          text check (complejidad in ('baja', 'media', 'alta')),
  estado               text not null default 'nueva'
                       check (estado in ('nueva', 'en_atencion', 'espera_cliente', 'en_revision', 'resuelta', 'cerrada', 'cuarentena')),
  zona_origen          text not null default 'America/Mexico_City',
  origen               jsonb not null default '{}'::jsonb,
  creada_en            timestamptz not null default now(),
  primera_respuesta_en timestamptz,
  resuelta_en          timestamptz,
  cerrada_en           timestamptz
);

create or replace function ss_priv.cliente_de_su_consultora() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.ss_organizacion o
                 where o.id = new.cliente_id and o.tipo = 'cliente' and o.padre_id = new.consultora_id) then
    raise exception 'el cliente % no es de la consultora %', new.cliente_id, new.consultora_id;
  end if;
  return new;
end $$;
drop trigger if exists ss_incidencia_tenencia on public.ss_incidencia;
create trigger ss_incidencia_tenencia before insert or update on public.ss_incidencia
  for each row execute function ss_priv.cliente_de_su_consultora();

create table if not exists public.ss_evento (
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  seq           integer not null check (seq >= 1),
  tipo          text not null,
  datos         jsonb not null default '{}'::jsonb,
  actor         text not null,
  fecha         timestamptz not null,
  anterior      text not null,
  hash          text not null,
  primary key (incidencia_id, seq)
);
drop trigger if exists ss_evento_solo_agregar on public.ss_evento;
create trigger ss_evento_solo_agregar before update or delete on public.ss_evento
  for each row execute function ss_priv.solo_agregar();

create table if not exists public.ss_adjunto (
  id            uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ruta          text not null,
  tipo_mime     text not null,
  bytes         integer not null check (bytes > 0),
  via           text not null check (via in ('capa0', 'xml', 'ocr_local', 'sin_extraccion')),
  creado_en     timestamptz not null default now(),
  unique (incidencia_id, sha256)
);

create table if not exists public.ss_campo_extraido (
  adjunto_id    uuid not null references public.ss_adjunto (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  campo         text not null,
  valor         text not null,
  evidencia     text not null,
  confianza     numeric,
  estado        text not null default 'por_revisar' check (estado in ('por_revisar', 'confirmado', 'corregido')),
  primary key (adjunto_id, campo, valor)
);

-- La cuarentena guarda el MOTIVO (tipos de señal), nunca una copia del dato sensible.
create table if not exists public.ss_cuarentena (
  incidencia_id uuid primary key references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  senales       text[] not null,
  creada_en     timestamptz not null default now()
);

-- --- Sandbox, propuestas y acceso motivado -----------------------------------------------

create table if not exists public.ss_caso_sandbox (
  id                   uuid primary key default gen_random_uuid(),
  origen_consultora_id uuid not null references public.ss_organizacion (id),
  texto                text not null,
  campos               jsonb not null default '{}'::jsonb,
  estado               text not null default 'aprendiendo' check (estado in ('aprendiendo', 'documentado', 'propuesto')),
  creado_en            timestamptz not null default now()
);

create table if not exists public.ss_propuesta (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('regla', 'caso', 'cli', 'mejora', 'mapeo', 'configuracion')),
  origen          text not null check (origen in ('sandbox', 'fde', 'autodiagnostico')),
  alcance         text not null check (alcance in ('a_medida', 'nucleo')),
  consultora_id   uuid references public.ss_organizacion (id),
  contenido       jsonb not null,
  estado          text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'rechazada')),
  propuesta_por   text not null,
  creada_en       timestamptz not null default now(),
  constraint ss_a_medida_es_de_alguien check ((alcance = 'a_medida') = (consultora_id is not null))
);

create table if not exists public.ss_acceso_motivado (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null,
  cliente_id  uuid not null references public.ss_organizacion (id),
  motivo      text not null check (length(motivo) >= 10),
  otorgado_por uuid not null,
  vence_en    timestamptz not null,
  creado_en   timestamptz not null default now()
);

-- Los ORIGINALES de un cliente: sus usuarios y su consultora; el laboratorio solo con un
-- acceso motivado vigente (D14). Ver la operación no es bajar los documentos.
create or replace function ss_priv.baja_original(cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = cli)
      or exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.padre_id = m.organizacion_id
                 where m.usuario_id = auth.uid() and o.id = cli and o.tipo = 'cliente')
      or (ss_priv.es_laboratorio() and exists (
            select 1 from public.ss_acceso_motivado a
            where a.usuario_id = auth.uid() and a.cliente_id = cli and a.vence_en > now()))
$$;

-- --- SLA, horas y presupuesto -------------------------------------------------------------

create table if not exists public.ss_contrato_sla (
  id            text not null,
  version       integer not null check (version >= 1),
  nivel         text not null check (nivel in ('N1-N2', 'N2-N3')),
  consultora_id uuid not null references public.ss_organizacion (id),
  cliente_id    uuid references public.ss_organizacion (id),
  contenido     jsonb not null,
  vigente_desde date not null,
  primary key (id, version),
  constraint ss_nivel_y_partes check ((nivel = 'N1-N2') = (cliente_id is null))
);

create table if not exists public.ss_sla_resultado (
  incidencia_id      uuid not null references public.ss_incidencia (id) on delete cascade,
  contrato_id        text not null,
  contrato_version   integer not null,
  consultora_id      uuid not null,
  cliente_id         uuid not null,
  respuesta_min      integer,
  resolucion_min     integer,
  meta_respuesta_min integer,
  meta_resolucion_min integer,
  cumple_respuesta   boolean,
  cumple_resolucion  boolean,
  calculado_en       timestamptz not null default now(),
  primary key (incidencia_id, contrato_id, contrato_version)
);

create table if not exists public.ss_horas (
  id            uuid primary key default gen_random_uuid(),
  consultora_id uuid not null,
  cliente_id    uuid not null,
  incidencia_id uuid references public.ss_incidencia (id) on delete set null,
  consultor     text not null,
  minutos       integer not null check (minutos > 0),
  fecha         date not null
);

create table if not exists public.ss_presupuesto (
  consultora_id   uuid not null references public.ss_organizacion (id),
  mes             date not null,
  tope_tokens     bigint,
  tope_paginas_ocr integer,
  primary key (consultora_id, mes)
);

-- --- Onboarding: crudo inmutable, mapeo versionado y procedencia --------------------------

create table if not exists public.ss_crudo (
  id            uuid primary key default gen_random_uuid(),
  consultora_id uuid not null references public.ss_organizacion (id),
  herramienta   text not null,
  huella        text not null check (huella ~ '^[0-9a-f]{64}$'),
  contenido     jsonb not null,
  recibido_en   timestamptz not null default now(),
  unique (consultora_id, huella)
);
drop trigger if exists ss_crudo_solo_agregar on public.ss_crudo;
create trigger ss_crudo_solo_agregar before update or delete on public.ss_crudo
  for each row execute function ss_priv.solo_agregar();

create table if not exists public.ss_mapeo (
  consultora_id uuid not null references public.ss_organizacion (id),
  herramienta   text not null,
  version       integer not null check (version >= 1),
  contenido     jsonb not null,
  estado        text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'retirado')),
  aprobado_por  uuid,
  primary key (consultora_id, herramienta, version),
  constraint ss_aprobado_tiene_quien check ((estado = 'aprobado') = (aprobado_por is not null))
);

create table if not exists public.ss_procedencia (
  consultora_id uuid not null,
  registro      text not null,
  campo         text not null,
  original      text,
  valor         text,
  regla         text not null,
  fuente        text not null,
  primary key (consultora_id, registro, campo, regla)
);

-- --- Chat del HIL: cada quien su conversación ----------------------------------------------

create table if not exists public.ss_chat_mensaje (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  autor      text not null check (autor in ('humano', 'agente')),
  contenido  text not null,
  fuentes    jsonb not null default '[]'::jsonb,
  creado_en  timestamptz not null default now()
);

-- --- RLS: enable + force en toda tabla ------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ss_organizacion', 'ss_miembro', 'ss_incidencia', 'ss_evento', 'ss_adjunto',
    'ss_campo_extraido', 'ss_cuarentena', 'ss_caso_sandbox', 'ss_propuesta', 'ss_acceso_motivado',
    'ss_contrato_sla', 'ss_sla_resultado', 'ss_horas', 'ss_presupuesto', 'ss_crudo', 'ss_mapeo',
    'ss_procedencia', 'ss_chat_mensaje'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Personas -----------------------------------------------------------------------------------

drop policy if exists ss_org_lee on public.ss_organizacion;
create policy ss_org_lee on public.ss_organizacion for select to authenticated
  using (ss_priv.es_laboratorio() or ss_priv.ve_consultora(id) or ss_priv.ve_cliente(id));

drop policy if exists ss_miembro_lee on public.ss_miembro;
create policy ss_miembro_lee on public.ss_miembro for select to authenticated
  using (usuario_id = auth.uid() or ss_priv.es_laboratorio());

-- Datos de un cliente (incidencias y todo lo que cuelga de ellas): el patrón se repite.
do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_sla_resultado', 'ss_horas'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lee', t);
    execute format('create policy %I on public.%I for select to authenticated using (ss_priv.ve_cliente(cliente_id))', t || '_lee', t);
  end loop;
end $$;

-- Altas de incidencias: el usuario del cliente o un consultor de su consultora; nunca otro.
drop policy if exists ss_incidencia_alta on public.ss_incidencia;
create policy ss_incidencia_alta on public.ss_incidencia for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' or ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_incidencia_atiende on public.ss_incidencia;
create policy ss_incidencia_atiende on public.ss_incidencia for update to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor' or ss_priv.es_laboratorio())
  with check (ss_priv.rol_en(consultora_id) = 'consultor' or ss_priv.es_laboratorio());

drop policy if exists ss_adjunto_alta on public.ss_adjunto;
create policy ss_adjunto_alta on public.ss_adjunto for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' or ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_horas_alta on public.ss_horas;
create policy ss_horas_alta on public.ss_horas for insert to authenticated
  with check (ss_priv.rol_en(consultora_id) = 'consultor');

-- Sandbox: el laboratorio todo; una consultora, lo que nació de sus incidencias; un cliente, nada.
drop policy if exists ss_sandbox_lee on public.ss_caso_sandbox;
create policy ss_sandbox_lee on public.ss_caso_sandbox for select to authenticated
  using (ss_priv.es_laboratorio() or ss_priv.rol_en(origen_consultora_id) = 'consultor');

drop policy if exists ss_propuesta_lee on public.ss_propuesta;
create policy ss_propuesta_lee on public.ss_propuesta for select to authenticated
  using (ss_priv.es_laboratorio() or (consultora_id is not null and ss_priv.rol_en(consultora_id) = 'consultor'));

drop policy if exists ss_propuesta_decide on public.ss_propuesta;
create policy ss_propuesta_decide on public.ss_propuesta for update to authenticated
  using (ss_priv.es_laboratorio()) with check (ss_priv.es_laboratorio());

drop policy if exists ss_acceso_lee on public.ss_acceso_motivado;
create policy ss_acceso_lee on public.ss_acceso_motivado for select to authenticated
  using (ss_priv.es_laboratorio());

drop policy if exists ss_acceso_otorga on public.ss_acceso_motivado;
create policy ss_acceso_otorga on public.ss_acceso_motivado for insert to authenticated
  with check (otorgado_por = auth.uid() and exists (
    select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
    where m.usuario_id = auth.uid() and m.rol = 'superadmin' and o.tipo = 'laboratorio'));

drop policy if exists ss_contrato_lee on public.ss_contrato_sla;
create policy ss_contrato_lee on public.ss_contrato_sla for select to authenticated
  using (case when cliente_id is null then ss_priv.ve_consultora(consultora_id) else ss_priv.ve_cliente(cliente_id) end);

drop policy if exists ss_presupuesto_lee on public.ss_presupuesto;
create policy ss_presupuesto_lee on public.ss_presupuesto for select to authenticated
  using (ss_priv.ve_consultora(consultora_id));

drop policy if exists ss_crudo_lee on public.ss_crudo;
create policy ss_crudo_lee on public.ss_crudo for select to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_mapeo_lee on public.ss_mapeo;
create policy ss_mapeo_lee on public.ss_mapeo for select to authenticated
  using (ss_priv.ve_consultora(consultora_id));

drop policy if exists ss_mapeo_aprueba on public.ss_mapeo;
create policy ss_mapeo_aprueba on public.ss_mapeo for update to authenticated
  using (ss_priv.es_laboratorio()) with check (ss_priv.es_laboratorio() and aprobado_por = auth.uid());

drop policy if exists ss_procedencia_lee on public.ss_procedencia;
create policy ss_procedencia_lee on public.ss_procedencia for select to authenticated
  using (ss_priv.ve_consultora(consultora_id));

drop policy if exists ss_chat_lee on public.ss_chat_mensaje;
create policy ss_chat_lee on public.ss_chat_mensaje for select to authenticated
  using (usuario_id = auth.uid());

drop policy if exists ss_chat_escribe on public.ss_chat_mensaje;
create policy ss_chat_escribe on public.ss_chat_mensaje for insert to authenticated
  with check (usuario_id = auth.uid() and autor = 'humano' and ss_priv.es_laboratorio());

-- El agente: solo la consultora de su tarea, y solo lo que su trabajo pide ---------------------

do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_sla_resultado', 'ss_horas', 'ss_crudo', 'ss_mapeo', 'ss_procedencia'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agente', t);
    execute format('create policy %I on public.%I for all to soporte_sap_agente using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea())', t || '_agente', t);
  end loop;
end $$;

drop policy if exists ss_sandbox_agente on public.ss_caso_sandbox;
create policy ss_sandbox_agente on public.ss_caso_sandbox for all to soporte_sap_agente
  using (origen_consultora_id = ss_priv.consultora_de_tarea())
  with check (origen_consultora_id = ss_priv.consultora_de_tarea());

drop policy if exists ss_propuesta_agente on public.ss_propuesta;
create policy ss_propuesta_agente on public.ss_propuesta for insert to soporte_sap_agente
  with check (estado = 'propuesta' and (consultora_id is null or consultora_id = ss_priv.consultora_de_tarea()));

drop policy if exists ss_chat_agente on public.ss_chat_mensaje;
create policy ss_chat_agente on public.ss_chat_mensaje for insert to soporte_sap_agente
  with check (autor = 'agente');

-- --- Privilegios: lo justo por rol --------------------------------------------------------------

grant usage on schema ss_priv to authenticated, soporte_sap_agente;
grant execute on all functions in schema ss_priv to authenticated, soporte_sap_agente;
grant usage on schema public to soporte_sap_agente;
grant select on public.ss_organizacion, public.ss_miembro to authenticated, soporte_sap_agente;
grant select, insert, update on public.ss_incidencia, public.ss_adjunto, public.ss_campo_extraido, public.ss_horas,
  public.ss_propuesta, public.ss_mapeo, public.ss_acceso_motivado to authenticated;
grant select on public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_contrato_sla,
  public.ss_sla_resultado, public.ss_presupuesto, public.ss_crudo, public.ss_procedencia to authenticated;
grant select, insert on public.ss_chat_mensaje to authenticated;
grant select, insert on public.ss_incidencia, public.ss_evento, public.ss_adjunto, public.ss_campo_extraido,
  public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta, public.ss_sla_resultado, public.ss_horas,
  public.ss_crudo, public.ss_mapeo, public.ss_procedencia, public.ss_chat_mensaje to soporte_sap_agente;
grant update on public.ss_incidencia, public.ss_caso_sandbox to soporte_sap_agente;
-- Solo agregar: nadie cambia ni borra eventos ni crudo (además del disparador).
revoke update, delete on public.ss_evento, public.ss_crudo from authenticated, soporte_sap_agente;

-- --- Storage: tres buckets privados, ruta por tenant y nombre por sha256 -----------------------
--   ss-originales  {consultora}/{cliente}/{incidencia}/{sha256}   (lo que sube el cliente)
--   ss-sandbox     {consultora_origen}/{caso}/{sha256}             (solo anonimizado)
--   ss-exportes    {consultora}/{fecha}-{sha256}                   (export por tenant, ERP-6)

insert into storage.buckets (id, name, public) values
  ('ss-originales', 'ss-originales', false),
  ('ss-sandbox', 'ss-sandbox', false),
  ('ss-exportes', 'ss-exportes', false)
on conflict (id) do nothing;

drop policy if exists ss_originales_lee on storage.objects;
create policy ss_originales_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-originales' and ss_priv.baja_original(ss_priv.uuid_o_nulo((storage.foldername(name))[2])));

drop policy if exists ss_originales_sube on storage.objects;
create policy ss_originales_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'ss-originales' and (
    ss_priv.rol_en(ss_priv.uuid_o_nulo((storage.foldername(name))[2])) = 'usuario_cliente'
    or ss_priv.rol_en(ss_priv.uuid_o_nulo((storage.foldername(name))[1])) = 'consultor'));

drop policy if exists ss_sandbox_lee_objetos on storage.objects;
create policy ss_sandbox_lee_objetos on storage.objects for select to authenticated
  using (bucket_id = 'ss-sandbox' and (ss_priv.es_laboratorio()
    or ss_priv.rol_en(ss_priv.uuid_o_nulo((storage.foldername(name))[1])) = 'consultor'));

drop policy if exists ss_exportes_lee on storage.objects;
create policy ss_exportes_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-exportes' and (ss_priv.rol_en(ss_priv.uuid_o_nulo((storage.foldername(name))[1])) = 'consultor'
    or exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
               where m.usuario_id = auth.uid() and m.rol = 'superadmin' and o.tipo = 'laboratorio')));
