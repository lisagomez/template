-- Spec 007 — Extractor documental. Cubre TAR-45, y da el esquema sobre el que operan los
-- adaptadores `./almacenes/supabase` (TAR-14) y `./almacenes/supabase-storage` (TAR-43).
--
-- DOS REGLAS QUE ESTA MIGRACION HONRA, Y DONDE SE VEN:
--
-- 1. **RLS por pertenencia a la organizacion, no por `owner_id` suelto.** Un extractor lo usa un
--    EQUIPO: quien sube no es quien revisa (§2.16 del SDD). Aislar por usuario haria que el
--    revisor no viera lo que subio el capturista, que es justo el flujo. La unidad de
--    aislamiento es la organizacion.
-- 2. **Ninguna superficie usa `service_role` (C7).** Todas las policies son para `authenticated`
--    y se resuelven por `auth.uid()`. Aqui no hay ninguna ruta que dependa de BYPASSRLS.
--
-- Aplicar: supabase MCP `apply_migration` o SQL Editor. Idempotente.

-- --- Organizaciones y quien pertenece a ellas -------------------------------------------------

create table if not exists public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now()
);

create table if not exists public.membresias (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  -- Los tres roles de TAR-35, espejo EXACTO de `src/roles.ts`. La primera version de esta
  -- migracion invento cuatro (capturista/administrador/lector) y `pruebas/persistencia.ts` lo
  -- cazo en su primera corrida: una lista copiada a mano diverge sola, y aqui divergir
  -- significa que la base acepta un rol que el codigo de permisos no sabe evaluar.
  rol text not null check (rol in ('operario', 'revisor', 'consulta')),
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);

-- Funcion de pertenencia. `security definer` para poder leer `membresias` desde las policies de
-- las demas tablas sin caer en recursion de RLS; `search_path` fijado porque una funcion
-- `security definer` con el search_path abierto es una via de escalada.
create or replace function public.es_miembro(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.membresias m
    where m.organizacion_id = org and m.usuario_id = auth.uid()
  );
$$;

-- --- Lotes: el titulo es para el humano, los identificadores son el indice real (§2.14) --------

create table if not exists public.lotes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  -- Obligatorio y NO unico: dos tandas pueden llamarse igual y eso no es un error del usuario.
  titulo text not null check (length(trim(titulo)) > 0),
  tipo_de_trabajo text not null check (tipo_de_trabajo in ('facturas', 'inventario', 'trazabilidad')),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  creado_por uuid not null references auth.users(id),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

-- --- Documentos y sus extracciones -------------------------------------------------------------

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  lote_id uuid references public.lotes(id) on delete set null,
  -- SHA-256 en hexadecimal: la identidad por contenido de `src/identidad.ts`. Unica DENTRO de la
  -- organizacion y no globalmente — deduplicar entre organizaciones filtraria que la otra tiene
  -- el mismo documento, que es una fuga por canal lateral.
  identidad text not null check (identidad ~ '^[0-9a-f]{64}$'),
  clase_de_fuente text not null check (clase_de_fuente in ('documento', 'etiqueta', 'evento')),
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'en_cola', 'procesando', 'extraido',
    'en_revision', 'revision_humana', 'validado', 'rechazado', 'fallido'
  )),
  tipo_documento text,
  ruta_original text,
  paginas jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, identidad, clase_de_fuente)
);

-- --- Plantillas por defecto: el artefacto que produce la revision (principio de diseno) ---------
-- «El trabajo del humano se paga una vez»: la segunda tanda del mismo tipo llega con los campos
-- correctos. Una por tipo de documento y organizacion, de ahi la clave unica compuesta.

create table if not exists public.plantillas (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tipo_documento text not null check (length(trim(tipo_documento)) > 0),
  plantilla jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (organizacion_id, tipo_documento)
);

-- --- Correcciones como versiones: append-only (TAR-37) ------------------------------------------

create table if not exists public.versiones_de_campo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  clave text not null,
  valor text not null,
  version integer not null check (version >= 1),
  motivo text not null check (length(trim(motivo)) > 0),
  autor uuid not null references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (documento_id, clave, version)
);

