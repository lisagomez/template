-- =============================================================================
-- Ágora · 001 · la base: roles, jerarquía, personas, membresías, configuración y matriz
--
-- PROPUESTA DE LABORATORIO: no se aplica a ninguna base de producción. Se prueba en un Postgres
-- efímero (PGlite en el validate, Docker `supabase/postgres` 17 para la evidencia) y se tira.
-- Idempotente: aplicarla dos veces no cambia nada.
--
-- Los dos esquemas: `agora` (los datos, con RLS forzada en TODA tabla) y `agora_priv` (las funciones
-- que las políticas usan, `security definer` y con `search_path` vacío para que nadie las secuestre).
--
-- Los principales:
--   · authenticated     una persona; su identidad es `auth.uid()` (la sesión).
--   · agora_agente      un agente (interno o externo, ya admitido); su identidad sale de un token de
--                       tarea firmado que la BASE verifica (`agora_priv.agente_de_tarea`). Sin bypassrls.
--                       Solo inserta mensajes, propuestas, su gasto de modelo y avisos; nunca aprueba.
--   · agora_puerta      la Puerta A2A: lee el idCard SIN caché, anota jti y llamadas. Nada más.
--   · las funciones que aplican lo aprobado (`aplica_propuesta`, `cierra_periodo`…) son `security definer`:
--                       solo ellas cambian un monto, un presupuesto o un tope (`agora_priv.confiable()`).
--   · service_role      solo migraciones y la siembra de datos ficticios del laboratorio (C7, job declarado).
-- =============================================================================
set check_function_bodies = off;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'agora_agente') then create role agora_agente nologin nobypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'agora_puerta') then create role agora_puerta nologin nobypassrls; end if;
end $$;

-- Quien aplica la migración entra a esos roles con `set local role` (la app del laboratorio y las pruebas).
do $$
declare r text;
begin
  foreach r in array array['authenticated', 'agora_agente', 'agora_puerta', 'service_role'] loop
    begin
      execute format('grant %I to %I', r, current_user);
    exception when others then null; -- ya es miembro, o no puede (Supabase): `set role` lo dirá
    end;
  end loop;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase trae `auth.uid()`. Fuera de Supabase (PGlite, postgres:17) se pone uno equivalente.
create schema if not exists auth;
do $do$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid') then
    execute $f$create function auth.uid() returns uuid language sql stable as $b$
      select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                             nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $b$ $f$;
  end if;
end $do$;
grant usage on schema auth to anon, authenticated, agora_agente, agora_puerta;

create schema if not exists agora;
create schema if not exists agora_priv;
revoke all on schema agora_priv from public;

/** ¿Corre como la base misma (una función `security definer`, la migración o la siembra del laboratorio)? Las
 *  personas y los agentes nunca: ellos entran con sus roles, y nadie les da otro. */
create or replace function agora_priv.confiable() returns boolean language sql stable set search_path = '' as $$
  select current_user not in ('authenticated', 'anon', 'agora_agente', 'agora_puerta')
$$;

-- --- La jerarquía: organización › workspace › dominio › categoría (› ítem, en 004) ---------------------
create table if not exists agora.org (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre    text not null check (length(nombre) between 2 and 120),
  creada_en timestamptz not null default now()
);

-- La configuración de la organización. Los valores del prototipo son EJEMPLO, no decisiones: umbral de
-- aprobación por monto 100 000 MXN, tope de gasto de modelo 8 000 MXN al mes, segregación de funciones.
create table if not exists agora.org_config (
  org_id                 uuid primary key references agora.org (id) on delete cascade,
  umbral_monto_mxn       numeric(14,2) not null default 100000 check (umbral_monto_mxn > 0),
  tope_gasto_org_mxn     numeric(12,2) not null default 8000 check (tope_gasto_org_mxn >= 0),
  segregacion            boolean not null default true,
  desviacion_umbral_pct  numeric(5,2) not null default 10 check (desviacion_umbral_pct between 0 and 100),
  zona                   text not null default 'America/Mexico_City'
);

