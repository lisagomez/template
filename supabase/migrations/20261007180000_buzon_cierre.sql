-- Spec 015, piloto del buzón de CFDI — fase 7 (TAR-16, TAR-17): parar y cerrar.
--
-- El piloto tiene un estado y solo avanza: activo → parado → cerrado.
--   · PARAR (RF-25) se puede en cualquier momento. Parado, no entra ningún documento nuevo; lo que quedó sin
--     confirmar se devuelve a captura manual con una lista (RF-26), así que ningún CFDI se pierde. Las horas aún se
--     pueden completar: la medición del mes es lo que es.
--   · CERRAR (RF-27) solo desde parado. Un disparador SECURITY DEFINER, sin EXECUTE para nadie (el patrón del retiro
--     de la fase 3), borra todo lo que el piloto generó —pymes, consentimientos, lecturas, horas y listados— y deja
--     una constancia sin datos (RF-29). Quedan las cuentas del despacho y las constancias.
--   · RF-28: los CFDI originales nunca se guardaron aquí (fase 4), así que no hay nada suyo que tocar.
--   · RF-30: las cifras se descargan ANTES de cerrar; después ya no hay de dónde sacarlas.
--
-- Idempotente.

create table if not exists public.buzon_piloto (
  id boolean primary key default true check (id),
  estado text not null default 'activo' check (estado in ('activo', 'parado', 'cerrado')),
  parado_en timestamptz,
  cerrado_en timestamptz
);
insert into public.buzon_piloto (id) values (true) on conflict (id) do nothing;

-- El motivo `cierre_del_piloto` ya lo admitía la tabla de constancias desde la fase 3.
alter table public.buzon_constancias add column if not exists pymes_borradas integer not null default 0;
alter table public.buzon_constancias add column if not exists listados_borrados integer not null default 0;

create or replace function public.buzon_piloto_activo()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.buzon_piloto where estado = 'activo');
$$;

alter table public.buzon_piloto enable row level security;
revoke all on public.buzon_piloto from anon, authenticated;
drop policy if exists "miembro: ver" on public.buzon_piloto;
create policy "miembro: ver" on public.buzon_piloto for select to authenticated using (public.buzon_soy_miembro());
drop policy if exists "miembro: para o cierra" on public.buzon_piloto;
create policy "miembro: para o cierra" on public.buzon_piloto for update to authenticated
  using (public.buzon_soy_miembro()) with check (public.buzon_soy_miembro());
grant select on public.buzon_piloto to authenticated;
grant update (estado) on public.buzon_piloto to authenticated;

-- Parado o cerrado, no entra ningún documento: la política de ingesta de la fase 3 suma esta condición.
drop policy if exists "entra solo con consentimiento" on public.buzon_documentos;
create policy "entra solo con consentimiento" on public.buzon_documentos for insert to authenticated
  with check (public.buzon_soy_miembro() and public.buzon_consiente(pyme_id) and public.buzon_piloto_activo());

-- Las transiciones: solo hacia delante, y no se cierra sin parar antes. Las fechas las pone la base.
create or replace function public.buzon_avance_del_piloto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estado is not distinct from old.estado then return new; end if;
  if not ((old.estado = 'activo' and new.estado = 'parado') or (old.estado = 'parado' and new.estado = 'cerrado')) then
    raise exception 'el piloto solo avanza de activo a parado y de parado a cerrado: % → % no se permite', old.estado, new.estado;
  end if;
  if new.estado = 'parado' then new.parado_en := now(); end if;
  if new.estado = 'cerrado' then new.cerrado_en := now(); end if;
  return new;
end;
$$;
drop trigger if exists buzon_avance_del_piloto on public.buzon_piloto;
create trigger buzon_avance_del_piloto before update on public.buzon_piloto
  for each row execute function public.buzon_avance_del_piloto();

-- El cierre: borra todo lo que el piloto generó y deja la constancia. Las pymes arrastran en cascada sus
-- consentimientos, documentos y horas. Los DELETE llevan `where true` A PROPÓSITO: Supabase carga `pg_safeupdate` en
-- las sesiones de su API y rechaza un DELETE sin WHERE, aunque corra dentro de este SECURITY DEFINER (medido el
-- 2026-10-07 en el recorrido: el cierre fallaba con «DELETE requires a WHERE clause»; PGlite no trae la extensión).
create or replace function public.buzon_cierra_el_piloto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare documentos integer; horas integer; pymes integer; listados integer;
begin
  select count(*) into documentos from public.buzon_documentos;
  select count(*) into horas from public.buzon_horas;
  delete from public.buzon_pymes where true;
  get diagnostics pymes = row_count;
  delete from public.buzon_listas_69b where true;
  get diagnostics listados = row_count;
  insert into public.buzon_constancias (motivo, pyme_seudonimo, documentos_borrados, registros_de_horas_borrados, pymes_borradas, listados_borrados)
  values ('cierre_del_piloto', null, documentos, horas, pymes, listados);
  return new;
end;
$$;
revoke execute on function public.buzon_cierra_el_piloto() from public, anon, authenticated;
drop trigger if exists buzon_cierra_el_piloto on public.buzon_piloto;
create trigger buzon_cierra_el_piloto after update of estado on public.buzon_piloto
  for each row when (old.estado = 'parado' and new.estado = 'cerrado')
  execute function public.buzon_cierra_el_piloto();
