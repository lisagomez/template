-- =============================================================================
-- Ágora · 002 · los agentes: idCard con huellas fijadas, alcance, versiones, doble firma, topes,
-- suspensión y revocación, antirrepetición (jti) y el registro de la Puerta. Idempotente.
--
-- Un agente existe en Ágora solo con un idCard aprobado. La Puerta lo lee SIN caché en cada llamada:
-- revocarlo corta en la siguiente, aunque su token siga vigente. Los topes NO tienen contador propio:
-- se leen de las filas reales (mensajes, propuestas y el gasto de modelo del libro). Un solo dato.
-- =============================================================================
set check_function_bodies = off;

create table if not exists agora.agente (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references agora.org (id) on delete cascade,
  slug                text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre              text not null,
  iniciales           text not null check (length(iniciales) between 1 and 3),
  origen              text not null check (origen in ('interno', 'externo')),
  responsable         text not null,
  rol                 text not null check (rol in ('coordinador', 'supervisor', 'analista', 'especialista', 'observador', 'vigia')),
  descripcion         text not null default '',
  card_url            text check (card_url is null or card_url ~ '^https://'),
  card_sha256         text check (card_sha256 is null or card_sha256 ~ '^[0-9a-f]{64}$'),
  kid                 text,
  llave_publica       jsonb,
  llave_sha256        text check (llave_sha256 is null or llave_sha256 ~ '^[0-9a-f]{64}$'),
  autonomia_max       text not null default 'A1' check (autonomia_max in ('A0', 'A1', 'A2', 'A3')),
  estado              text not null default 'solicitado' check (estado in ('solicitado', 'en_revision', 'prueba', 'aprobado', 'suspendido', 'revocado')),
  version             int not null default 1 check (version >= 1),
  vence               date,
  sin_modelo          boolean not null default false,
  tope_mensajes_hora  int not null default 60 check (tope_mensajes_hora >= 0),
  tope_propuestas_dia int not null default 10 check (tope_propuestas_dia >= 0),
  tope_gasto_mes_mxn  numeric(12,2) not null default 300 check (tope_gasto_mes_mxn >= 0),
  unique (org_id, slug),
  -- Un externo propone y espera: su techo es A1 (diseño, «niveles de autonomía»).
  constraint techo_del_externo check (origen = 'interno' or autonomia_max in ('A0', 'A1')),
  -- Un externo necesita huellas fijadas para entrar por la Puerta.
  constraint externo_con_huellas check (origen = 'interno' or estado in ('solicitado', 'en_revision') or (card_sha256 is not null and kid is not null and llave_publica is not null))
);
create unique index if not exists ux_agente_kid on agora.agente (org_id, kid) where kid is not null;

-- Dónde existe el agente (un nodo y todo lo de abajo) y qué puede hacer ahí. Fuera de esto, «no existe».
create table if not exists agora.agente_alcance (
  agente_id uuid not null references agora.agente (id) on delete cascade,
  org_id    uuid not null references agora.org (id) on delete cascade,
  nodo_id   uuid not null references agora.nodo (id) on delete cascade,
  skills    text[] not null default '{}',
  primary key (agente_id, nodo_id)
);

-- Cada versión del idCard, con su huella y su motivo. Solo se agrega.
create table if not exists agora.agente_version (
  agente_id     uuid not null references agora.agente (id) on delete cascade,
  org_id        uuid not null references agora.org (id) on delete cascade,
  version       int not null,
  idcard        jsonb not null,
  idcard_sha256 text not null check (idcard_sha256 ~ '^[0-9a-f]{64}$'),
  motivo        text not null check (length(motivo) >= 3),
  quien         uuid,
  cuando        timestamptz not null default now(),
  primary key (agente_id, version)
);

-- Las firmas del alta de un externo: la Propietaria y el Aprobador del dominio, cada una su sesión.
create table if not exists agora.agente_firma (
  agente_id  uuid not null references agora.agente (id) on delete cascade,
  org_id     uuid not null references agora.org (id) on delete cascade,
  version    int not null,
  persona_id uuid not null,
  rol_usado  text not null check (rol_usado in ('propietario', 'aprobador')),
  cuando     timestamptz not null default now(),
  primary key (agente_id, version, persona_id)
);

create table if not exists agora.revocacion (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  agente_id    uuid not null references agora.agente (id) on delete cascade,
  accion       text not null check (accion in ('suspender', 'reactivar', 'revocar')),
  quien        uuid,
  quien_agente uuid,
  motivo       text not null check (length(motivo) >= 3),
  cita         text,
  retirado     jsonb not null default '{}',
  cuando       timestamptz not null default now(),
  constraint un_actor check ((quien is null) <> (quien_agente is null)),
  constraint revocar_con_cita check (accion <> 'revocar' or (quien is not null and length(coalesce(cita, '')) >= 8))
);

