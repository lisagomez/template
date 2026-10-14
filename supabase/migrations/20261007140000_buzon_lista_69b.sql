-- Spec 015, piloto del buzón de CFDI — fase 5 (TAR-12, TAR-13): el listado del artículo 69-B del SAT.
--
-- La máquina del despacho no sale a internet: el listado es un archivo público que el operador baja fuera y
-- IMPORTA. Se guarda la fuente, la fecha que el propio listado declara («actualizada al…») y su huella; de cada
-- contribuyente, solo su RFC y la situación que publica el SAT, tal cual. Ni nombres ni oficios: no hacen falta.
--
-- RF-19: aquí no hay ningún campo de veredicto. La base guarda lo que dice el SAT; qué significa para un CFDI lo
-- decide la persona.
--
-- Un RFC puede aparecer con varias situaciones (medido el 2026-10-07: 82 de 14,234, p. ej. «Definitivo» y
-- «Sentencia Favorable»): se guardan todas.
--
-- Idempotente.

create table if not exists public.buzon_listas_69b (
  id uuid primary key default gen_random_uuid(),
  fuente text not null check (char_length(trim(fuente)) between 1 and 300),
  actualizada_al date not null,
  huella text not null unique check (huella ~ '^sha256:[0-9a-f]{64}$'),
  registros integer not null check (registros >= 0),
  descartados integer not null check (descartados >= 0),
  importada_en timestamptz not null default now()
);

create table if not exists public.buzon_lista_69b_rfc (
  lista_id uuid not null references public.buzon_listas_69b (id) on delete cascade,
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  situacion text not null check (situacion in ('Presunto', 'Definitivo', 'Desvirtuado', 'Sentencia Favorable')),
  primary key (lista_id, rfc, situacion)
);
create index if not exists buzon_lista_69b_rfc_por_rfc on public.buzon_lista_69b_rfc (rfc);

-- Importar es TODO o NADA: la lista y sus filas en una sola transacción, con los permisos de quien llama (INVOKER:
-- el RLS decide). Si una fila no cabe, no queda una lista a medias que parezca completa.
create or replace function public.buzon_importa_69b(fuente text, actualizada_al date, huella text, descartados integer, filas jsonb)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare nueva uuid;
begin
  insert into public.buzon_listas_69b (fuente, actualizada_al, huella, registros, descartados)
  values (fuente, actualizada_al, huella, jsonb_array_length(filas), descartados)
  returning id into nueva;
  insert into public.buzon_lista_69b_rfc (lista_id, rfc, situacion)
  select nueva, f ->> 'rfc', f ->> 'situacion' from jsonb_array_elements(filas) f;
  return nueva;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['buzon_listas_69b', 'buzon_lista_69b_rfc']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists "miembro: ver" on public.%I', t);
    execute format('create policy "miembro: ver" on public.%I for select to authenticated using (public.buzon_soy_miembro())', t);
    execute format('drop policy if exists "miembro: importa" on public.%I', t);
    execute format('create policy "miembro: importa" on public.%I for insert to authenticated with check (public.buzon_soy_miembro())', t);
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end $$;
