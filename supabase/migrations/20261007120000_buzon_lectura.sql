-- Spec 015, piloto del buzón de CFDI — fase 4 (TAR-8 a TAR-11): la lectura de cada documento, el cotejo y la
-- confirmación CFDI por CFDI.
--
-- El buzón NO guarda el archivo: solo su lectura (cada campo con su confianza y su evidencia) y su huella. El
-- despacho conserva sus originales (RF-28), y al cierre hay menos que borrar.
--
-- Lo que la base garantiza, sin depender de la app:
--   · RF-13: un folio fiscal entra una sola vez por tipo (dos XML del mismo folio = repetido; su impresa no lo es:
--     se empareja con el XML).
--   · RF-17: no se confirma con un campo por revisar ni con una discrepancia XML↔impresa sin revisar (RF-14).
--   · RF-12: no se confirma un CFDI cuyo receptor no es la pyme del buzón.
--   · Un CFDI confirmado ya no cambia, y la fecha de confirmación la pone la base, no quien llama.
--   · RF-21: sigue sin haber ninguna columna de quién hizo qué.
--
-- Idempotente.

alter table public.buzon_documentos add column if not exists tipo text not null default 'xml';
alter table public.buzon_documentos add column if not exists ruta text;
alter table public.buzon_documentos add column if not exists uuid text;
alter table public.buzon_documentos add column if not exists rfc_receptor text;
alter table public.buzon_documentos add column if not exists campos jsonb not null default '[]'::jsonb;
alter table public.buzon_documentos add column if not exists discrepancias jsonb not null default '[]'::jsonb;
alter table public.buzon_documentos add column if not exists estado text not null default 'en_revision';
alter table public.buzon_documentos add column if not exists confirmado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'buzon_documentos_tipo') then
    alter table public.buzon_documentos add constraint buzon_documentos_tipo check (tipo in ('xml', 'impresa'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'buzon_documentos_estado') then
    alter table public.buzon_documentos add constraint buzon_documentos_estado
      check (estado in ('en_revision', 'receptor_ajeno', 'emparejada', 'confirmado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'buzon_documentos_uuid') then
    alter table public.buzon_documentos add constraint buzon_documentos_uuid
      check (uuid is null or uuid ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$');
  end if;
end $$;

-- RF-13: el folio fiscal, una vez por pyme y por tipo de documento.
create unique index if not exists buzon_folio_unico on public.buzon_documentos (pyme_id, tipo, uuid) where uuid is not null;

-- Lo que un miembro puede cambiar al revisar: los campos, las discrepancias y el estado. Nada más: ni el folio, ni
-- el receptor, ni la fecha de confirmación.
drop policy if exists "miembro: revisa" on public.buzon_documentos;
create policy "miembro: revisa" on public.buzon_documentos for update to authenticated
  using (public.buzon_soy_miembro()) with check (public.buzon_soy_miembro());
revoke update on public.buzon_documentos from authenticated;
grant update (campos, discrepancias, estado) on public.buzon_documentos to authenticated;

create or replace function public.buzon_regla_de_confirmacion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare rfc_de_la_pyme text;
begin
  if tg_op = 'INSERT' then
    if new.estado = 'confirmado' or new.confirmado_en is not null then
      raise exception 'un documento entra sin confirmar: se confirma después de revisarlo (RF-16)';
    end if;
    return new;
  end if;
  if old.estado = 'confirmado' then
    raise exception 'un CFDI confirmado ya no cambia';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado <> 'en_revision' or new.estado not in ('confirmado', 'emparejada') then
      raise exception 'cambio de estado no permitido: % → %', old.estado, new.estado;
    end if;
  end if;
  if new.estado = 'confirmado' then
    if exists (select 1 from jsonb_array_elements(new.campos) c where coalesce((c ->> 'revisionHumana')::boolean, false)) then
      raise exception 'quedan campos por revisar: no se confirma (RF-17)';
    end if;
    if exists (select 1 from jsonb_array_elements(new.discrepancias) d where not coalesce((d ->> 'revisada')::boolean, false)) then
      raise exception 'quedan discrepancias entre el XML y la impresa sin revisar: no se confirma (RF-14, RF-17)';
    end if;
    select rfc into rfc_de_la_pyme from public.buzon_pymes where id = new.pyme_id;
    if exists (select 1 from jsonb_array_elements(new.campos) c
               where c ->> 'clave' = 'rfc_receptor' and upper(trim(c ->> 'valor')) <> rfc_de_la_pyme) then
      raise exception 'el receptor no es la pyme de este buzón: no se confirma aquí (RF-12)';
    end if;
    new.confirmado_en := now();
  else
    new.confirmado_en := old.confirmado_en;
  end if;
  return new;
end;
$$;
drop trigger if exists buzon_regla_de_confirmacion on public.buzon_documentos;
create trigger buzon_regla_de_confirmacion before insert or update on public.buzon_documentos
  for each row execute function public.buzon_regla_de_confirmacion();
