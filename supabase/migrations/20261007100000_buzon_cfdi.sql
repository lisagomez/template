-- Spec 015, piloto del buzón de CFDI recibidos — fase 3 (TAR-5, TAR-6 y TAR-7): los miembros del despacho,
-- sus pymes, el consentimiento escrito de cada una, los documentos que entran y la constancia de cada borrado.
--
-- Corre en el Supabase AUTOHOSPEDADO del despacho (fase 2). Un despliegue es UN despacho: la «organización» del
-- RLS es la lista de sus miembros, y cada miembro ve a todas sus pymes, que es lo correcto.
--
-- Lo que la base garantiza, sin depender de la app:
--   · RF-1, RF-2: sin consentimiento vigente, la base RECHAZA el documento de esa pyme.
--   · Un consentimiento no se reescribe: solo se revoca, y una vez revocado no se des-revoca.
--   · RF-3, RF-4: al revocarlo, sus documentos se borran y queda una constancia que nadie escribe a mano.
--   · RF-21: ninguna tabla registra qué persona subió o capturó qué.
--   · C7: ninguna superficie usa service_role. Las altas de miembros las hace el operador con SQL directo.
--
-- Idempotente: se aplica a mano y sin historial, así que repetirla es inocuo.

-- --- Miembros del despacho -------------------------------------------------------------------------------
create table if not exists public.buzon_miembros (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

-- SECURITY INVOKER a propósito: corre con el RLS de quien pregunta, que solo ve su propia fila de miembro.
-- Así las políticas de las demás tablas no necesitan una función SECURITY DEFINER expuesta por la API.
create or replace function public.buzon_soy_miembro()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.buzon_miembros where usuario_id = auth.uid());
$$;

-- --- Pymes ---------------------------------------------------------------------------------------------------
create table if not exists public.buzon_pymes (
  id uuid primary key default gen_random_uuid(),
  -- Lo ÚNICO de la pyme que sale del despacho (RF-8): aleatorio y sin relación con el RFC.
  seudonimo text not null unique default ('pyme-' || substr(md5(gen_random_uuid()::text), 1, 10)),
  -- El RFC del receptor: contra él se coteja cada CFDI que llega a su buzón (RF-12).
  rfc text not null unique check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  nombre text not null check (char_length(trim(nombre)) between 1 and 200),
  creada_en timestamptz not null default now()
);

-- --- Consentimiento escrito de cada pyme (RF-1) ---------------------------------------------------------------
create table if not exists public.buzon_consentimientos (
  id uuid primary key default gen_random_uuid(),
  pyme_id uuid not null references public.buzon_pymes (id) on delete cascade,
  -- La huella del documento firmado. El documento vive en el despacho, no aquí.
  huella_documento text not null check (huella_documento ~ '^sha256:[0-9a-f]{64}$'),
  firmado_en date not null,
  registrado_en timestamptz not null default now(),
  revocado_en timestamptz
);
-- Un solo consentimiento vigente por pyme.
create unique index if not exists buzon_consentimiento_vigente
  on public.buzon_consentimientos (pyme_id) where revocado_en is null;

create or replace function public.buzon_consiente(pyme uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.buzon_consentimientos where pyme_id = pyme and revocado_en is null);
$$;

-- --- Documentos que entran al buzón ---------------------------------------------------------------------------
-- Sin columna de quién lo subió (RF-21). La lectura y el cotejo llegan en la fase 4.
create table if not exists public.buzon_documentos (
  id uuid primary key default gen_random_uuid(),
  pyme_id uuid not null references public.buzon_pymes (id) on delete cascade,
  nombre_archivo text not null check (char_length(nombre_archivo) between 1 and 255),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  recibido_en timestamptz not null default now(),
  unique (pyme_id, huella)
);
create index if not exists buzon_documentos_pyme on public.buzon_documentos (pyme_id);

-- --- Constancias de borrado (RF-29) ---------------------------------------------------------------------------
-- Sin datos de las pymes ni de los proveedores: el motivo, el seudónimo, cuántos documentos y cuándo.
create table if not exists public.buzon_constancias (
  id uuid primary key default gen_random_uuid(),
  motivo text not null check (motivo in ('retiro_de_consentimiento', 'cierre_del_piloto')),
  pyme_seudonimo text,
  documentos_borrados integer not null check (documentos_borrados >= 0),
  borrado_en timestamptz not null default now()
);