-- --- Indice de identificadores: por lo que se busca de verdad (TAR-38) --------------------------

create table if not exists public.indice_identificadores (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  identificador_normalizado text not null,
  clave text not null,
  primary key (documento_id, clave, identificador_normalizado)
);

create index if not exists indice_identificadores_busqueda
  on public.indice_identificadores (organizacion_id, identificador_normalizado);

-- --- Lapidas: se borra el contenido, queda la constancia (§2.17, TAR-40) ------------------------

create table if not exists public.lapidas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  -- No hay FK al documento: la fila del documento se borra y la lapida tiene que sobrevivirla.
  -- Una FK con `on delete cascade` se llevaria por delante justo la constancia de que existio.
  documento_id uuid not null,
  motivo text not null check (length(trim(motivo)) > 0),
  suprimido_por uuid not null references auth.users(id),
  suprimido_en timestamptz not null default now()
);

-- --- RLS ----------------------------------------------------------------------------------------
-- Se activa en TODAS. Una tabla nueva sin policy es una tabla que cualquiera lee.

alter table public.organizaciones enable row level security;
alter table public.membresias enable row level security;
alter table public.plantillas enable row level security;
alter table public.lotes enable row level security;
alter table public.documentos enable row level security;
alter table public.versiones_de_campo enable row level security;
alter table public.indice_identificadores enable row level security;
alter table public.lapidas enable row level security;

drop policy if exists organizaciones_miembros on public.organizaciones;
create policy organizaciones_miembros on public.organizaciones
  for select to authenticated using (public.es_miembro(id));

drop policy if exists membresias_propias on public.membresias;
create policy membresias_propias on public.membresias
  for select to authenticated using (usuario_id = auth.uid() or public.es_miembro(organizacion_id));

drop policy if exists plantillas_por_organizacion on public.plantillas;
create policy plantillas_por_organizacion on public.plantillas
  for all to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

drop policy if exists lotes_por_organizacion on public.lotes;
create policy lotes_por_organizacion on public.lotes
  for all to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

drop policy if exists documentos_por_organizacion on public.documentos;
create policy documentos_por_organizacion on public.documentos
  for all to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

-- Append-only de verdad: hay INSERT y SELECT, y NO hay policy de UPDATE ni de DELETE. Sin policy
-- permisiva, RLS deniega. Corregir es insertar una version nueva, nunca reescribir la anterior.
drop policy if exists versiones_lectura on public.versiones_de_campo;
create policy versiones_lectura on public.versiones_de_campo
  for select to authenticated using (public.es_miembro(organizacion_id));

drop policy if exists versiones_alta on public.versiones_de_campo;
create policy versiones_alta on public.versiones_de_campo
  for insert to authenticated with check (public.es_miembro(organizacion_id) and autor = auth.uid());

drop policy if exists indice_por_organizacion on public.indice_identificadores;
create policy indice_por_organizacion on public.indice_identificadores
  for all to authenticated
  using (public.es_miembro(organizacion_id))
  with check (public.es_miembro(organizacion_id));

-- Las lapidas tampoco se editan ni se borran: son la constancia.
drop policy if exists lapidas_lectura on public.lapidas;
create policy lapidas_lectura on public.lapidas
  for select to authenticated using (public.es_miembro(organizacion_id));

drop policy if exists lapidas_alta on public.lapidas;
create policy lapidas_alta on public.lapidas
  for insert to authenticated
  with check (public.es_miembro(organizacion_id) and suprimido_por = auth.uid());

-- --- Bucket privado de originales (TAR-43) -------------------------------------------------------
-- La ruta empieza por la organizacion (`<org>/<...>`), y de eso depende que esta policy se pueda
-- expresar: sin ese primer segmento no hay forma de acotar por pertenencia.

insert into storage.buckets (id, name, public)
values ('originales', 'originales', false)
on conflict (id) do nothing;

drop policy if exists originales_por_organizacion on storage.objects;
create policy originales_por_organizacion on storage.objects
  for all to authenticated
  using (bucket_id = 'originales' and public.es_miembro((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'originales' and public.es_miembro((storage.foldername(name))[1]::uuid));
