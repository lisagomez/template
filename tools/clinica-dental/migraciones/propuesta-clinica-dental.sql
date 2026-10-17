-- PROPUESTA de esquema del portal del paciente (goal clinica-dental, 2026-10-16). NO APLICADA a ninguna base:
-- se valida en Postgres efimero (PGlite) por `pruebas/esquema.ts` y se tira. Aplicarla es una migracion con
-- datos de salud de terceros: exige AISIA (C4) firmada, aviso de privacidad vigente y gate humano.
--
-- Idempotente (se puede correr dos veces). Toda tabla con RLS y con `clinica_id`. Tres actores:
--   * el PACIENTE (authenticated, auth.uid() = usuario_id): ve y escribe solo lo suyo;
--   * el PERSONAL de una clinica (clinica_miembro): ve su clinica y nada de la otra; el dato de salud solo
--     con rol 'clinico' (horizonte: la vista del personal no se construye en este goal);
--   * el OPERADOR del portal (rol `clinica_operador`, SIN bypassrls, NO es service_role): escribe citas,
--     avisos, tokens y eventos de UNA clinica, la que fija la transaccion (`set local app.clinica`).
-- `service_role` no aparece: ninguna superficie lo usa (C7).

create extension if not exists btree_gist;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'clinica_operador') then
    create role clinica_operador nologin noinherit;
  end if;
end $$;
grant usage on schema public to clinica_operador;

create or replace function public.clinica_actual() returns text
  language sql stable set search_path = '' as $$ select nullif(current_setting('app.clinica', true), '') $$;

create table if not exists public.clinica_clinica (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,40}$'),
  nombre text not null
);

create table if not exists public.clinica_miembro (
  clinica_id text not null references public.clinica_clinica(id),
  usuario_id uuid not null,
  rol text not null check (rol in ('recepcion', 'clinico')),
  primary key (clinica_id, usuario_id)
);

create table if not exists public.clinica_paciente (
  clinica_id text not null references public.clinica_clinica(id),
  seudonimo text not null check (seudonimo ~ '^pac_[0-9a-f]{20}$'),
  usuario_id uuid not null,
  nombre text not null,
  apellido_paterno text not null,
  apellido_materno text,
  edad smallint not null check (edad between 0 and 120),
  correo text not null,
  celular text not null check (celular ~ '^\+52[0-9]{10}$'),
  empresa text,
  categorias text[] not null check (categorias <@ array['general', 'ortodoncia', 'endodoncia', 'implantologia']),
  canal_adquisicion text not null,
  telegram_chat_id bigint,
  creado timestamptz not null default now(),
  primary key (clinica_id, seudonimo),
  unique (clinica_id, usuario_id)
);

-- El dato de salud vive APARTE: retirar el consentimiento es borrar una fila, y su RLS es mas estricta.
create table if not exists public.clinica_salud (
  clinica_id text not null,
  seudonimo text not null,
  padecimiento text not null check (char_length(padecimiento) <= 500),
  consentido_en timestamptz not null,
  primary key (clinica_id, seudonimo),
  foreign key (clinica_id, seudonimo) references public.clinica_paciente(clinica_id, seudonimo) on delete cascade
);

create table if not exists public.clinica_tutor (
  clinica_id text not null,
  seudonimo text not null,
  nombre text not null,
  apellido_paterno text not null,
  parentesco text not null check (parentesco in ('madre', 'padre', 'tutor_legal')),
  correo text not null,
  celular text not null,
  primary key (clinica_id, seudonimo),
  foreign key (clinica_id, seudonimo) references public.clinica_paciente(clinica_id, seudonimo) on delete cascade
);

-- Solo se agrega: retirar es una fila nueva con otorgado = false (la prueba del consentimiento no se borra).
create table if not exists public.clinica_consentimiento (
  id bigint generated always as identity primary key,
  clinica_id text not null,
  seudonimo text not null,
  tipo text not null check (tipo in ('aviso_privacidad', 'datos_salud', 'recordatorios', 'newsletter', 'telegram', 'tutor')),
  otorgado boolean not null,
  version text not null,
  en timestamptz not null default now(),
  foreign key (clinica_id, seudonimo) references public.clinica_paciente(clinica_id, seudonimo) on delete cascade
);