-- --- RLS y privilegios: explícitos, no los que Supabase da por defecto ------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['buzon_miembros', 'buzon_pymes', 'buzon_consentimientos', 'buzon_documentos', 'buzon_constancias']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists "miembro: ver" on public.%I', t);
  end loop;
end $$;

create policy "miembro: ver" on public.buzon_miembros for select to authenticated
  using (usuario_id = (select auth.uid()));
grant select on public.buzon_miembros to authenticated;

create policy "miembro: ver" on public.buzon_pymes for select to authenticated using (public.buzon_soy_miembro());
drop policy if exists "miembro: alta" on public.buzon_pymes;
create policy "miembro: alta" on public.buzon_pymes for insert to authenticated with check (public.buzon_soy_miembro());
grant select, insert on public.buzon_pymes to authenticated;

create policy "miembro: ver" on public.buzon_consentimientos for select to authenticated using (public.buzon_soy_miembro());
drop policy if exists "miembro: registra" on public.buzon_consentimientos;
create policy "miembro: registra" on public.buzon_consentimientos for insert to authenticated
  with check (public.buzon_soy_miembro() and revocado_en is null);
drop policy if exists "miembro: revoca" on public.buzon_consentimientos;
create policy "miembro: revoca" on public.buzon_consentimientos for update to authenticated
  using (public.buzon_soy_miembro()) with check (public.buzon_soy_miembro());
-- Un consentimiento no se reescribe: de sus columnas, solo se puede tocar `revocado_en`.
grant select, insert on public.buzon_consentimientos to authenticated;
grant update (revocado_en) on public.buzon_consentimientos to authenticated;

create policy "miembro: ver" on public.buzon_documentos for select to authenticated using (public.buzon_soy_miembro());
-- RF-1, RF-2: el documento solo entra si su pyme tiene un consentimiento vigente.
drop policy if exists "entra solo con consentimiento" on public.buzon_documentos;
create policy "entra solo con consentimiento" on public.buzon_documentos for insert to authenticated
  with check (public.buzon_soy_miembro() and public.buzon_consiente(pyme_id));
grant select, insert on public.buzon_documentos to authenticated;

-- Las constancias las escribe solo el disparador: un miembro las lee y no las puede inventar ni borrar.
create policy "miembro: ver" on public.buzon_constancias for select to authenticated using (public.buzon_soy_miembro());
grant select on public.buzon_constancias to authenticated;

-- --- Revocar: no se des-revoca, y retira lo de la pyme (RF-3, RF-4) --------------------------------------------
create or replace function public.buzon_revocacion_definitiva()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.revocado_en is not null and new.revocado_en is distinct from old.revocado_en then
    raise exception 'un consentimiento revocado no se des-revoca: la pyme firma uno nuevo';
  end if;
  return new;
end;
$$;
drop trigger if exists buzon_revocacion_definitiva on public.buzon_consentimientos;
create trigger buzon_revocacion_definitiva before update on public.buzon_consentimientos
  for each row execute function public.buzon_revocacion_definitiva();

-- SECURITY DEFINER para borrar y escribir la constancia sin dar esos permisos a nadie. Postgres comprueba EXECUTE
-- al crear el disparador, no al dispararlo: se le retira a todos y el disparador corre igual.
create or replace function public.buzon_retira_lo_de_la_pyme()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare borrados integer;
begin
  delete from public.buzon_documentos where pyme_id = new.pyme_id;
  get diagnostics borrados = row_count;
  insert into public.buzon_constancias (motivo, pyme_seudonimo, documentos_borrados)
  select 'retiro_de_consentimiento', p.seudonimo, borrados from public.buzon_pymes p where p.id = new.pyme_id;
  return new;
end;
$$;
revoke execute on function public.buzon_retira_lo_de_la_pyme() from public, anon, authenticated;
drop trigger if exists buzon_retira_lo_de_la_pyme on public.buzon_consentimientos;
create trigger buzon_retira_lo_de_la_pyme after update of revocado_en on public.buzon_consentimientos
  for each row when (old.revocado_en is null and new.revocado_en is not null)
  execute function public.buzon_retira_lo_de_la_pyme();
