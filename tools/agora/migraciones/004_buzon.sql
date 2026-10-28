-- =============================================================================
-- Ágora · 004 · el buzón: un canal por categoría, hilos de un nivel, cuerpo como dato, propuestas con
-- su sha256 y aprobaciones que solo firma una persona con el rol que dice la matriz. Idempotente.
--
-- Adaptado de `tools/sala-a2a/migraciones/propuesta-sala-a2a.sql` (canales, hilos de un nivel, aprobación
-- restrictiva `decidida_por = auth.uid()`, ningún rol de servicio ni de agente inserta aprobaciones).
-- Lo nuevo: el canal es de una CATEGORÍA, la aprobación exige el ROL de la matriz y la segregación de
-- funciones, y la huella la recalcula la BASE sobre el texto canónico que se guarda y que se aplica.
-- =============================================================================
set check_function_bodies = off;

create table if not exists agora.canal (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  categoria_id uuid not null unique references agora.nodo (id) on delete cascade,
  tipo         text not null default 'departamento' check (tipo in ('publico', 'privado', 'departamento')),
  nombre       text not null
);

create table if not exists agora.mensaje (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references agora.org (id) on delete cascade,
  canal_id      uuid not null references agora.canal (id) on delete cascade,
  hilo_id       uuid references agora.mensaje (id) on delete cascade,
  autor_tipo    text not null check (autor_tipo in ('humano', 'agente', 'sistema')),
  autor_persona uuid references agora.persona (id),
  autor_agente  uuid references agora.agente (id),
  cuerpo        text not null check (length(cuerpo) between 1 and 8000),
  origen        text not null default 'sala' check (origen in ('sala', 'puerta', 'espejo_slack', 'espejo_telegram', 'espejo_correo')),
  item_id       uuid references agora.item (id) on delete set null,
  propuesta_id  uuid,
  clave         text unique,
  creado_en     timestamptz not null default now(),
  constraint autor_coherente check (
    (autor_tipo = 'humano' and autor_persona is not null and autor_agente is null) or
    (autor_tipo = 'agente' and autor_agente is not null and autor_persona is null) or
    (autor_tipo = 'sistema' and autor_persona is null and autor_agente is null)),
  -- Un espejo solo replica: lo que llega de Slack, Telegram o correo es de lectura y no lo escribe un agente.
  constraint espejo_solo_humano check (origen not like 'espejo_%' or autor_tipo = 'humano'),
  constraint puerta_solo_agente check (origen <> 'puerta' or autor_tipo = 'agente')
);
create index if not exists ix_mensaje_canal on agora.mensaje (canal_id, creado_en desc);
create index if not exists ix_mensaje_agente on agora.mensaje (autor_agente, creado_en desc) where autor_agente is not null;

do $$ begin
  alter table agora.item add constraint item_hilo_fk foreign key (hilo_id) references agora.mensaje (id) on delete set null;
exception when duplicate_object then null;
end $$;

create or replace function agora_priv.mensaje_coherente() returns trigger language plpgsql set search_path = '' as $$
declare h agora.mensaje;
begin
  if not exists (select 1 from agora.canal c where c.id = new.canal_id and c.org_id = new.org_id) then
    raise exception 'el canal no es de esa organización' using errcode = 'AG400';
  end if;
  if new.hilo_id is not null then
    select * into h from agora.mensaje where id = new.hilo_id;
    if not found or h.canal_id <> new.canal_id then raise exception 'la respuesta no es de ese canal' using errcode = 'AG400'; end if;
    if h.hilo_id is not null then raise exception 'los hilos son de un solo nivel' using errcode = 'AG400'; end if;
  end if;
  if current_user = 'agora_agente' then new.creado_en := now(); end if; -- un agente no fecha hacia atrás (los topes leen la hora)
  return new;
end $$;
drop trigger if exists tg_mensaje_coherente on agora.mensaje;
create trigger tg_mensaje_coherente before insert or update on agora.mensaje for each row execute function agora_priv.mensaje_coherente();
drop trigger if exists tg_mensaje_solo_agregar on agora.mensaje;
create trigger tg_mensaje_solo_agregar before update or delete on agora.mensaje for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