-- Un nodo de la jerarquía. `ancestros` lo mantiene un disparador: la herencia de permisos y el árbol de
-- centros de costo se leen de ahí, sin recursión en las políticas.
create table if not exists agora.nodo (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references agora.org (id) on delete cascade,
  padre_id  uuid references agora.nodo (id) on delete cascade,
  tipo      text not null check (tipo in ('workspace', 'dominio', 'categoria')),
  slug      text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre    text not null check (length(nombre) between 2 and 120),
  inicio    date,
  fin       date,
  ancestros uuid[] not null default '{}',
  orden     int not null default 0,
  constraint fechas_del_nodo check (inicio is null or fin is null or inicio <= fin)
);
create unique index if not exists ux_nodo_slug on agora.nodo (org_id, coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index if not exists ix_nodo_padre on agora.nodo (padre_id);

create or replace function agora_priv.nodo_coherente() returns trigger language plpgsql set search_path = '' as $$
declare p agora.nodo;
begin
  if new.padre_id is null then
    if new.tipo <> 'workspace' then raise exception 'solo un workspace va sin padre' using errcode = 'AG400'; end if;
    new.ancestros := '{}';
  else
    select * into p from agora.nodo where id = new.padre_id;
    if not found or p.org_id <> new.org_id then raise exception 'el padre no es de la misma organización' using errcode = 'AG400'; end if;
    if (new.tipo = 'dominio' and p.tipo <> 'workspace') or (new.tipo = 'categoria' and p.tipo <> 'dominio') or new.tipo = 'workspace' then
      raise exception 'jerarquía inválida: % bajo %', new.tipo, p.tipo using errcode = 'AG400';
    end if;
    new.ancestros := p.ancestros || p.id;
  end if;
  return new;
end $$;
drop trigger if exists tg_nodo_coherente on agora.nodo;
create trigger tg_nodo_coherente before insert or update of padre_id, tipo, org_id on agora.nodo
  for each row execute function agora_priv.nodo_coherente();

-- --- Personas y membresías ------------------------------------------------------------------------
-- El id de una persona ES su `auth.uid()`. En el laboratorio son ficticias.
create table if not exists agora.persona (
  id        uuid primary key,
  org_id    uuid not null references agora.org (id) on delete cascade,
  nombre    text not null,
  iniciales text not null check (length(iniciales) between 1 and 3),
  titulo    text not null default '',
  correo    text check (correo is null or correo ~ '[@.]example\.(com|mx|net|org)$')
);

-- Rol en un alcance: nodo nulo = toda la organización. Los permisos se heredan hacia abajo.
-- `finanzas` aprueba montos sobre el umbral en TODA la organización, presupuestos y la subida de un tope de
-- gasto (con la Propietaria). `contabilidad` acepta o devuelve la póliza propuesta.
create table if not exists agora.membresia (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references agora.org (id) on delete cascade,
  persona_id uuid not null references agora.persona (id) on delete cascade,
  nodo_id    uuid references agora.nodo (id) on delete cascade,
  rol        text not null check (rol in ('propietario', 'administrador', 'aprobador', 'editor', 'colaborador', 'lector', 'finanzas', 'contabilidad'))
);
create unique index if not exists ux_membresia on agora.membresia (persona_id, coalesce(nodo_id, '00000000-0000-0000-0000-000000000000'::uuid), rol);

create or replace function agora_priv.membresia_coherente() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from agora.persona p where p.id = new.persona_id and p.org_id = new.org_id) then
    raise exception 'la persona no es de esa organización' using errcode = 'AG400';
  end if;
  if new.nodo_id is not null and not exists (select 1 from agora.nodo n where n.id = new.nodo_id and n.org_id = new.org_id) then
    raise exception 'el alcance no es de esa organización' using errcode = 'AG400';
  end if;
  if new.rol in ('propietario', 'finanzas', 'contabilidad') and new.nodo_id is not null then
    raise exception 'el rol % es de toda la organización', new.rol using errcode = 'AG400';
  end if;
  return new;
