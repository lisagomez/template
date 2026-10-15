-- @tu-scope/calendario · espejo, diario de la pluma y reservas — migracion 0001
--
-- ESCRITA Y SIN APLICAR. La aplica quien opera el proyecto Supabase (gate humano); la herramienta no la
-- corre nunca. Se prueba en PGlite con roles reales (`pruebas/supabase.ts`).
--
-- Diferencias deliberadas con la fuente (business-os):
--   * RLS por DUEÑO (auth.uid()) en TODAS las tablas. La fuente tenia `USING (true)` para todo
--     `authenticated`: cualquier usuario leia todos los eventos de todos.
--   * Ninguna superficie usa service_role: todo pasa por funciones SECURITY INVOKER, asi RLS aplica
--     siempre (C7). Un job de plataforma que necesite service_role se declara aparte.
--   * Clave del espejo = (dueño, cuenta, calendario, id). La fuente usaba (google_event_id, account_type):
--     dos cuentas del mismo tipo chocaban.
--   * El espejo guarda el evento ENTERO (recurrencia, invitados, vinculos), no un resumen.
--   * La doble reserva la impide la BASE: una restriccion de exclusion sobre el bloque con margenes.

create extension if not exists btree_gist;

create table if not exists public.calendario_fuente (
  dueno uuid not null default auth.uid(),
  cuenta text not null,
  id text not null,
  datos jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (dueno, cuenta, id)
);

create table if not exists public.calendario_evento (
  dueno uuid not null default auth.uid(),
  cuenta text not null,
  calendario text not null,
  id text not null,
  serie text,
  recurrente boolean not null default false,
  inicio_ms bigint not null,
  fin_ms bigint not null,
  datos jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (dueno, cuenta, calendario, id)
);
create index if not exists calendario_evento_rango on public.calendario_evento (dueno, cuenta, calendario, inicio_ms, fin_ms);
create index if not exists calendario_evento_serie on public.calendario_evento (dueno, cuenta, calendario, serie);

create table if not exists public.calendario_estado_sync (
  dueno uuid not null default auth.uid(),
  cuenta text not null,
  calendario text not null,
  datos jsonb not null,
  primary key (dueno, cuenta, calendario)
);

create table if not exists public.calendario_intencion (
  dueno uuid not null default auth.uid(),
  clave text not null,
  datos jsonb not null,
  abierta boolean not null default true,
  resultado jsonb,
  primary key (dueno, clave)
);

create table if not exists public.calendario_reserva (
  dueno uuid not null default auth.uid(),
  id text not null,
  recurso text not null,
  clave text not null,
  inicio_ms bigint not null,
  fin_ms bigint not null,
  bloque tstzrange not null,
  estado text not null check (estado in ('tentativa', 'confirmada', 'liberada')),
  expira_ms bigint,
  referencia text not null check (length(referencia) <= 200),
  evento text,
  creada_ms bigint not null,
  primary key (dueno, id),
  unique (dueno, clave),
  -- Lo que esta vigente no se solapa nunca (las tentativas vencidas se liberan antes de insertar).
  constraint calendario_reserva_sin_solape exclude using gist (dueno with =, recurso with =, bloque with &&) where (estado <> 'liberada')
);

alter table public.calendario_fuente enable row level security;
alter table public.calendario_evento enable row level security;
alter table public.calendario_estado_sync enable row level security;
alter table public.calendario_intencion enable row level security;
alter table public.calendario_reserva enable row level security;