create table if not exists agora.llave_revocada (
  org_id uuid not null references agora.org (id) on delete cascade,
  kid    text not null,
  cuando timestamptz not null default now(),
  primary key (org_id, kid)
);

-- Antirrepetición: un jti se acepta UNA vez por agente mientras el token pueda vivir.
create table if not exists agora.jti_visto (
  org_id    uuid not null references agora.org (id) on delete cascade,
  agente_id uuid not null references agora.agente (id) on delete cascade,
  jti       text not null check (length(jti) between 8 and 128),
  vence     timestamptz not null,
  primary key (agente_id, jti)
);

-- Lo que la Puerta vio: cada llamada, admitida o rechazada, con su motivo (las métricas salen de aquí).
create table if not exists agora.a2a_llamada (
  id          bigserial primary key,
  org_id      uuid not null references agora.org (id) on delete cascade,
  agente_id   uuid references agora.agente (id) on delete set null,
  kid         text,
  jti         text,
  metodo      text not null,
  resultado   text not null check (resultado in ('admitida', 'rechazada')),
  motivo      text not null,
  http        int not null,
  retry_after int,
  cuando      timestamptz not null default now()
);
create index if not exists ix_a2a_llamada_agente on agora.a2a_llamada (agente_id, cuando desc);

-- Las tareas A2A en curso de un agente externo (revocar las cancela).
create table if not exists agora.a2a_tarea (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references agora.org (id) on delete cascade,
  agente_id  uuid not null references agora.agente (id) on delete cascade,
  context_id text not null,
  message_id text not null,
  estado     text not null default 'submitted' check (estado in ('submitted', 'working', 'input-required', 'completed', 'canceled', 'rejected')),
  creada_en  timestamptz not null default now(),
  unique (agente_id, message_id)
);

-- --- El token de tarea del agente: lo firma Ágora con su secreto y lo VERIFICA la base ----------------
-- (el patrón `tenant_de_tarea` de la sala A2A). Sin token válido, el rol de agente no ve ni escribe nada.
create table if not exists agora_priv.secreto (
  id      smallint primary key default 1 check (id = 1),
  secreto text not null check (length(secreto) >= 32)
);
revoke all on agora_priv.secreto from public;

create or replace function agora_priv.firma_valida(cuerpo text, sello text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select extensions.digest(rtrim(translate(encode(extensions.hmac(cuerpo, s.secreto, 'sha256'), 'base64'), '+/', '-_'), '='), 'sha256')
                        = extensions.digest(sello, 'sha256')
                   from agora_priv.secreto s where s.id = 1), false)
$$;

create or replace function agora_priv.claims_de_tarea() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  token  text := nullif(current_setting('agora.tarea', true), '');
  cuerpo text;
  claims jsonb;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then return null; end if;
  cuerpo := split_part(token, '.', 1);
  if not agora_priv.firma_valida(cuerpo, split_part(token, '.', 2)) then return null; end if;
  claims := convert_from(decode(rpad(translate(cuerpo, '-_', '+/'), (length(cuerpo) + 3) / 4 * 4, '='), 'base64'), 'utf8')::jsonb;
  -- El rol con que entró la sesión (`set role`): dentro de una función `definer` `current_user` es el dueño, pero
  -- el ajuste `role` sigue siendo el de quien llama. Un token de agente no sirve en una sesión de persona.
  if claims ->> 'rol' is distinct from current_setting('role', true) then return null; end if;
  if coalesce((claims ->> 'exp')::bigint, 0) <= (extract(epoch from clock_timestamp()) * 1000)::bigint then return null; end if;
  return claims;
exception when others then
  return null;
end $$;

/** El agente de la sesión, si su token es válido y su idCard está vivo (aprobado o en prueba). */
create or replace function agora_priv.agente_de_tarea() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare c jsonb := agora_priv.claims_de_tarea(); a uuid;
begin
  if c is null or c ->> 'rol' <> 'agora_agente' then return null; end if;
  select x.id into a from agora.agente x
   where x.id = (c ->> 'agente')::uuid and x.org_id = (c ->> 'org')::uuid and x.estado in ('aprobado', 'prueba')
     and (x.vence is null or x.vence >= current_date);
  return a;
exception when others then
  return null;
end $$;

create or replace function agora_priv.org_de_agente() returns uuid language sql stable security definer set search_path = '' as $$
  select a.org_id from agora.agente a where a.id = agora_priv.agente_de_tarea()
$$;

/** ¿El nodo está dentro del alcance del agente (el nodo de su alcance o uno de abajo)? */
create or replace function agora_priv.agente_alcanza(a uuid, n uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select a is not null and n is not null and exists (select 1 from agora.agente_alcance x where x.agente_id = a and x.nodo_id = any (agora_priv.linaje(n)))
$$;

create or replace function agora_priv.agente_tiene_skill(a uuid, n uuid, s text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.agente_alcance x where x.agente_id = a and x.nodo_id = any (agora_priv.linaje(n)) and s = any (x.skills))
$$;