-- --- Las propuestas -------------------------------------------------------------------------------------
-- `payload_canon` es el JSON canónico (JCS, RFC 8785) que se firma y que se aplica; `sha256` lo comprueba la
-- base sobre ese mismo texto: lo aprobado es exactamente lo que se aplica.
create or replace function agora_priv.monto_de(p jsonb) returns numeric language sql immutable set search_path = '' as $$
  select max(v) from (
    select (c ->> 'despues')::numeric v from jsonb_array_elements(coalesce(p -> 'cambios', '[]')) c where c ->> 'campo' = 'monto_mxn' and jsonb_typeof(c -> 'despues') = 'number'
    union all
    select (n ->> 'monto_mxn')::numeric from jsonb_array_elements(coalesce(p -> 'nuevos', '[]')) n where jsonb_typeof(n -> 'monto_mxn') = 'number'
    union all
    select (p ->> 'importe_mxn')::numeric where jsonb_typeof(p -> 'importe_mxn') = 'number'
  ) x
$$;

create table if not exists agora.propuesta (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references agora.org (id) on delete cascade,
  categoria_id           uuid not null references agora.nodo (id) on delete cascade,
  clase                  text not null check (clase in ('editar', 'crear_item', 'mover_fecha', 'asignar', 'asignar_externo', 'cambiar_monto',
                                                       'presupuesto', 'tope_gasto', 'tope_cuota', 'estructura', 'reprogramar')),
  autor_agente           uuid references agora.agente (id),
  autor_persona          uuid references agora.persona (id),
  -- Quién pidió el cambio (la persona que habló con el agente, o el autor humano): no puede aprobarlo.
  solicitada_por         uuid references agora.persona (id),
  resumen                text not null check (length(resumen) between 3 and 400),
  payload_canon          text not null check (length(payload_canon) <= 65536),
  payload                jsonb generated always as (payload_canon::jsonb) stored,
  sha256                 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  monto_mxn              numeric generated always as (agora_priv.monto_de(payload_canon::jsonb)) stored,
  nivel                  text not null default 'A1' check (nivel in ('A0', 'A1', 'A2', 'A3')),
  estado                 text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada', 'a_revision', 'retirada', 'aplicada', 'congelada', 'vencida')),
  motivo_supervisor      text,
  vence_en               timestamptz not null default now() + interval '7 days',
  task_id                text,
  thread_id              text,
  clave                  text unique,
  creada_en              timestamptz not null default now(),
  decidida_en            timestamptz,
  aplicada_en            timestamptz,
  constraint huella_del_texto check (sha256 = encode(sha256(convert_to(payload_canon, 'UTF8')), 'hex')),
  constraint un_autor check ((autor_agente is null) <> (autor_persona is null))
);
create index if not exists ix_propuesta_categoria on agora.propuesta (categoria_id, estado);
create index if not exists ix_propuesta_agente on agora.propuesta (autor_agente, creada_en desc) where autor_agente is not null;

do $$ begin
  alter table agora.mensaje add constraint mensaje_propuesta_fk foreign key (propuesta_id) references agora.propuesta (id) on delete set null;
exception when duplicate_object then null;
end $$;

create or replace function agora_priv.propuesta_coherente() returns trigger language plpgsql set search_path = '' as $$
declare
  a agora.agente;
  c agora.nodo;
  -- En un disparador BEFORE las columnas generadas aún no se calculan: se leen del texto canónico.
  pl jsonb := new.payload_canon::jsonb;
  monto numeric := agora_priv.monto_de(new.payload_canon::jsonb);
begin
  select * into c from agora.nodo where id = new.categoria_id;
  if not found or c.tipo <> 'categoria' or c.org_id <> new.org_id then raise exception 'una propuesta es de una categoría de su organización' using errcode = 'AG400'; end if;
  if pl ->> 'categoria' is distinct from new.categoria_id::text then raise exception 'el payload no es de esa categoría' using errcode = 'AG400'; end if;
  if pl ->> 'clase' is distinct from new.clase then raise exception 'el payload no es de esa clase' using errcode = 'AG400'; end if;
  if new.autor_agente is not null then
    select * into a from agora.agente where id = new.autor_agente;
    if a.org_id <> new.org_id then raise exception 'el agente no es de esa organización' using errcode = 'AG400'; end if;
    -- El nivel no supera el techo del agente; A2 solo lo reversible sin dinero ni terceros, y nunca un externo.
    if new.nivel > a.autonomia_max then raise exception 'el nivel % supera el techo % del agente', new.nivel, a.autonomia_max using errcode = 'AG403'; end if;
    if new.nivel in ('A2', 'A3') and (new.clase <> 'editar' or monto is not null) then
      raise exception 'A2 aplica solo lo reversible sin dinero ni terceros' using errcode = 'AG403';
    end if;
  else
    new.solicitada_por := coalesce(new.solicitada_por, new.autor_persona);
    if new.nivel <> 'A1' then raise exception 'una persona propone en A1' using errcode = 'AG400'; end if;
  end if;
  if current_user in ('agora_agente', 'authenticated') then new.creada_en := now(); new.estado := 'pendiente'; end if;
  return new;
