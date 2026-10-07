-- Spec 015, piloto del buzón de CFDI — fase 6 (TAR-14, TAR-15): la medición.
--
-- Las horas de captura de CFDI recibidos por pyme y por mes, con el MISMO registro el mes previo al piloto y el mes
-- del piloto (RF-20), y SIN ninguna columna de quién capturó (RF-21: el registro es por pyme, nunca por persona).
-- Los CFDI recibidos del mes previo los declara el despacho (se capturaron a mano); los del mes del piloto los
-- cuenta el buzón.
--
-- RF-5: al revocar el consentimiento, las horas de la pyme también se borran, así que sale de las cifras por
-- construcción. Por eso esta migración redefine `buzon_retira_lo_de_la_pyme()` (nació en la fase 3).
--
-- Idempotente.

create table if not exists public.buzon_horas (
  id uuid primary key default gen_random_uuid(),
  pyme_id uuid not null references public.buzon_pymes (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  fase text not null check (fase in ('previo', 'piloto')),
  horas numeric(6, 2) not null check (horas >= 0 and horas <= 744),
  cfdi_recibidos integer check (cfdi_recibidos is null or cfdi_recibidos >= 0),
  registrado_en timestamptz not null default now(),
  unique (pyme_id, mes, fase),
  -- El mes previo no pasó por el buzón: cuántos CFDI se capturaron lo dice el despacho.
  constraint buzon_horas_previo_con_cfdi check (fase = 'piloto' or cfdi_recibidos is not null)
);

alter table public.buzon_constancias add column if not exists registros_de_horas_borrados integer not null default 0;

alter table public.buzon_horas enable row level security;
revoke all on public.buzon_horas from anon, authenticated;
drop policy if exists "miembro: ver" on public.buzon_horas;
create policy "miembro: ver" on public.buzon_horas for select to authenticated using (public.buzon_soy_miembro());
-- Se mide solo lo de una pyme que consiente: sin consentimiento, ni sus horas.
drop policy if exists "miembro: registra" on public.buzon_horas;
create policy "miembro: registra" on public.buzon_horas for insert to authenticated
  with check (public.buzon_soy_miembro() and public.buzon_consiente(pyme_id));
drop policy if exists "miembro: corrige" on public.buzon_horas;
create policy "miembro: corrige" on public.buzon_horas for update to authenticated
  using (public.buzon_soy_miembro()) with check (public.buzon_soy_miembro() and public.buzon_consiente(pyme_id));
grant select, insert on public.buzon_horas to authenticated;
grant update (horas, cfdi_recibidos) on public.buzon_horas to authenticated;

-- Revocar: se borran los documentos Y las horas de la pyme, y la constancia cuenta los dos (RF-4, RF-5, RF-29).
create or replace function public.buzon_retira_lo_de_la_pyme()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare borrados integer; horas_borradas integer;
begin
  delete from public.buzon_documentos where pyme_id = new.pyme_id;
  get diagnostics borrados = row_count;
  delete from public.buzon_horas where pyme_id = new.pyme_id;
  get diagnostics horas_borradas = row_count;
  insert into public.buzon_constancias (motivo, pyme_seudonimo, documentos_borrados, registros_de_horas_borrados)
  select 'retiro_de_consentimiento', p.seudonimo, borrados, horas_borradas from public.buzon_pymes p where p.id = new.pyme_id;
  return new;
end;
$$;
revoke execute on function public.buzon_retira_lo_de_la_pyme() from public, anon, authenticated;