create table if not exists public.clinica_cita (
  clinica_id text not null,
  id text not null check (id ~ '^cit_[0-9a-f]{20}$'),
  seudonimo text not null,
  servicio text not null,
  categoria text not null,
  sillon text not null,
  inicio timestamptz not null,
  fin timestamptz not null check (fin > inicio),
  estado text not null check (estado in ('confirmada', 'cancelada', 'reprogramada', 'atendida', 'inasistencia')),
  canales text[] not null default '{}',
  primary key (clinica_id, id),
  foreign key (clinica_id, seudonimo) references public.clinica_paciente(clinica_id, seudonimo),
  -- La ultima linea contra la doble reserva: dos citas confirmadas no se empalman en el mismo sillon.
  constraint clinica_cita_sin_doble_reserva exclude using gist (clinica_id with =, sillon with =, tstzrange(inicio, fin) with &&) where (estado = 'confirmada')
);

create table if not exists public.clinica_aviso (
  clinica_id text not null,
  id text not null check (id ~ '^avi_[0-9a-f]{20}$'),
  seudonimo text not null,
  cita_id text,
  canal text not null check (canal in ('correo', 'telegram')),
  clase text not null,
  para timestamptz not null,
  estado text not null,
  intentos smallint not null default 0,
  motivo text,
  primary key (clinica_id, id),
  foreign key (clinica_id, seudonimo) references public.clinica_paciente(clinica_id, seudonimo)
);

create table if not exists public.clinica_token (
  clinica_id text not null,
  id text primary key check (id ~ '^tok_[0-9a-f]{20}$'),
  seudonimo text not null,
  tipo text not null check (tipo in ('baja', 'telegram')),
  expira timestamptz,
  usado timestamptz
);

