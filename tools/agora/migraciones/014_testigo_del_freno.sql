-- =============================================================================
-- Ágora · 014 · el TESTIGO del freno, en la base. El freno de la capa (en el navegador) exige el clic humano; lo que
-- el navegador no puede garantizar, lo garantiza aquí la base: la cita de lo irreversible es palabra por palabra algo
-- que ESTA persona dijo en la conversación (no un asistente, un agente ni una página), sirve UNA vez y vence a los 15
-- minutos. La conversación atestigua lo que dice la persona (solo su huella, nunca el texto: no es memoria ni hilo).
-- Idempotente.
-- =============================================================================
set check_function_bodies = off;

/** La misma normalización que el freno de la capa: sin acentos, en minúsculas y con los espacios colapsados. */
create or replace function agora_priv.normaliza_cita(t text) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(t, ''), NFD), '[̀-ͯ]', '', 'g')), '\s+', ' ', 'g'))
$$;
create or replace function agora_priv.huella_cita(t text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(agora_priv.normaliza_cita(t), 'UTF8'), 'sha256'), 'hex')
$$;

create table if not exists agora.freno_testigo (
  id         bigserial primary key,
  org_id     uuid not null references agora.org (id) on delete cascade,
  persona_id uuid not null references agora.persona (id) on delete cascade,
  sha256     text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  dicho_en   timestamptz not null default now(),
  usado_en   timestamptz,
  accion     text check (accion is null or accion ~ '^[a-z_]{3,40}$')
);
create index if not exists freno_testigo_busca on agora.freno_testigo (persona_id, sha256, dicho_en desc);
alter table agora.freno_testigo enable row level security;
alter table agora.freno_testigo force row level security;
drop policy if exists p_testigo on agora.freno_testigo;
create policy p_testigo on agora.freno_testigo for select to authenticated using (persona_id = agora_priv.uid());
revoke all on agora.freno_testigo from authenticated, agora_agente, agora_puerta, service_role;
grant select on agora.freno_testigo to authenticated;

/** La conversación atestigua lo que dijo la persona: su huella y la hora DE LA BASE (nadie la fecha hacia atrás). */
create or replace function agora.atestigua(textos text[]) returns int language plpgsql security definer set search_path = '' as $$
declare
  t text;
  o uuid;
  n int := 0;
begin
  if agora_priv.rol_que_llama() <> 'authenticated' or agora_priv.uid() is null then raise exception 'solo una persona atestigua lo que dijo' using errcode = 'AG403'; end if;
  if coalesce(array_length(textos, 1), 0) > 10 then raise exception 'a lo sumo 10 frases por vez' using errcode = 'AG400'; end if;
  select p.org_id into o from agora.persona p where p.id = agora_priv.uid();
  if o is null then raise exception 'no existe' using errcode = 'AG404'; end if;
  delete from agora.freno_testigo where persona_id = agora_priv.uid() and dicho_en < now() - interval '1 day';
  foreach t in array coalesce(textos, '{}') loop
    if length(agora_priv.normaliza_cita(t)) between 1 and 2000 then
      insert into agora.freno_testigo (org_id, persona_id, sha256) values (o, agora_priv.uid(), agora_priv.huella_cita(t));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

/** Lo irreversible gasta su testigo: de ESTA persona, sin usar y de hace 15 minutos o menos. La base (migración,
 *  siembra) no lo necesita; una persona siempre; un agente o la Puerta nunca llegan aquí con permiso. */
create or replace function agora_priv.consume_testigo(p_cita text, p_accion text) returns void language plpgsql security definer set search_path = '' as $$
declare
  h text := agora_priv.huella_cita(p_cita);
  t bigint;
begin
  if agora_priv.llama_la_base() then return; end if;
  if agora_priv.rol_que_llama() <> 'authenticated' or agora_priv.uid() is null then raise exception 'lo irreversible lo pide una persona' using errcode = 'AG403'; end if;
  select x.id into t from agora.freno_testigo x
   where x.persona_id = agora_priv.uid() and x.sha256 = h and x.usado_en is null and x.dicho_en > now() - interval '15 minutes'
   order by x.dicho_en desc limit 1 for update;
  if t is not null then
    update agora.freno_testigo set usado_en = now(), accion = p_accion where id = t;
    return;
  end if;
  if exists (select 1 from agora.freno_testigo x where x.persona_id = agora_priv.uid() and x.sha256 = h and x.usado_en is not null) then
    raise exception 'esa cita ya se usó: lo irreversible pide que lo vuelvas a decir' using errcode = 'AG409';
  end if;
  if exists (select 1 from agora.freno_testigo x where x.persona_id = agora_priv.uid() and x.sha256 = h) then
    raise exception 'la cita venció: pasaron más de 15 minutos desde que lo dijiste' using errcode = 'AG403';
  end if;
  raise exception 'la cita no es tuya: no la dijiste tú en la conversación (un asistente, un agente o una página no la dictan)' using errcode = 'AG403';
end $$;

/** Avisar a un tercero no toca una tabla irreversible, pero es irreversible: gasta su testigo igual. */
create or replace function agora.usa_testigo(cita text, accion text) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if accion not in ('avisa_tercero') then raise exception 'acción sin testigo propio: %', accion using errcode = 'AG400'; end if;
  perform agora_priv.consume_testigo(cita, accion);
  return true;
end $$;

revoke execute on function agora.atestigua(text[]), agora.usa_testigo(text, text), agora_priv.consume_testigo(text, text),
  agora_priv.normaliza_cita(text), agora_priv.huella_cita(text) from public;
grant execute on function agora.atestigua(text[]), agora.usa_testigo(text, text) to authenticated;
