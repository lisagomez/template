-- PRP-002: tipo de proyecto (aplicacion | herramienta) con la regla en la BASE, no solo en
-- el formulario. Elegir "herramienta" excluye los campos de despliegue VPS/Docker; elegir
-- "aplicacion" excluye los de empaquetado. Ver .claude/PRPs/PRP-002-parametrizacion-tipo-proyecto-supabase.md
--
-- Escritura SOLO con el cliente autenticado del dueño (RLS por owner_id): ninguna superficie
-- usa service_role aqui (control C7). Ninguna columna guarda secretos.
--
-- Aplicar: supabase MCP `apply_migration` o SQL Editor. Idempotente.

create table if not exists public.project_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null,
  project_type text not null check (project_type in ('aplicacion', 'herramienta')),

  -- Solo aplica si project_type = 'aplicacion'
  deploy_provider text check (deploy_provider is null or deploy_provider in ('hetzner', 'otro-vps')),
  deploy_domain text,

  -- Solo aplica si project_type = 'herramienta'
  package_scope text,
  package_name text,

  setup_completed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- Regla de negocio ("si es herramienta no se selecciona VPS ni docker"), forzada en la
  -- base: sobrevive a cualquier cliente que escriba con la anon key, no solo al formulario.
  -- El esquema Zod del cliente (src/features/project-settings/types/schema.ts) dice EXACTAMENTE
  -- lo mismo: si se toca uno, se toca el otro.
  constraint project_settings_type_fields_chk check (
    (project_type = 'herramienta'
      and deploy_provider is null and deploy_domain is null
      and package_name is not null)
    or
    (project_type = 'aplicacion'
      and package_scope is null and package_name is null)
  ),

  -- Singleton REAL: es la configuracion DEL proyecto, no una fila por usuario. Un `unique`
  -- sobre la constante `true` hace que toda fila colisione con cualquier otra, asi que nunca
  -- puede existir una segunda. NO es un error de copy-paste: es la tecnica, a proposito.
  constraint project_settings_singleton unique ((true))
);

alter table public.project_settings enable row level security;

drop policy if exists "Owner can view project settings" on public.project_settings;
create policy "Owner can view project settings"
  on public.project_settings for select using (auth.uid() = owner_id);

drop policy if exists "Owner can insert project settings" on public.project_settings;
create policy "Owner can insert project settings"
  on public.project_settings for insert with check (auth.uid() = owner_id);

drop policy if exists "Owner can update project settings" on public.project_settings;
create policy "Owner can update project settings"
  on public.project_settings for update using (auth.uid() = owner_id);

-- updated_at se mantiene solo: ningun cliente tiene que acordarse.
create or replace function public.project_settings_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists project_settings_touch_updated_at on public.project_settings;
create trigger project_settings_touch_updated_at
  before update on public.project_settings
  for each row execute function public.project_settings_touch_updated_at();

comment on table public.project_settings is
  'Configuracion unica del proyecto: tipo (aplicacion | herramienta) y sus campos exclusivos. PRP-002. Sin secretos.';
comment on constraint project_settings_singleton on public.project_settings is
  'unique((true)): fuerza una sola fila en toda la tabla. Es intencional.';