-- El libro: solo seudonimos y enums. Una arroba en el evento es un correo que se colo: se rechaza.
create table if not exists public.clinica_evento (
  clinica_id text not null,
  seq bigint not null check (seq > 0),
  evento jsonb not null check (evento::text !~ '@' and evento ? 'tipo' and evento ? 'sujeto'),
  anterior text not null check (anterior ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  primary key (clinica_id, seq)
);

do $$
declare t text;
begin
  foreach t in array array['clinica_clinica', 'clinica_miembro', 'clinica_paciente', 'clinica_salud', 'clinica_tutor', 'clinica_consentimiento', 'clinica_cita', 'clinica_aviso', 'clinica_token', 'clinica_evento'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

create or replace function public.clinica_es_miembro(c text, rol_minimo text default 'recepcion') returns boolean
  language sql stable set search_path = '' as $$
  select exists (select 1 from public.clinica_miembro m where m.clinica_id = c and m.usuario_id = (select auth.uid())
                 and (rol_minimo = 'recepcion' or m.rol = rol_minimo))
$$;
create or replace function public.clinica_es_mio(c text, s text) returns boolean
  language sql stable set search_path = '' as $$
  select exists (select 1 from public.clinica_paciente p where p.clinica_id = c and p.seudonimo = s and p.usuario_id = (select auth.uid()))
$$;

grant select on public.clinica_clinica to authenticated;
grant select on public.clinica_miembro to authenticated;
grant select, insert, update on public.clinica_paciente to authenticated;
grant select, insert, delete on public.clinica_salud to authenticated;
grant select, insert on public.clinica_tutor, public.clinica_consentimiento to authenticated;
grant select on public.clinica_cita, public.clinica_aviso to authenticated;
grant select, insert, update on public.clinica_cita, public.clinica_aviso, public.clinica_token to clinica_operador;
grant select on public.clinica_paciente, public.clinica_consentimiento to clinica_operador;
grant select, insert on public.clinica_evento to clinica_operador;
grant select on public.clinica_evento to authenticated;

drop policy if exists clinica_clinica_lee on public.clinica_clinica;
create policy clinica_clinica_lee on public.clinica_clinica for select to authenticated using (true);
drop policy if exists clinica_miembro_propio on public.clinica_miembro;
create policy clinica_miembro_propio on public.clinica_miembro for select to authenticated using (usuario_id = (select auth.uid()));

drop policy if exists clinica_paciente_propio on public.clinica_paciente;
create policy clinica_paciente_propio on public.clinica_paciente for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists clinica_paciente_personal on public.clinica_paciente;
create policy clinica_paciente_personal on public.clinica_paciente for select to authenticated using (public.clinica_es_miembro(clinica_id));
drop policy if exists clinica_paciente_operador on public.clinica_paciente;
create policy clinica_paciente_operador on public.clinica_paciente for select to clinica_operador using (clinica_id = public.clinica_actual());

drop policy if exists clinica_salud_propio on public.clinica_salud;
create policy clinica_salud_propio on public.clinica_salud for all to authenticated
  using (public.clinica_es_mio(clinica_id, seudonimo)) with check (public.clinica_es_mio(clinica_id, seudonimo));
drop policy if exists clinica_salud_clinico on public.clinica_salud;
create policy clinica_salud_clinico on public.clinica_salud for select to authenticated using (public.clinica_es_miembro(clinica_id, 'clinico'));

drop policy if exists clinica_tutor_propio on public.clinica_tutor;
create policy clinica_tutor_propio on public.clinica_tutor for all to authenticated
  using (public.clinica_es_mio(clinica_id, seudonimo)) with check (public.clinica_es_mio(clinica_id, seudonimo));

drop policy if exists clinica_consentimiento_propio on public.clinica_consentimiento;
create policy clinica_consentimiento_propio on public.clinica_consentimiento for select to authenticated using (public.clinica_es_mio(clinica_id, seudonimo));
drop policy if exists clinica_consentimiento_agrega on public.clinica_consentimiento;
create policy clinica_consentimiento_agrega on public.clinica_consentimiento for insert to authenticated with check (public.clinica_es_mio(clinica_id, seudonimo));
drop policy if exists clinica_consentimiento_operador on public.clinica_consentimiento;
create policy clinica_consentimiento_operador on public.clinica_consentimiento for select to clinica_operador using (clinica_id = public.clinica_actual());

drop policy if exists clinica_cita_propia on public.clinica_cita;
create policy clinica_cita_propia on public.clinica_cita for select to authenticated using (public.clinica_es_mio(clinica_id, seudonimo) or public.clinica_es_miembro(clinica_id));
drop policy if exists clinica_cita_operador on public.clinica_cita;
create policy clinica_cita_operador on public.clinica_cita for all to clinica_operador using (clinica_id = public.clinica_actual()) with check (clinica_id = public.clinica_actual());

drop policy if exists clinica_aviso_propio on public.clinica_aviso;
create policy clinica_aviso_propio on public.clinica_aviso for select to authenticated using (public.clinica_es_mio(clinica_id, seudonimo) or public.clinica_es_miembro(clinica_id));
drop policy if exists clinica_aviso_operador on public.clinica_aviso;
create policy clinica_aviso_operador on public.clinica_aviso for all to clinica_operador using (clinica_id = public.clinica_actual()) with check (clinica_id = public.clinica_actual());

drop policy if exists clinica_token_operador on public.clinica_token;
create policy clinica_token_operador on public.clinica_token for all to clinica_operador using (clinica_id = public.clinica_actual()) with check (clinica_id = public.clinica_actual());

drop policy if exists clinica_evento_personal on public.clinica_evento;
create policy clinica_evento_personal on public.clinica_evento for select to authenticated using (public.clinica_es_miembro(clinica_id));
drop policy if exists clinica_evento_operador_lee on public.clinica_evento;
create policy clinica_evento_operador_lee on public.clinica_evento for select to clinica_operador using (clinica_id = public.clinica_actual());
drop policy if exists clinica_evento_operador_agrega on public.clinica_evento;
create policy clinica_evento_operador_agrega on public.clinica_evento for insert to clinica_operador with check (clinica_id = public.clinica_actual());

revoke execute on function public.clinica_actual(), public.clinica_es_miembro(text, text), public.clinica_es_mio(text, text) from public, anon;
grant execute on function public.clinica_actual() to clinica_operador;
grant execute on function public.clinica_es_miembro(text, text), public.clinica_es_mio(text, text) to authenticated;
