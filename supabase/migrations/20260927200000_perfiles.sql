-- PRP-007 fase 2 (/add-login): perfiles. Un perfil por cuenta, creado por un disparador al dar de alta.
-- RLS: cada quien ve y edita solo el suyo. Ninguna superficie usa service_role (C7).
-- Idempotente. Se aplica con scripts/reel/aplica-migraciones.mjs (job de plataforma declarado, C7).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (full_name is null or char_length(full_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil propio: ver" on public.profiles;
create policy "perfil propio: ver" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "perfil propio: editar" on public.profiles;
create policy "perfil propio: editar" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- security definer con search_path vacío y nombres calificados: el disparador corre con privilegios
-- del dueño de la función, así que no puede resolver nombres por un search_path que alguien controle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 80),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
