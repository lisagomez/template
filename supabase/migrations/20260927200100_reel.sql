-- PRP-007 fases 3, 6 y 8: el reel en Supabase guarda SOLO lo que no es video ni voz: proyectos,
-- versiones (huella del máster), aprobaciones (quién, cuándo, huella, versión) y el ESTADO de cada
-- consentimiento. El video, la transcripción y el documento firmado viven en el servidor (REEL_DATOS).
-- RLS por dueño en toda tabla; la app entra con la llave anónima y la sesión del dueño (C7).
-- Idempotente y no destructiva.

create table if not exists public.reel_proyectos (
  id uuid primary key default gen_random_uuid(),
  dueno_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  estado text not null default 'subido'
    check (estado in ('subido', 'procesando', 'bloqueado', 'borrador', 'aprobado')),
  motivo_bloqueo text check (motivo_bloqueo is null or char_length(motivo_bloqueo) <= 500),
  creado_en timestamptz not null default now(),
  aprobado_en timestamptz,
  -- Respuesta 7: el bruto y la transcripción se borran a los 30 días de aprobado. La fecha la calcula el job
  -- de retención (scripts/reel/retencion.ts, reloj inyectado): una columna generada `aprobado_en + 30 días`
  -- no es inmutable en Postgres (depende de la zona horaria) y la base la rechaza (42P17, medido).
  bruto_borrado_en timestamptz
);

create table if not exists public.reel_versiones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.reel_proyectos (id) on delete cascade,
  dueno_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  numero integer not null check (numero >= 1),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  duracion_s numeric(6, 2) not null check (duracion_s > 0 and duracion_s <= 90),
  creado_en timestamptz not null default now(),
  unique (proyecto_id, numero)
);

create table if not exists public.reel_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.reel_proyectos (id) on delete cascade,
  version_id uuid not null references public.reel_versiones (id) on delete cascade,
  dueno_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aprobado_por uuid not null default auth.uid() references auth.users (id) on delete cascade,
  decision text not null check (decision in ('aprobada', 'cambio-pedido')),
  nota text check (nota is null or char_length(nota) <= 500),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  version integer not null check (version >= 1),
  creado_en timestamptz not null default now(),
  revocada_en timestamptz,
  -- Pedir cambio sin decir qué no sirve (misma regla que la aprobación del estudio).
  check (decision = 'aprobada' or char_length(coalesce(nota, '')) > 0)
);

create table if not exists public.reel_marcas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.reel_proyectos (id) on delete cascade,
  version_id uuid not null references public.reel_versiones (id) on delete cascade,
  dueno_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('corte', 'texto')),
  segundo numeric(6, 2) not null check (segundo >= 0),
  hasta numeric(6, 2) check (hasta is null or hasta > segundo),
  nota text check (nota is null or char_length(nota) <= 300),
  creado_en timestamptz not null default now()
);

create table if not exists public.reel_consentimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.reel_proyectos (id) on delete cascade,
  dueno_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Un alias («Empleada 1»), no el nombre: el nombre vive en el documento firmado, en el servidor.
  alias text not null check (char_length(alias) between 1 and 60),
  rol text not null check (rol in ('dueno', 'empleado', 'cliente')),
  alcance text not null check (char_length(alcance) between 1 and 200),
  vigente_hasta date not null,
  huella_documento text not null check (huella_documento ~ '^sha256:[0-9a-f]{64}$'),
  creado_en timestamptz not null default now(),
  revocado_en timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['reel_proyectos', 'reel_versiones', 'reel_aprobaciones', 'reel_marcas', 'reel_consentimientos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dueño: ver" on public.%I', t);
    execute format('create policy "dueño: ver" on public.%I for select to authenticated using ((select auth.uid()) = dueno_id)', t);
    execute format('drop policy if exists "dueño: crear" on public.%I', t);
    execute format('create policy "dueño: crear" on public.%I for insert to authenticated with check ((select auth.uid()) = dueno_id)', t);
    execute format('drop policy if exists "dueño: cambiar" on public.%I', t);
    execute format('create policy "dueño: cambiar" on public.%I for update to authenticated using ((select auth.uid()) = dueno_id) with check ((select auth.uid()) = dueno_id)', t);
    execute format('drop policy if exists "dueño: borrar" on public.%I', t);
    execute format('create policy "dueño: borrar" on public.%I for delete to authenticated using ((select auth.uid()) = dueno_id)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- El registro de aprobación es inmutable: se puede REVOCAR (poner revocada_en) y nada más. Ni el
-- dueño reescribe quién aprobó, qué huella ni cuándo; tampoco lo borra (salvo al borrar el proyecto).
revoke update, delete on public.reel_aprobaciones from authenticated;
grant update (revocada_en) on public.reel_aprobaciones to authenticated;
drop policy if exists "aprobó quien tiene la sesión" on public.reel_aprobaciones;
create policy "aprobó quien tiene la sesión" on public.reel_aprobaciones
  as restrictive for insert to authenticated with check ((select auth.uid()) = aprobado_por);

-- Un consentimiento tampoco se reescribe: solo se revoca.
revoke update on public.reel_consentimientos from authenticated;
grant update (revocado_en) on public.reel_consentimientos to authenticated;

create index if not exists reel_versiones_proyecto on public.reel_versiones (proyecto_id);
create index if not exists reel_aprobaciones_proyecto on public.reel_aprobaciones (proyecto_id);
create index if not exists reel_marcas_proyecto on public.reel_marcas (proyecto_id);
create index if not exists reel_consentimientos_proyecto on public.reel_consentimientos (proyecto_id);
create index if not exists reel_proyectos_dueno on public.reel_proyectos (dueno_id);