do $$
declare t text;
begin
  foreach t in array array['calendario_fuente', 'calendario_evento', 'calendario_estado_sync', 'calendario_intencion', 'calendario_reserva'] loop
    execute format('drop policy if exists %I on public.%I', t || '_dueno', t);
    execute format('create policy %I on public.%I for all to authenticated using (dueno = auth.uid()) with check (dueno = auth.uid())', t || '_dueno', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------
-- Funciones (SECURITY INVOKER: corren con los permisos y el RLS de quien llama).

create or replace function public.calendario_calendarios() returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select datos from calendario_fuente order by cuenta, id
$$;

create or replace function public.calendario_guarda_calendarios(p jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into calendario_fuente (cuenta, id, datos)
  select c->>'cuenta', c->>'id', c from jsonb_array_elements(p) c
  on conflict (dueno, cuenta, id) do update set datos = excluded.datos, actualizado = now()
$$;

create or replace function public.calendario_eventos(p_refs jsonb, p_desde bigint, p_hasta bigint) returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select e.datos from calendario_evento e
  join jsonb_array_elements(p_refs) r on r->>'cuenta' = e.cuenta and r->>'calendario' = e.calendario
  where e.recurrente or e.serie is not null or (e.inicio_ms < p_hasta + 86400000 and e.fin_ms > p_desde - 86400000)
$$;

create or replace function public.calendario_evento_uno(p_cuenta text, p_calendario text, p_id text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select datos from calendario_evento where cuenta = p_cuenta and calendario = p_calendario and id = p_id
$$;

create or replace function public.calendario_excepciones(p_cuenta text, p_calendario text, p_serie text) returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select datos from calendario_evento where cuenta = p_cuenta and calendario = p_calendario and serie = p_serie
$$;

-- p: [{ "evento": {...}, "inicioMs": n, "finMs": n }]
create or replace function public.calendario_guarda_eventos(p jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into calendario_evento (cuenta, calendario, id, serie, recurrente, inicio_ms, fin_ms, datos)
  select x->'evento'->>'cuenta', x->'evento'->>'calendario', x->'evento'->>'id', x->'evento'->>'serie',
         jsonb_typeof(x->'evento'->'recurrencia') = 'array', (x->>'inicioMs')::bigint, (x->>'finMs')::bigint, x->'evento'
  from jsonb_array_elements(p) x
  on conflict (dueno, cuenta, calendario, id) do update
    set serie = excluded.serie, recurrente = excluded.recurrente, inicio_ms = excluded.inicio_ms,
        fin_ms = excluded.fin_ms, datos = excluded.datos, actualizado = now()
$$;

create or replace function public.calendario_borra_eventos(p_cuenta text, p_calendario text, p_ids text[]) returns void
language sql security invoker set search_path = public as $$
  delete from calendario_evento where cuenta = p_cuenta and calendario = p_calendario and id = any(p_ids)
$$;

-- Sync completa: lo que no llega se borra (solo dentro de la ventana para los sueltos, si hay ventana).
create or replace function public.calendario_reemplaza(p_cuenta text, p_calendario text, p jsonb, p_desde bigint, p_hasta bigint) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from calendario_evento e
  where e.cuenta = p_cuenta and e.calendario = p_calendario
    and not exists (select 1 from jsonb_array_elements(p) x where x->'evento'->>'id' = e.id)
    and (p_desde is null or e.recurrente or e.serie is not null or (e.inicio_ms < p_hasta and e.fin_ms > p_desde));
  perform calendario_guarda_eventos(p);
end $$;

create or replace function public.calendario_estado_sync_uno(p_cuenta text, p_calendario text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select datos from calendario_estado_sync where cuenta = p_cuenta and calendario = p_calendario
$$;

create or replace function public.calendario_guarda_estado_sync(p jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into calendario_estado_sync (cuenta, calendario, datos) values (p->>'cuenta', p->>'calendario', p)
  on conflict (dueno, cuenta, calendario) do update set datos = excluded.datos
$$;

create or replace function public.calendario_anota_intencion(p jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into calendario_intencion (clave, datos) values (p->>'clave', p)
  on conflict (dueno, clave) do update set datos = excluded.datos, abierta = true
$$;

create or replace function public.calendario_intenciones() returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select datos from calendario_intencion where abierta
$$;

create or replace function public.calendario_cierra_intencion(p_clave text, p_resultado jsonb) returns void
language sql security invoker set search_path = public as $$
  update calendario_intencion set abierta = false, resultado = coalesce(p_resultado, resultado) where clave = p_clave
$$;

create or replace function public.calendario_resultado(p_clave text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select resultado from calendario_intencion where clave = p_clave and not abierta
$$;

create or replace function public.calendario_reserva_json(r public.calendario_reserva) returns jsonb
language sql immutable security invoker set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'recurso', r.recurso, 'clave', r.clave, 'inicio', r.inicio_ms, 'fin', r.fin_ms,
    'bloqueDesde', (extract(epoch from lower(r.bloque)) * 1000)::bigint, 'bloqueHasta', (extract(epoch from upper(r.bloque)) * 1000)::bigint,
    'estado', r.estado, 'expira', r.expira_ms, 'referencia', r.referencia, 'evento', r.evento, 'creada', r.creada_ms)
$$;

create or replace function public.calendario_reservas(p_recurso text, p_desde bigint, p_hasta bigint) returns setof jsonb
language sql stable security invoker set search_path = public as $$
  select calendario_reserva_json(r) from calendario_reserva r
  where r.recurso = p_recurso and r.bloque && tstzrange(to_timestamp(p_desde / 1000.0), to_timestamp(p_hasta / 1000.0))
$$;

create or replace function public.calendario_reserva_uno(p_id text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select calendario_reserva_json(r) from calendario_reserva r where r.id = p_id
$$;

create or replace function public.calendario_reserva_por_clave(p_clave text) returns jsonb
language sql stable security invoker set search_path = public as $$
  select calendario_reserva_json(r) from calendario_reserva r where r.clave = p_clave
$$;

-- ATOMICA: libera las tentativas vencidas del recurso e inserta; si el bloque choca con algo vigente,
-- la restriccion de exclusion lo rechaza y la funcion devuelve false.
create or replace function public.calendario_reserva_si_libre(p jsonb, p_ahora bigint) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  update calendario_reserva set estado = 'liberada'
  where recurso = p->>'recurso' and estado = 'tentativa' and expira_ms is not null and expira_ms <= p_ahora;
  insert into calendario_reserva (id, recurso, clave, inicio_ms, fin_ms, bloque, estado, expira_ms, referencia, evento, creada_ms)
  values (p->>'id', p->>'recurso', p->>'clave', (p->>'inicio')::bigint, (p->>'fin')::bigint,
          tstzrange(to_timestamp((p->>'bloqueDesde')::bigint / 1000.0), to_timestamp((p->>'bloqueHasta')::bigint / 1000.0)),
          p->>'estado', (p->>'expira')::bigint, p->>'referencia', p->>'evento', (p->>'creada')::bigint);
  return true;
exception when exclusion_violation then
  return false;
end $$;

create or replace function public.calendario_actualiza_reserva(p jsonb) returns void
language sql security invoker set search_path = public as $$
  update calendario_reserva set estado = p->>'estado', expira_ms = (p->>'expira')::bigint, evento = p->>'evento'
  where id = p->>'id'
$$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'calendario\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