end $$;
drop trigger if exists tg_propuesta_coherente on agora.propuesta;
create trigger tg_propuesta_coherente before insert on agora.propuesta for each row execute function agora_priv.propuesta_coherente();

-- Una vez creada, una propuesta no cambia de contenido: solo de estado, y solo por las funciones de la base.
create or replace function agora_priv.propuesta_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if not agora_priv.confiable() then
    raise exception 'una propuesta no se edita: se decide' using errcode = 'AG403';
  end if;
  if (new.payload_canon, new.sha256, new.clase, new.categoria_id, new.autor_agente, new.autor_persona, new.solicitada_por)
     is distinct from (old.payload_canon, old.sha256, old.clase, old.categoria_id, old.autor_agente, old.autor_persona, old.solicitada_por) then
    raise exception 'el contenido de una propuesta no cambia: se propone otra' using errcode = 'AG403';
  end if;
  return new;
end $$;
drop trigger if exists tg_propuesta_inmutable on agora.propuesta;
create trigger tg_propuesta_inmutable before update or delete on agora.propuesta for each row execute function agora_priv.propuesta_inmutable();

-- --- Las aprobaciones -------------------------------------------------------------------------------------
create table if not exists agora.aprobacion (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  propuesta_id uuid not null references agora.propuesta (id) on delete cascade,
  decision     text not null check (decision in ('aprobar', 'rechazar', 'a_revision')),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  motivo       text,
  decidida_por uuid not null,
  rol_usado    text,
  decidida_en  timestamptz not null default now(),
  unique (propuesta_id, decidida_por),
  constraint motivo_al_devolver check (decision = 'aprobar' or length(coalesce(motivo, '')) >= 3)
);

/** La regla de la matriz que aplica a una propuesta (por su clase y su monto contra el umbral). */
create or replace function agora_priv.regla_de(p agora.propuesta) returns agora.matriz_regla language plpgsql stable security definer set search_path = '' as $$
declare
  umbral numeric;
  r agora.matriz_regla;
  cond text;
begin
  select c.umbral_monto_mxn into umbral from agora.org_config c where c.org_id = p.org_id;
  cond := case when p.monto_mxn is null then 'siempre' when p.monto_mxn > umbral then 'monto_sobre_umbral' else 'monto_hasta_umbral' end;
  select * into r from agora.matriz_regla m where m.org_id = p.org_id and m.clase = p.clase and m.condicion = cond;
  if not found then select * into r from agora.matriz_regla m where m.org_id = p.org_id and m.clase = p.clase and m.condicion = 'siempre'; end if;
  if not found and cond = 'monto_hasta_umbral' then
    select * into r from agora.matriz_regla m where m.org_id = p.org_id and m.clase = p.clase and m.condicion = 'monto_sobre_umbral';
  end if;
  return r; -- sin regla: nadie aprueba (fail-closed)
end $$;

/**
 * ¿Qué ranura de firma llenaría esta persona? Devuelve el rol con el que firma, o null si no le toca. Una
 * persona llena UNA ranura; una ranura ya llenada por otra firma no se llena dos veces.
 */
create or replace function agora_priv.ranura_para(p agora.propuesta, persona uuid) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  r agora.matriz_regla := agora_priv.regla_de(p);
  roles text[] := agora_priv.roles_de(persona, p.org_id, p.categoria_id);
  ranura jsonb;
  k int := 0;
  usadas text[];
  rol text;
begin
  if r.id is null then return null; end if;
  select coalesce(array_agg(a.rol_usado), '{}') into usadas from agora.aprobacion a where a.propuesta_id = p.id and a.decision = 'aprobar';
  for ranura in select * from jsonb_array_elements(r.firmas) loop
    k := k + 1;
    -- La ranura ya está llena si alguna firma previa usó uno de sus roles.
    if exists (select 1 from jsonb_array_elements_text(ranura) x where x = any (usadas)) then continue; end if;
    for rol in select * from jsonb_array_elements_text(ranura) loop
      if rol = any (roles) then return rol; end if;
    end loop;
  end loop;
  return null;