end $$;
drop trigger if exists tg_membresia_coherente on agora.membresia;
create trigger tg_membresia_coherente before insert or update on agora.membresia
  for each row execute function agora_priv.membresia_coherente();

-- --- Las funciones que leen las políticas (definer: leen sin pasar por RLS, devuelven solo un sí/no) --
create or replace function agora_priv.persona() returns uuid language sql stable security definer set search_path = '' as $$
  select auth.uid()
$$;

create or replace function agora_priv.org_de_persona() returns uuid language sql stable security definer set search_path = '' as $$
  select p.org_id from agora.persona p where p.id = auth.uid()
$$;

create or replace function agora_priv.linaje(n uuid) returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce((select x.ancestros || x.id from agora.nodo x where x.id = n), '{}'::uuid[])
$$;

/** ¿La persona de la sesión tiene alguno de estos roles en la org, en el nodo o en uno de sus ancestros? */
create or replace function agora_priv.tiene_rol(o uuid, n uuid, roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from agora.membresia m
     where m.persona_id = auth.uid() and m.org_id = o and m.rol = any (roles)
       and (m.nodo_id is null or (n is not null and m.nodo_id = any (agora_priv.linaje(n)))))
$$;

/** Lo que la persona puede leer: el nodo si tiene membresía en él, en un ancestro o en un descendiente. */
create or replace function agora_priv.ve_nodo(o uuid, n uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from agora.membresia m
     where m.persona_id = auth.uid() and m.org_id = o
       and (m.nodo_id is null or n is null or m.nodo_id = any (agora_priv.linaje(n))
            or n = any (agora_priv.linaje(m.nodo_id))))
$$;

create or replace function agora_priv.es_de_org(o uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.membresia m where m.persona_id = auth.uid() and m.org_id = o)
$$;

/** Los roles efectivos de una persona CUALQUIERA en un nodo (lo usa el disparador de aprobaciones). */
create or replace function agora_priv.roles_de(p uuid, o uuid, n uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m.rol), '{}') from agora.membresia m
   where m.persona_id = p and m.org_id = o and (m.nodo_id is null or (n is not null and m.nodo_id = any (agora_priv.linaje(n))))
$$;

-- --- La matriz de aprobación (dato de la organización, no código) ------------------------------------
-- Cada regla dice, para una clase de cambio y una condición, qué FIRMAS hacen falta. `firmas` es una lista
-- de ranuras; cada ranura, los roles que la llenan. [["finanzas"]] = una firma de Finanzas;
-- [["propietario"],["finanzas"]] = dos firmas distintas, una de cada. Una persona llena una sola ranura.
create table if not exists agora.matriz_regla (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references agora.org (id) on delete cascade,
  clase     text not null check (clase in ('editar', 'crear_item', 'mover_fecha', 'asignar', 'asignar_externo', 'cambiar_monto',
                                           'presupuesto', 'tope_gasto', 'tope_cuota', 'estructura', 'reprogramar')),
  condicion text not null default 'siempre' check (condicion in ('siempre', 'monto_hasta_umbral', 'monto_sobre_umbral')),
  firmas    jsonb not null check (jsonb_typeof(firmas) = 'array' and jsonb_array_length(firmas) between 1 and 3),
  unique (org_id, clase, condicion)
);

-- Una decisión de la organización que cambia una garantía por defecto (p. ej. quitar la segregación de
-- funciones). Va por el freno: queda la cita textual de quien la tomó.
create table if not exists agora.decision_org (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references agora.org (id) on delete cascade,
  tipo      text not null check (tipo in ('segregacion_off', 'segregacion_on')),
  quien     uuid not null,
  cita      text not null check (length(cita) >= 8),
  cuando    timestamptz not null default now()
);