end $$;

create or replace function agora_priv.firmas_completas(pid uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  p agora.propuesta;
  r agora.matriz_regla;
  ranura jsonb;
begin
  select * into p from agora.propuesta where id = pid;
  r := agora_priv.regla_de(p);
  if r.id is null then return false; end if;
  for ranura in select * from jsonb_array_elements(r.firmas) loop
    if not exists (select 1 from agora.aprobacion a where a.propuesta_id = pid and a.decision = 'aprobar' and a.sha256 = p.sha256
                     and a.rol_usado in (select jsonb_array_elements_text(ranura))) then
      return false;
    end if;
  end loop;
  return true;
end $$;

/**
 * Una aprobación decide SOBRE una propuesta: la de su organización, pendiente, con SU huella, y la firma una
 * persona cuyo rol llena una ranura de la matriz. Quien la pidió no la aprueba (segregación de funciones).
 */
create or replace function agora_priv.aprobacion_valida() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p agora.propuesta;
  seg boolean;
  rol text;
begin
  select * into p from agora.propuesta where id = new.propuesta_id for update;
  if not found or p.org_id <> new.org_id then raise exception 'la aprobación no es de la organización de su propuesta' using errcode = 'AG404'; end if;
  if p.estado <> 'pendiente' then raise exception 'la propuesta ya no está pendiente (%)', p.estado using errcode = 'AG409'; end if;
  if p.vence_en <= now() then raise exception 'la propuesta venció' using errcode = 'AG409'; end if;
  if new.sha256 <> p.sha256 then raise exception 'la huella aprobada no es la de la propuesta' using errcode = 'AG409'; end if;
  if not exists (select 1 from agora.persona x where x.id = new.decidida_por and x.org_id = p.org_id) then
    raise exception 'solo una persona de la organización decide' using errcode = 'AG403';
  end if;
  select c.segregacion into seg from agora.org_config c where c.org_id = p.org_id;
  if coalesce(seg, true) and new.decidida_por in (p.solicitada_por, p.autor_persona) then
    raise exception 'segregación de funciones: quien pide el cambio no lo aprueba' using errcode = 'AG403';
  end if;
  rol := agora_priv.ranura_para(p, new.decidida_por);
  if rol is null and new.decision = 'aprobar' then
    raise exception 'la matriz no te deja aprobar esto (clase %, monto %)', p.clase, coalesce(p.monto_mxn::text, '—') using errcode = 'AG403';
  end if;
  if rol is null and not exists (select 1 from unnest(agora_priv.roles_de(new.decidida_por, p.org_id, p.categoria_id)) x where x in ('propietario', 'aprobador', 'finanzas', 'editor')) then
    raise exception 'tu rol no decide propuestas' using errcode = 'AG403';
  end if;
  new.rol_usado := coalesce(rol, (select x from unnest(agora_priv.roles_de(new.decidida_por, p.org_id, p.categoria_id)) x limit 1));
  new.decidida_en := now();
  return new;
end $$;
drop trigger if exists tg_aprobacion_valida on agora.aprobacion;
create trigger tg_aprobacion_valida before insert on agora.aprobacion for each row execute function agora_priv.aprobacion_valida();
drop trigger if exists tg_aprobacion_solo_agregar on agora.aprobacion;
create trigger tg_aprobacion_solo_agregar before update or delete on agora.aprobacion for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

/** Después de cada decisión, el estado de la propuesta. Aprobar no aplica: aplicar es otro paso que relee esto. */
create or replace function agora_priv.aprobacion_efecto() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.decision = 'rechazar' then
    update agora.propuesta set estado = 'rechazada', decidida_en = now() where id = new.propuesta_id;
  elsif new.decision = 'a_revision' then
    update agora.propuesta set estado = 'a_revision', decidida_en = now() where id = new.propuesta_id;
  elsif agora_priv.firmas_completas(new.propuesta_id) then
    update agora.propuesta set estado = 'aprobada', decidida_en = now() where id = new.propuesta_id;
  end if;
  return null;
end $$;
drop trigger if exists tg_aprobacion_efecto on agora.aprobacion;
create trigger tg_aprobacion_efecto after insert on agora.aprobacion for each row execute function agora_priv.aprobacion_efecto();
