-- =============================================================================
-- Soporte SAP · propuesta de esquema (v2, tras la revisión independiente del C3)
--
-- NO se aplica a ninguna base. Se valida en un Postgres EFÍMERO (PGlite, en proceso) con un
-- Supabase mínimo imitado (pruebas/esquema.ts y pruebas/aislamiento.ts) y se tira. Idempotente:
-- la prueba lo aplica dos veces.
--
-- Tenencia en árbol: laboratorio → consultora → cliente. Toda tabla de datos lleva consultora_id
-- (y cliente_id cuando el dato es de un cliente), RLS con `force` y políticas por rol:
--   · `authenticated`        las personas, por `auth.uid()`;
--   · `soporte_sap_agente`   el agente (ejecuta un modelo): lee y PROPONE, nunca aprueba;
--   · `soporte_sap_ingesta`  el lector de documentos (sin modelo): lee originales, escribe campos
--                            por revisar;
--   · `soporte_sap_plataforma` los jobs declarados (export por tenant, restauración, retención).
-- Los tres primeros roles de servicio van acotados a UNA consultora por tarea, y esa consultora sale del
-- claim `consultora` del JWT de la tarea (`request.jwt.claims`), que firma quien encola la tarea
-- y verifica la pasarela: ningún proceso que corre el modelo fija su propio alcance. Ninguno tiene
-- bypassrls y ninguna superficie usa service_role (C7).
--
-- El cuarto, `soporte_sap_metricas`, es el job de la capa semántica (dbt): para dar totales tiene
-- que leer a todas las consultoras, así que su acotamiento es otro: solo columnas SIN TEXTO
-- (privilegios por columna: ni títulos, ni descripciones, ni contenido, ni nombres) y solo escribe
-- en `ss_metrica`. Lo que no puede leer no lo puede filtrar.
--
-- El laboratorio NO lee la operación de una consultora por ser laboratorio: lee lo que la
-- consultora le escaló (`ss_escalamiento`) y, con un acceso motivado que otorga la consultora
-- (máximo 72 h), los originales de un cliente (D14).
-- Las funciones de apoyo viven en `ss_priv`, un esquema que la API no expone.
-- =============================================================================

create schema if not exists ss_priv;

-- pgcrypto vive en `extensions`, como en Supabase: firma de tareas (H-21) y seudónimos con sal (H-05).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
declare r text;
begin
  foreach r in array array['soporte_sap_agente', 'soporte_sap_ingesta', 'soporte_sap_plataforma', 'soporte_sap_metricas'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin nobypassrls', r);
    end if;
    -- Y si ya existía, se corrige: `if not exists` no tocaba un rol creado antes con bypassrls (PRP-010 H-14).
    execute format('alter role %I nologin nobypassrls', r);
  end loop;
end $$;

-- --- Organizaciones y membresía ----------------------------------------------------------

create table if not exists public.ss_organizacion (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('laboratorio', 'consultora', 'cliente')),
  nombre     text not null,
  padre_id   uuid references public.ss_organizacion (id) on delete restrict,
  creada_en  timestamptz not null default now(),
  -- El perfil que leen el pricing y la capa semántica: tamaño (S/M/L), sistema y usuarios SAP.
  tamano     text check (tamano in ('S', 'M', 'L')),
  sistema    text check (sistema in ('ECC', 'S4HANA')),
  usuarios_sap integer check (usuarios_sap >= 0),
  constraint ss_org_arbol check ((tipo = 'laboratorio') = (padre_id is null)),
  constraint ss_sistema_es_de_cliente check (sistema is null or tipo = 'cliente')
);

create table if not exists public.ss_miembro (
  organizacion_id uuid not null references public.ss_organizacion (id) on delete cascade,
  usuario_id      uuid not null,
  rol             text not null check (rol in ('superadmin', 'experto', 'consultor', 'usuario_cliente')),
  primary key (organizacion_id, usuario_id)
);

create or replace function ss_priv.valida_arbol() returns trigger language plpgsql set search_path = '' as $$
declare tipo_padre text;
begin
  if new.padre_id is null then return new; end if;
  select o.tipo into tipo_padre from public.ss_organizacion o where o.id = new.padre_id;
  if (new.tipo = 'consultora' and tipo_padre is distinct from 'laboratorio')
     or (new.tipo = 'cliente' and tipo_padre is distinct from 'consultora') then
    raise exception 'árbol inválido: % no cuelga de %', new.tipo, coalesce(tipo_padre, 'nada');
  end if;
  return new;
end $$;
drop trigger if exists ss_org_valida_arbol on public.ss_organizacion;
create trigger ss_org_valida_arbol before insert or update on public.ss_organizacion
  for each row execute function ss_priv.valida_arbol();

create or replace function ss_priv.valida_rol() returns trigger language plpgsql set search_path = '' as $$
declare t text;
begin
  select o.tipo into t from public.ss_organizacion o where o.id = new.organizacion_id;
  if (new.rol in ('superadmin', 'experto') and t <> 'laboratorio')
     or (new.rol = 'consultor' and t <> 'consultora')
     or (new.rol = 'usuario_cliente' and t <> 'cliente') then
    raise exception 'el rol % no existe en una organización de tipo %', new.rol, t;
  end if;
  return new;
end $$;
drop trigger if exists ss_miembro_valida_rol on public.ss_miembro;
create trigger ss_miembro_valida_rol before insert or update on public.ss_miembro
  for each row execute function ss_priv.valida_rol();

-- --- Funciones de apoyo (security definer: leen membresía y árbol sin recursión de RLS) ----

create or replace function ss_priv.uuid_o_nulo(t text) returns uuid language sql immutable set search_path = '' as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end
$$;

create or replace function ss_priv.padre_de(org uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select o.padre_id from public.ss_organizacion o where o.id = org
$$;

create or replace function ss_priv.es_laboratorio() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
                 where m.usuario_id = auth.uid() and o.tipo = 'laboratorio')
$$;

create or replace function ss_priv.es_superadmin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
                 where m.usuario_id = auth.uid() and o.tipo = 'laboratorio' and m.rol = 'superadmin')
$$;

create or replace function ss_priv.rol_en(org uuid) returns text language sql stable security definer set search_path = '' as $$
  select m.rol from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = org
$$;

-- Una consultora la ven sus consultores; la organización del laboratorio, sus miembros.
create or replace function ss_priv.ve_consultora(c uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = c)
$$;

-- Un cliente lo ven sus usuarios y los consultores de SU consultora. El laboratorio, no por serlo.
create or replace function ss_priv.ve_cliente(cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.organizacion_id = cli)
      or exists (select 1 from public.ss_miembro m where m.usuario_id = auth.uid() and m.rol = 'consultor'
                 and m.organizacion_id = ss_priv.padre_de(cli))
$$;

-- El seudónimo de una persona en la cadena de eventos: estable, no reversible sin la tabla de miembros.
-- Con SAL (PRP-010 H-05): `md5(uuid)` lo revertía cualquiera que leyera `ss_miembro`, laboratorio incluido. La sal
-- vive en `ss_priv.sal_seudonimos`, que solo lee esta función; se carga al desplegar (paso humano, fuera del chat).
-- Sin sal no hay seudónimo, y las políticas que lo comparan no dejan pasar a nadie.
create table if not exists ss_priv.sal_seudonimos (
  id  smallint primary key default 1 check (id = 1),
  sal text not null check (length(sal) >= 32)
);
revoke all on ss_priv.sal_seudonimos from public;
create or replace function ss_priv.seudonimo(u uuid) returns text language sql stable security definer set search_path = '' as $$
  select 'usr-' || left(encode(extensions.hmac(u::text, s.sal, 'sha256'), 'hex'), 12) from ss_priv.sal_seudonimos s where s.id = 1
$$;

-- El seudónimo de quien está en la sesión. Las políticas y los disparadores usan esta, no `seudonimo(uuid)`: con esa y
-- `ss_miembro`, el laboratorio calculaba el seudónimo de cualquiera (PRP-010, tercera revisión: R3-18).
create or replace function ss_priv.mi_seudonimo() returns text language sql stable security definer set search_path = '' as $$
  select ss_priv.seudonimo(auth.uid())
$$;

-- La consultora de la tarea: el claim `consultora` del JWT que firmó quien encoló la tarea.
-- El alcance de un rol de servicio se VERIFICA en la base (PRP-010 H-21, DP-2). Antes, la consultora salía de
-- `request.jwt.claims`, que cualquier sesión con SQL fija con `set_config` (dentro de la misma consulta): con una tarea
-- de A se leía B. Ahora la sesión presenta el token CRUDO (`ss.tarea`, o la cabecera `x-tarea` vía PostgREST) y la base
-- comprueba la firma del orquestador, el vencimiento y que el rol del token sea el de la sesión. Sin token válido, la
-- consultora es nula y las políticas no dejan ver nada. pgcrypto (en `extensions`) se crea al principio del esquema.

-- El secreto con el que firma el orquestador. Solo lo lee `firma_valida` (security definer); ningún rol de la API
-- lo ve. Se carga al desplegar, como paso humano y fuera del chat; sin él, ninguna tarea tiene alcance.
create table if not exists ss_priv.secreto_tareas (
  id      smallint primary key default 1 check (id = 1),
  secreto text not null check (length(secreto) >= 32)
);
revoke all on ss_priv.secreto_tareas from public;

create or replace function ss_priv.b64url(t text) returns bytea language sql immutable set search_path = '' as $$
  select decode(rpad(translate(t, '-_', '+/'), (length(t) + 3) / 4 * 4, '='), 'base64')
$$;

-- ¿La firma es del orquestador? Se comparan los resúmenes, no los sellos: así el tiempo de respuesta no dice
-- cuántos caracteres del sello coinciden.
create or replace function ss_priv.firma_valida(cuerpo text, sello text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select extensions.digest(rtrim(translate(encode(extensions.hmac(cuerpo, s.secreto, 'sha256'), 'base64'), '+/', '-_'), '='), 'sha256')
                        = extensions.digest(sello, 'sha256')
                   from ss_priv.secreto_tareas s where s.id = 1), false)
$$;

-- Corre con los permisos de quien llama: `current_user` es el rol de la sesión, y el token tiene que ser de ESE rol.
create or replace function ss_priv.claims_de_tarea() returns jsonb language plpgsql stable set search_path = '' as $$
declare
  token  text := coalesce(nullif(current_setting('ss.tarea', true), ''),
                          nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-tarea');
  claims jsonb;
begin
  if token is null or token !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then return null; end if;
  if not ss_priv.firma_valida(split_part(token, '.', 1), split_part(token, '.', 2)) then return null; end if;
  claims := convert_from(ss_priv.b64url(split_part(token, '.', 1)), 'utf8')::jsonb;
  if claims ->> 'rol' is distinct from current_user then return null; end if;
  if coalesce((claims ->> 'exp')::bigint, 0) <= (extract(epoch from clock_timestamp()) * 1000)::bigint then return null; end if;
  return claims;
exception when others then
  return null;
end $$;

create or replace function ss_priv.consultora_de_tarea() returns uuid language sql stable set search_path = '' as $$
  select ss_priv.uuid_o_nulo(ss_priv.claims_de_tarea() ->> 'consultora')
$$;

create or replace function ss_priv.solo_agregar() returns trigger language plpgsql set search_path = '' as $$
begin
  -- D8 (PRP-012): la cadena y el crudo son la evidencia del servicio y viven lo que el contrato. Tras la gracia de
  -- una baja (con su export), se borran con su tenant; antes, nadie. `to_jsonb`: el crudo no tiene cliente.
  if tg_op = 'DELETE' and ss_priv.baja_vencida(old.consultora_id, (to_jsonb(old) ->> 'cliente_id')::uuid) then
    return old;
  end if;
  raise exception '% es de solo agregar: no se cambia ni se borra', tg_table_name;
end $$;

-- --- Incidencias y escalamiento ------------------------------------------------------------

create table if not exists public.ss_incidencia (
  id                   uuid primary key default gen_random_uuid(),
  consultora_id        uuid not null references public.ss_organizacion (id),
  cliente_id           uuid not null references public.ss_organizacion (id),
  titulo               text not null,
  descripcion          text not null default '',
  sistema              text,
  modulo               text,
  componente           text,
  transaccion          text,
  mensaje_error        text,
  categoria            text,
  impacto              smallint check (impacto between 1 and 3),
  urgencia             smallint check (urgencia between 1 and 3),
  prioridad            text check (prioridad in ('P1', 'P2', 'P3', 'P4')),
  complejidad          text check (complejidad in ('baja', 'media', 'alta')),
  -- La regla del grafo con la que se resolvió (identificador, no texto): el reuso del conocimiento.
  regla_aplicada       text check (regla_aplicada ~ '^SS-[A-Z0-9-]+$'),
  -- La cuarentena NO es un estado de atención: solo impide que el caso entre al sandbox.
  estado               text not null default 'nueva'
                       check (estado in ('nueva', 'en_atencion', 'espera_cliente', 'en_revision', 'resuelta', 'cerrada')),
  zona_origen          text not null default 'America/Mexico_City',
  origen               jsonb not null default '{}'::jsonb,
  creada_en            timestamptz not null default now(),
  primera_respuesta_en timestamptz,
  resuelta_en          timestamptz,
  cerrada_en           timestamptz
);

-- security definer: lee el árbol de organizaciones como dueño. Sin esto, el agente (que no lee
-- ss_organizacion) no podía actualizar su propia incidencia y la categorización fallaba (PRP-010 H-09).
create or replace function ss_priv.cliente_de_su_consultora() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if ss_priv.padre_de(new.cliente_id) is distinct from new.consultora_id
     or not exists (select 1 from public.ss_organizacion o where o.id = new.cliente_id and o.tipo = 'cliente') then
    raise exception 'el cliente % no es de la consultora %', new.cliente_id, new.consultora_id;
  end if;
  return new;
end $$;
drop trigger if exists ss_incidencia_tenencia on public.ss_incidencia;
create trigger ss_incidencia_tenencia before insert or update on public.ss_incidencia
  for each row execute function ss_priv.cliente_de_su_consultora();

-- El vocabulario de personal y nómina, el MISMO de src/anonimiza.ts (`CONTEXTO_PERSONAL`; una prueba vigila que
-- no se separen). Con él la base sostiene el piso: una incidencia de nómina o RR. HH. no queda en P3 o P4.
create or replace function ss_priv.contexto_personal(t text) returns boolean language sql immutable set search_path = '' as $$
  select t ~* '\m(n[oó]minas?|finiquitos?|aguinaldos?|imss|idse|sua|infonavit|ptu|incapacidad(?:es)?|vacaciones|emplead[oa]s?|trabajador(?:a|es|as)?|colaborador(?:a|es|as)?|liquidaci[oó]n|sueldos?|salarios?|quincenas?|recibos? de pago|pa20|pa30|pa40|pc00_\w+|infotipos?|hcm|personal)\M'
$$;

-- Lo que la incidencia NO deja escribir a quien entra por la API (PRP-010 H-16, H-15, H-09). La fecha de alta y
-- las marcas del reloj las pone la base, y las marcas salen de los eventos (`ss_evento_aplica`). La prioridad la fija
-- la primera categorización; después cambia solo con un evento CAMBIO_PRIORIDAD de una persona, con motivo. El
-- agente no cierra ni resuelve. La plataforma (restauración) y las migraciones no pasan por aquí: traen historia.
create or replace function ss_priv.incidencia_campos_de_la_base() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'soporte_sap_agente', 'soporte_sap_ingesta') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creada_en := now();
    new.primera_respuesta_en := null; new.resuelta_en := null; new.cerrada_en := null;
    new.estado := 'nueva'; new.prioridad := null;
    return new;
  end if;
  if new.creada_en is distinct from old.creada_en or new.primera_respuesta_en is distinct from old.primera_respuesta_en
     or new.resuelta_en is distinct from old.resuelta_en or new.cerrada_en is distinct from old.cerrada_en then
    raise exception 'las fechas de la incidencia las pone la base desde sus eventos';
  end if;
  if old.prioridad is not null and new.prioridad is distinct from old.prioridad then
    raise exception 'la prioridad cambia con un evento CAMBIO_PRIORIDAD de una persona, con motivo';
  end if;
  if new.prioridad in ('P3', 'P4') and ss_priv.contexto_personal(new.titulo || ' ' || new.descripcion) then
    raise exception 'piso de nómina y RR. HH.: no queda debajo de P2 sin que una persona lo baje con motivo';
  end if;
  -- Lo que declaró el cliente no se reescribe, y la prioridad inicial la fija la categorización del agente: una
  -- persona la cambia con un evento CAMBIO_PRIORIDAD, que queda en la cadena (PRP-010, tercera revisión: R3-11).
  if new.impacto is distinct from old.impacto or new.urgencia is distinct from old.urgencia then
    raise exception 'el impacto y la urgencia son lo que declaró el cliente';
  end if;
  if old.prioridad is null and new.prioridad is not null and current_user is distinct from 'soporte_sap_agente' then
    raise exception 'la prioridad inicial la fija la categorización; una persona la cambia con un evento CAMBIO_PRIORIDAD';
  end if;
  if new.estado = 'espera_cliente' and new.estado is distinct from old.estado then
    raise exception 'la espera del cliente es un evento ESPERA_CLIENTE de una persona, con lo que se le pide';
  end if;
  if new.estado in ('resuelta', 'cerrada') and new.estado is distinct from old.estado then
    raise exception 'resolver o cerrar es un evento (RESUELTA, CERRADA) de una persona, con su fecha';
  end if;
  return new;
end $$;
drop trigger if exists ss_incidencia_campos on public.ss_incidencia;
create trigger ss_incidencia_campos before insert or update on public.ss_incidencia
  for each row execute function ss_priv.incidencia_campos_de_la_base();

-- Lo que la consultora (o el agente, al mandar a la sala) escala al laboratorio. Sin escalamiento,
-- el laboratorio no lee la incidencia.
create table if not exists public.ss_escalamiento (
  incidencia_id uuid primary key references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  motivo        text not null check (length(motivo) >= 10),
  escalada_por  text not null,
  creada_en     timestamptz not null default now()
);

create or replace function ss_priv.lab_trabaja(inc uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select ss_priv.es_laboratorio() and exists (select 1 from public.ss_escalamiento e where e.incidencia_id = inc)
$$;

-- Las tablas hijas copian la tenencia de su incidencia; este disparador la ata (y de paso exige
-- que quien escribe vea la incidencia: el select corre con su RLS).
create or replace function ss_priv.tenencia_de_incidencia() returns trigger language plpgsql set search_path = '' as $$
declare c uuid; cl uuid;
begin
  if new.incidencia_id is null then
    if ss_priv.padre_de(new.cliente_id) is distinct from new.consultora_id then
      raise exception 'el cliente % no es de la consultora %', new.cliente_id, new.consultora_id;
    end if;
    return new;
  end if;
  select i.consultora_id, i.cliente_id into c, cl from public.ss_incidencia i where i.id = new.incidencia_id;
  if c is null then raise exception 'la incidencia % no existe o no es visible', new.incidencia_id; end if;
  if c <> new.consultora_id or cl <> new.cliente_id then
    raise exception 'la tenencia de % no es la de su incidencia', tg_table_name;
  end if;
  return new;
end $$;

-- --- Eventos y adjuntos -------------------------------------------------------------------

create table if not exists public.ss_evento (
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  seq           integer not null check (seq >= 1),
  tipo          text not null,
  datos         jsonb not null default '{}'::jsonb,
  actor         text not null,
  fecha         timestamptz not null,
  anterior      text not null,
  hash          text not null,
  primary key (incidencia_id, seq)
);
drop trigger if exists ss_evento_solo_agregar on public.ss_evento;
create trigger ss_evento_solo_agregar before update or delete on public.ss_evento
  for each row execute function ss_priv.solo_agregar();

-- Quien escribe un evento no elige su fecha ni su actor: la fecha va al reloj de la base (±) y el
-- actor es el seudónimo de la sesión, o `agente:`/`ingesta:` para los roles de servicio.
create or replace function ss_priv.evento_honesto() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.fecha < now() - interval '5 minutes' or new.fecha > now() + interval '1 minute' then
    raise exception 'la fecha de un evento la da el reloj de la base, no quien escribe';
  end if;
  -- `is distinct from`, no `<>`: sin sal el seudónimo es NULL, y `<>` con NULL no rechazaba (falla cerrado, H-05).
  if current_user = 'authenticated' and new.actor is distinct from ss_priv.mi_seudonimo() then
    raise exception 'el actor de un evento humano es el seudónimo de su sesión';
  end if;
  if current_user = 'soporte_sap_agente' and new.actor not like 'agente:%' then
    raise exception 'el agente firma sus eventos como agente';
  end if;
  return new;
end $$;
drop trigger if exists ss_evento_honesto on public.ss_evento;
create trigger ss_evento_honesto before insert on public.ss_evento
  for each row execute function ss_priv.evento_honesto();

-- La CADENA la calcula la base (PRP-010 H-13): quien escribe no elige `seq`, `anterior` ni `hash` (antes la base
-- aceptaba los que le dieran). La fórmula es la de src/cadena.ts: sha256 del JSON canónico del registro completo
-- (`v`, incidencia, seq, fecha ISO en milisegundos, tipo, actor, datos, anterior), y el génesis, el de la incidencia.
-- `pruebas/cierre-base.ts` verifica con `verificaCadena` (el código) la cadena que dejó la base.
create or replace function ss_priv.canonico(v jsonb) returns text language plpgsql immutable set search_path = '' as $$
declare r text;
begin
  case jsonb_typeof(v)
    when 'object' then
      select '{' || coalesce(string_agg(to_json(key)::text || ':' || ss_priv.canonico(value), ',' order by key collate "C"), '') || '}'
        into r from jsonb_each(v);
    when 'array' then
      select '[' || coalesce(string_agg(ss_priv.canonico(value), ',' order by ord), '') || ']'
        into r from jsonb_array_elements(v) with ordinality as x(value, ord);
    else
      r := v::text;
  end case;
  return r;
end $$;

create or replace function ss_priv.sha256(t text) returns text language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(t, 'sha256'), 'hex')
$$;

-- La cabeza de la cadena, como dueño: quien escribe puede no ver todos los eventos de la incidencia.
create or replace function ss_priv.cabeza_de(inc uuid) returns table (seq integer, hash text) language sql stable security definer set search_path = '' as $$
  select e.seq, e.hash from public.ss_evento e where e.incidencia_id = inc order by e.seq desc limit 1
$$;

create or replace function ss_priv.evento_encadena() returns trigger language plpgsql set search_path = '' as $$
declare
  c_seq  integer;
  c_hash text;
begin
  if current_user not in ('authenticated', 'soporte_sap_agente', 'soporte_sap_ingesta') then
    return new;  -- la historia (semilla, restauración) trae su cadena; la verifica la restauración (H-08)
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.incidencia_id::text, 0));
  select c.seq, c.hash into c_seq, c_hash from ss_priv.cabeza_de(new.incidencia_id) c;
  new.seq := coalesce(c_seq, 0) + 1;
  new.anterior := coalesce(c_hash, ss_priv.sha256(ss_priv.canonico(jsonb_build_object('genesis', new.incidencia_id::text))));
  new.fecha := date_trunc('milliseconds', now());
  new.hash := ss_priv.sha256(ss_priv.canonico(jsonb_build_object(
    'v', 1, 'incidencia', new.incidencia_id::text, 'seq', new.seq,
    'fecha', to_char(new.fecha at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tipo', new.tipo, 'actor', new.actor, 'datos', new.datos, 'anterior', new.anterior)));
  return new;
end $$;
drop trigger if exists ss_evento_cadena on public.ss_evento;
create trigger ss_evento_cadena before insert on public.ss_evento
  for each row execute function ss_priv.evento_encadena();

-- Quién emite qué (PRP-010 H-16, H-17, DP-4). Responder, pausar el reloj, resolver, cerrar, reabrir y cambiar la
-- prioridad son actos de una PERSONA de la consultora: una acción de la máquina no cuenta como primera respuesta
-- ni pausa el SLA. El cambio de prioridad lleva la nueva y su motivo.
-- Leen la incidencia como dueño: quien emite el evento puede no verla entera.
create or replace function ss_priv.prioridad_de(inc uuid) returns text language sql stable security definer set search_path = '' as $$
  select i.prioridad from public.ss_incidencia i where i.id = inc
$$;
create or replace function ss_priv.categorizacion_valida(inc uuid, p text) returns boolean language sql stable security definer set search_path = '' as $$
  select p is not null
     and not exists (select 1 from public.ss_evento e where e.incidencia_id = inc and e.tipo = 'CATEGORIZADA')
     and exists (select 1 from public.ss_incidencia i where i.id = inc and i.prioridad = p)
$$;

create or replace function ss_priv.evento_de_quien_puede() returns trigger language plpgsql set search_path = '' as $$
begin
  -- `is not distinct from`, no `=`: para quien no es miembro, `rol_en` es NULL, y `not (… and NULL)` es NULL, que no
  -- lanza. Con `=`, el cliente y el laboratorio respondían, resolvían y cambiaban la prioridad (PRP-010, fase 4).
  if new.tipo in ('PRIMERA_RESPUESTA', 'ESPERA_CLIENTE', 'RESUELTA', 'CERRADA', 'REABIERTA', 'CAMBIO_PRIORIDAD')
     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor') then
    raise exception 'un evento % lo emite una persona de la consultora, no %', new.tipo, current_user;
  end if;
  if new.tipo = 'CAMBIO_PRIORIDAD' and (coalesce(new.datos->>'prioridad', '') not in ('P1', 'P2', 'P3', 'P4')
     or length(coalesce(new.datos->>'motivo', '')) < 10) then
    raise exception 'un cambio de prioridad lleva la nueva prioridad y un motivo';
  end if;
  -- Una persona emite solo actos de persona. Los eventos de la máquina (categorizar, preparar un plan, leer un
  -- adjunto, el presupuesto) son del agente: con ellos, el cliente fijaba la prioridad que mide el SLA y cualquiera
  -- agotaba el presupuesto del mes de su consultora (PRP-010, tercera revisión: R3-01 y R3-10).
  if current_user = 'authenticated' and new.tipo not in ('RECIBIDA', 'PRIMERA_RESPUESTA', 'ESPERA_CLIENTE', 'RESPUESTA_CLIENTE',
     'CAMBIO_PRIORIDAD', 'RESUELTA', 'REABIERTA', 'CERRADA', 'ESCALADA', 'APROBADA', 'RECHAZADA', 'A_REVISION', 'NOTA',
     'IMPUGNADA', 'IMPUGNACION_RESUELTA') then
    raise exception 'un evento % lo emite el agente, no una persona', new.tipo;
  end if;
  -- Escalar al laboratorio es de la consultora (DP-3); decidir en la sala, de una persona del laboratorio. Las
  -- migraciones (el dueño) traen historia y no pasan por aquí.
  if current_user not in ('authenticated', 'soporte_sap_agente', 'soporte_sap_ingesta', 'soporte_sap_plataforma') then
    return new;
  end if;
  if new.tipo = 'ESCALADA' and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor') then
    raise exception 'al laboratorio lo escala la consultora, a su nombre, no %', current_user;
  end if;
  if new.tipo in ('APROBADA', 'RECHAZADA', 'A_REVISION') and not (current_user = 'authenticated' and ss_priv.es_laboratorio() is not distinct from true) then
    raise exception 'una decisión de la sala la registra la persona del laboratorio que decide, no %', current_user;
  end if;
  -- La prioridad que mide el SLA sale de la ÚNICA categorización, y es la que fijó la base con su piso (R3-01).
  if new.tipo = 'CATEGORIZADA' and current_user = 'soporte_sap_agente'
     and not ss_priv.categorizacion_valida(new.incidencia_id, new.datos->>'prioridad') then
    raise exception 'la categorización es una, y dice la prioridad que fijó la base (con su piso)';
  end if;
  -- Un cambio de prioridad cambia la prioridad: P1 → P1 reiniciaba el reloj con un contrato «desde el cambio» (R3-02).
  if new.tipo = 'CAMBIO_PRIORIDAD' and (new.datos->>'prioridad') is not distinct from ss_priv.prioridad_de(new.incidencia_id) then
    raise exception 'un cambio de prioridad cambia la prioridad';
  end if;
  -- La primera respuesta es un MENSAJE al cliente (DP-4): sin su texto, no cuenta (R3-07).
  if new.tipo = 'PRIMERA_RESPUESTA' and length(coalesce(new.datos->>'mensaje', '')) < 5 then
    raise exception 'la primera respuesta es un mensaje al cliente: lleva su texto';
  end if;
  -- La pausa unilateral (PRP-010, fase 4): pausar dice qué se le pide al cliente, y la respuesta del cliente la
  -- registra una persona, del cliente o de su consultora. Así el cliente reanuda el reloj sin depender de nadie.
  if new.tipo = 'ESPERA_CLIENTE' and length(coalesce(new.datos->>'pide', '')) < 10 then
    raise exception 'pausar el reloj lleva lo que se le pide al cliente';
  end if;
  if new.tipo = 'RESPUESTA_CLIENTE' and not (current_user = 'authenticated'
     and (ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor' or ss_priv.rol_en(new.cliente_id) is not distinct from 'usuario_cliente')) then
    raise exception 'la respuesta del cliente la registra una persona del cliente o de su consultora, no %', current_user;
  end if;
  return new;
end $$;
drop trigger if exists ss_evento_quien on public.ss_evento;
create trigger ss_evento_quien before insert on public.ss_evento
  for each row execute function ss_priv.evento_de_quien_puede();

-- Lo que el evento le hace a la incidencia, como dueño: ningún rol de la API escribe las marcas directo.
create or replace function ss_priv.evento_aplica() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'PRIMERA_RESPUESTA' then
    update public.ss_incidencia set primera_respuesta_en = coalesce(primera_respuesta_en, new.fecha) where id = new.incidencia_id;
  elsif new.tipo = 'RESUELTA' then
    update public.ss_incidencia set resuelta_en = new.fecha, estado = 'resuelta' where id = new.incidencia_id;
  elsif new.tipo = 'CERRADA' then
    update public.ss_incidencia set cerrada_en = new.fecha, estado = 'cerrada' where id = new.incidencia_id;
  elsif new.tipo = 'REABIERTA' then
    update public.ss_incidencia set resuelta_en = null, cerrada_en = null, estado = 'en_atencion' where id = new.incidencia_id;
  elsif new.tipo = 'CAMBIO_PRIORIDAD' then
    update public.ss_incidencia set prioridad = new.datos->>'prioridad' where id = new.incidencia_id;
  elsif new.tipo = 'ESPERA_CLIENTE' then
    update public.ss_incidencia set estado = 'espera_cliente' where id = new.incidencia_id;
  elsif new.tipo = 'RESPUESTA_CLIENTE' then
    update public.ss_incidencia set estado = 'en_atencion' where id = new.incidencia_id and estado = 'espera_cliente';
  end if;
  return new;
end $$;
drop trigger if exists ss_evento_aplica on public.ss_evento;
create trigger ss_evento_aplica after insert on public.ss_evento
  for each row execute function ss_priv.evento_aplica();

create table if not exists public.ss_adjunto (
  id            uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ruta          text not null,
  tipo_mime     text not null,
  bytes         integer not null check (bytes > 0),
  via           text not null check (via in ('capa0', 'xml', 'ocr_local', 'sin_extraccion')),
  -- D8 (PRP-012): cuándo se borraron los bytes. La fila y sus campos revisados se quedan (`ss_campo_extraido`
  -- cuelga de ella en cascada): se borran los bytes y se marca, nunca la fila.
  original_borrado_en timestamptz,
  creado_en     timestamptz not null default now(),
  unique (incidencia_id, sha256),
  constraint ss_ruta_de_su_tenant check (ruta = consultora_id::text || '/' || cliente_id::text || '/' || incidencia_id::text || '/' || sha256)
);

-- Diez adjuntos por INCIDENCIA, no por lote (PRP-010 H-23): la ingesta los contaba dentro de cada subida, así que
-- subir de cinco en cinco no tenía tope. El mismo número que `adjuntosMaximos` de la ingesta; una prueba los ata.
create or replace function ss_priv.adjuntos_por_incidencia() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.ss_adjunto a where a.incidencia_id = new.incidencia_id) >= 10 then
    raise exception 'la incidencia ya tiene 10 adjuntos: es el máximo por incidencia';
  end if;
  return new;
end $$;
drop trigger if exists ss_adjunto_tope on public.ss_adjunto;
create trigger ss_adjunto_tope before insert on public.ss_adjunto
  for each row execute function ss_priv.adjuntos_por_incidencia();

-- Un campo por revisar no lo confirma nadie que no sea una persona, a su nombre.
create table if not exists public.ss_campo_extraido (
  adjunto_id    uuid not null references public.ss_adjunto (id) on delete cascade,
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  campo         text not null,
  valor         text not null,
  evidencia     text not null,
  confianza     numeric,
  estado        text not null default 'por_revisar' check (estado in ('por_revisar', 'confirmado', 'corregido')),
  revisado_por  uuid,
  primary key (adjunto_id, campo, valor),
  constraint ss_revisado_tiene_quien check ((estado = 'por_revisar') = (revisado_por is null))
);

-- Un campo revisado no se deshace ni lo cambia otro, y la evidencia es la del documento: con `update` sobre todas las
-- columnas, el cliente volvía a «por revisar» lo que el consultor había confirmado y reescribía la evidencia
-- (PRP-010, tercera revisión: R3-12).
create or replace function ss_priv.campo_revisado_se_queda() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'soporte_sap_agente', 'soporte_sap_ingesta') then return new; end if;
  if old.estado <> 'por_revisar' then
    raise exception 'un campo revisado no se deshace ni lo cambia otro';
  end if;
  if (new.adjunto_id, new.incidencia_id, new.consultora_id, new.cliente_id, new.campo, new.evidencia, new.confianza)
     is distinct from (old.adjunto_id, old.incidencia_id, old.consultora_id, old.cliente_id, old.campo, old.evidencia, old.confianza) then
    raise exception 'de un campo se decide su estado y, al corregirlo, su valor: la evidencia es la del documento';
  end if;
  if new.valor is distinct from old.valor and new.estado <> 'corregido' then
    raise exception 'cambiar el valor de un campo es corregirlo';
  end if;
  return new;
end $$;

-- La cuarentena guarda el MOTIVO (tipos de señal), nunca una copia del dato sensible. La base lo hace
-- cumplir: solo admite las señales del anonimizador (`SENALES` en src/anonimiza.ts; una prueba vigila que
-- las dos listas no se separen), así que un dato no entra disfrazado de señal (PRP-010 H-03).
create table if not exists public.ss_cuarentena (
  incidencia_id uuid primary key references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  senales       text[] not null,
  creada_en     timestamptz not null default now(),
  constraint ss_cuarentena_solo_senales check (cardinality(senales) > 0 and senales <@ array[
    'caso de RR. HH. o nómina: no entra al sandbox (cuarentena definitiva: nadie la revisa, D14)',
    'queda algo con forma de correo', 'queda una secuencia larga de dígitos',
    'queda un tratamiento seguido de un nombre', 'queda un posible usuario SAP']::text[])
);

-- El cliente puede impugnar una prioridad o una categoría; la resuelve su consultora.
create table if not exists public.ss_impugnacion (
  id            uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  campo         text not null check (campo in ('prioridad', 'categoria', 'complejidad', 'pausa', 'resolucion')),
  motivo        text not null check (length(motivo) >= 10),
  creada_por    uuid not null,
  estado        text not null default 'abierta' check (estado in ('abierta', 'aceptada', 'rechazada')),
  resuelta_por  uuid,
  creada_en     timestamptz not null default now(),
  resuelta_en   timestamptz,
  constraint ss_resuelta_tiene_quien check ((estado = 'abierta') = (resuelta_por is null))
);

-- La impugnación la levanta el cliente y la resuelve su consultora a su nombre: la consultora no reescribe la
-- queja (los permisos son por columna), la resolución se fecha en la base y una resuelta no se reabre
-- (PRP-010 H-10). Se puede impugnar también una pausa del reloj: si no, el cliente no tenía cómo discutirla.
create or replace function ss_priv.impugnacion_fechas() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.creada_en := now(); new.resuelta_en := null;
  elsif old.estado <> 'abierta' then
    raise exception 'una impugnación resuelta no se reabre ni se cambia';
  elsif new.estado <> 'abierta' then
    new.resuelta_en := now();
  end if;
  return new;
end $$;
drop trigger if exists ss_impugnacion_fechas on public.ss_impugnacion;
create trigger ss_impugnacion_fechas before insert or update on public.ss_impugnacion
  for each row execute function ss_priv.impugnacion_fechas();

-- --- Sandbox, propuestas y acceso motivado -----------------------------------------------

-- Segundo cerrojo, independiente del anonimizador (PRP-010 H-03): ni el agente ni un error suyo meten al
-- sandbox, que lee todo el laboratorio, un identificador con forma (correo, RFC, CURP, una secuencia larga
-- de dígitos como NSS, CLABE o teléfono). El anonimizador los cambia por marcas (`[RFC]`, `[NUMERO]`…); si
-- uno llega crudo, la fila no entra. Los nombres sin forma siguen siendo trabajo del anonimizador (H-04).
-- Las formas del cerrojo son las de la red del anonimizador (`senalesResiduales` en src/anonimiza.ts), sobre el texto
-- normalizado (NFKC: un dígito o una arroba de ancho completo cuentan como tales). La tercera revisión (2026-10-09)
-- pasó 8 de 10 formas que la versión anterior no veía: teléfonos con `/` o `_`, «at», la arroba de ancho completo, el
-- RFC partido y la CURP con guiones.
create or replace function ss_priv.sin_identificadores(t text) returns boolean language sql immutable set search_path = '' as $$
  select n !~* '(@|\marroba\M|\(at\)|\[at\]|\mpunto[[:space:]]+com\M|\mat[[:space:]]+[[:alnum:]_-]+[.][[:alpha:]]{2,}|[[:alnum:]_-]+[.](com|mx|net|org|edu|gob)\M|\m(gmail|hotmail|yahoo|icloud|protonmail)\M)'
     and n !~ '[0-9]([[:space:]().·•–/_-]{0,3}[0-9]){6,}'
     and n !~* '\m[A-ZÑ&]{3,4}[0-9]{6}'
     and n !~* '\m[A-ZÑ&]{3,4}[[:space:]_./-][0-9]{6}[[:space:]_./-]?[A-Z0-9]{3}'
  from (select normalize(t, NFKC) as n) x
$$;

create table if not exists public.ss_caso_sandbox (
  id                   uuid primary key default gen_random_uuid(),
  origen_consultora_id uuid not null references public.ss_organizacion (id),
  texto                text not null,
  campos               jsonb not null default '{}'::jsonb,
  estado               text not null default 'aprendiendo' check (estado in ('aprendiendo', 'documentado', 'propuesto')),
  creado_en            timestamptz not null default now(),
  constraint ss_sandbox_sin_identificadores check (ss_priv.sin_identificadores(texto || ' ' || campos::text))
);

-- Una propuesta la decide una persona a su nombre; lo que va al núcleo, el superadministrador (D2).
create table if not exists public.ss_propuesta (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('regla', 'caso', 'cli', 'mejora', 'mapeo', 'configuracion')),
  origen          text not null check (origen in ('sandbox', 'fde', 'autodiagnostico')),
  alcance         text not null check (alcance in ('a_medida', 'nucleo')),
  consultora_id   uuid references public.ss_organizacion (id),
  contenido       jsonb not null,
  estado          text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'rechazada')),
  propuesta_por   text not null,
  decidida_por    uuid,
  creada_en       timestamptz not null default now(),
  -- La incidencia de la que nace (D1, PRP-011). Solo viaja al insertar: un disparador guarda aparte su consultora y
  -- su cliente (`ss_priv.propuesta_origen`) y la deja en nulo, así una entrada del núcleo no dice de dónde vino.
  incidencia_id   uuid,
  constraint ss_a_medida_es_de_alguien check ((alcance = 'a_medida') = (consultora_id is not null)),
  constraint ss_decidida_tiene_quien check ((estado = 'propuesta') = (decidida_por is null))
);

-- Lo del núcleo lo leen todas las consultoras: llega GENERALIZADO o no entra, ni al proponerse ni al promoverse
-- (PRP-010 H-19). Segundo cerrojo, independiente de `generaliza`: sin identificadores con forma, sin el nombre de
-- una consultora o de un cliente, sin objetos propios (Z…, Y…, /NS/…) y sin el código de una unidad de su
-- estructura (sociedad, centro, almacén, organización de ventas…). Lee los nombres de TODAS las organizaciones,
-- también las que la RLS le oculta a quien escribe: por eso es security definer.
create or replace function ss_priv.propuesta_nucleo_generalizada() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  crudo text := new.contenido::text;
  t text := translate(lower(new.contenido::text), 'áéíóúüñ', 'aeiouun');
begin
  if new.alcance <> 'nucleo' then return new; end if;
  if crudo ~* '(@|\marroba\M|\(at\)|\[at\]|\mpunto[[:space:]]+com\M)' or crudo ~ '[0-9]([[:space:]().·•–-]{0,2}[0-9]){6,}'
     or crudo ~* '\m[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])' or t ~ '[[:alnum:]-]+\.(com|net|org|edu|gob)(\.[a-z]{2})?\M' then
    raise exception 'lo que sube al núcleo no lleva identificadores: se generaliza antes';
  end if;
  -- El nombre, también sin la razón social («Lácteos La Huasteca» de «Lácteos La Huasteca, S.A. de C.V.»).
  if exists (select 1 from public.ss_organizacion o where o.tipo in ('consultora', 'cliente')
             and position(regexp_replace(translate(lower(o.nombre), 'áéíóúüñ', 'aeiouun'),
               ',?[[:space:]]+(s\.?[[:space:]]*a\.?([[:space:]]*p\.?[[:space:]]*i\.?)?|s\.?[[:space:]]*de[[:space:]]+r\.?[[:space:]]*l\.?|s\.?[[:space:]]*c\.?|a\.?[[:space:]]*c\.?)([[:space:]]+de[[:space:]]+c\.?[[:space:]]*v\.?)?$', '') in t) > 0) then
    raise exception 'lo que sube al núcleo no nombra a una consultora ni a un cliente: se generaliza antes';
  end if;
  -- Z… y Y… propios: no tras un guion (`BSEG-ZLSCH`) ni los campos estándar que empiezan con Z (`ZTERM`), salvo los
  -- campos ZZ/YY; namespaces que no son de SAP.
  if crudo ~ '(^|[^[:alnum:]_/-])(?!(ZLSCH|ZTERM|ZFBDT|ZUONR|ZLSPR|ZEILE|ZBD[123][TP]|ZWELS|ZAHLS|ZBUKR|ZINKZ)\M)[ZY][A-Z0-9_]{2,}' or t ~ '(^|[^[:alnum:]_/-])(?!zbd[123][tp]\M)[zy][a-z0-9]*(_|[0-9])' or t ~ '/[no][zy][a-z0-9_]{2,}'
     or t ~ '[[:alnum:]]-(zz|yy)[a-z0-9_]'
     or t ~ '(^|[^[:alnum:]_/])/(?!(sapapo|scwm|scmtms|ui2|ui5|iwfnd|iwbep|bobf|sapsll|saptrx)/)[a-z0-9_]{2,10}/'
     or t ~ '\m(sociedad(es)?|company codes?|co\.?[[:space:]]?cd|bukrs|soc|centros?( de (costos?|beneficios?))?|plants?|plantas?|plnt|werks|almacen(es)?|alm|sloc|lgort|org(anizacion(es)?)?\.?[[:space:]]+(de[[:space:]]+)?(ventas|vtas|compras)|sales orgs?|vkorg|ekorg|kokrs|kostl|prctr)\M[[:space:]:=#.''"]{0,6}(es[[:space:]]+)?([a-z]{1,3}[0-9]|[0-9][a-z0-9])' then
    raise exception 'lo que sube al núcleo no lleva objetos propios ni la estructura del cliente: se generaliza antes';
  end if;
  return new;
end $$;
-- Una propuesta no cambia de consultora, de alcance ni de contenido: con `update` sobre todas las columnas, el experto
-- llevaba lo «a medida» de A a B sin generalizar (PRP-010, tercera revisión: R3-05). Lo único que cambia de dueña es
-- la promoción al núcleo, y la hace el superadministrador (D2), generalizada (el disparador de arriba).
create or replace function ss_priv.propuesta_no_cambia_de_duena() returns trigger language plpgsql set search_path = '' as $$
declare motivo text;
begin
  if current_user not in ('authenticated', 'soporte_sap_agente', 'soporte_sap_ingesta') then return new; end if;
  if (new.tipo, new.origen, new.propuesta_por, new.creada_en, new.incidencia_id) is distinct from (old.tipo, old.origen, old.propuesta_por, old.creada_en, old.incidencia_id) then
    raise exception 'de una propuesta no se reescribe quién la propuso ni de dónde salió';
  end if;
  if (new.alcance, new.consultora_id, new.contenido) is distinct from (old.alcance, old.consultora_id, old.contenido)
     and not (old.alcance = 'a_medida' and new.alcance = 'nucleo' and new.consultora_id is null and ss_priv.es_superadmin() is not distinct from true) then
    raise exception 'una propuesta no cambia de consultora, de alcance ni de contenido: al núcleo la sube el superadministrador';
  end if;
  -- D1 (PRP-011): al núcleo común solo sube lo que tiene su origen registrado, con el consentimiento vigente de la
  -- consultora y del cliente de los que nació. Sin eso, el conocimiento de A llegaba a B sin que ninguno lo supiera.
  if old.alcance = 'a_medida' and new.alcance = 'nucleo' then
    motivo := ss_priv.falta_para_el_nucleo(new.id);
    if motivo is not null then raise exception '%', motivo; end if;
  end if;
  return new;
end $$;
drop trigger if exists ss_propuesta_duena on public.ss_propuesta;
create trigger ss_propuesta_duena before update on public.ss_propuesta
  for each row execute function ss_priv.propuesta_no_cambia_de_duena();

drop trigger if exists ss_propuesta_nucleo_generalizada on public.ss_propuesta;
create trigger ss_propuesta_nucleo_generalizada before insert or update on public.ss_propuesta
  for each row execute function ss_priv.propuesta_nucleo_generalizada();

-- El acceso motivado del laboratorio a los originales de un cliente lo otorga un consultor de la
-- consultora de ese cliente, a un miembro del laboratorio, por 72 h como máximo (D14), y lo puede revocar
-- antes. La fecha de alta la pone la BASE: si la eligiera quien otorga, un `creado_en` futuro estiraba el
-- tope a un año (PRP-010 H-02, medido el 2026-10-07: 8 832 h).
create table if not exists public.ss_acceso_motivado (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null,
  cliente_id   uuid not null references public.ss_organizacion (id),
  motivo       text not null check (length(motivo) >= 10),
  otorgado_por uuid not null,
  vence_en     timestamptz not null,
  creado_en    timestamptz not null default now(),
  revocado_en  timestamptz,
  constraint ss_acceso_con_tope check (vence_en <= creado_en + interval '72 hours'),
  constraint ss_acceso_no_a_si_mismo check (otorgado_por <> usuario_id)
);

create or replace function ss_priv.acceso_fechas_de_la_base() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.revocado_en := null;
  elsif old.revocado_en is not null then
    raise exception 'un acceso revocado no se reabre: se otorga uno nuevo';
  elsif new.revocado_en is not null then
    new.revocado_en := now();
  end if;
  return new;
end $$;
drop trigger if exists ss_acceso_fechas on public.ss_acceso_motivado;
create trigger ss_acceso_fechas before insert or update on public.ss_acceso_motivado
  for each row execute function ss_priv.acceso_fechas_de_la_base();

create or replace function ss_priv.baja_original(cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select ss_priv.ve_cliente(cli)
      or (ss_priv.es_laboratorio() and exists (
            select 1 from public.ss_acceso_motivado a
            where a.usuario_id = auth.uid() and a.cliente_id = cli and a.vence_en > now() and a.revocado_en is null))
$$;

create or replace function ss_priv.es_del_laboratorio(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_miembro m join public.ss_organizacion o on o.id = m.organizacion_id
                 where m.usuario_id = u and o.tipo = 'laboratorio')
$$;

-- --- SLA, horas y presupuesto -------------------------------------------------------------

create table if not exists public.ss_contrato_sla (
  id            text not null,
  version       integer not null check (version >= 1),
  nivel         text not null check (nivel in ('N1-N2', 'N2-N3')),
  consultora_id uuid not null references public.ss_organizacion (id),
  cliente_id    uuid references public.ss_organizacion (id),
  contenido     jsonb not null,
  vigente_desde date not null,
  primary key (id, version),
  constraint ss_nivel_y_partes check ((nivel = 'N1-N2') = (cliente_id is null))
);

-- --- D1: el núcleo común con consentimiento (PRP-011) ---------------------------------------
-- Lo aprendido con los casos de una consultora sube al núcleo común solo con el consentimiento por contrato de esa
-- consultora Y de su cliente. Lo da una persona de ESA organización, a su nombre: un consultor por su consultora
-- (DP-2), un usuario del cliente por su cliente. Vale para la versión de su contrato con la que se dio (DP-3). La
-- fecha la pone la base. Se revoca, y revocar frena lo que no ha subido; lo ya subido, generalizado, se queda (DP-1).
create table if not exists public.ss_consentimiento_nucleo (
  id               uuid primary key default gen_random_uuid(),
  consultora_id    uuid not null references public.ss_organizacion (id),
  -- Nulo: consiente la consultora. Con valor: consiente ese cliente de la consultora.
  cliente_id       uuid references public.ss_organizacion (id),
  contrato_id      text not null,
  contrato_version integer not null,
  otorgado_por     uuid not null,
  otorgado_en      timestamptz not null default now(),
  revocado_en      timestamptz,
  constraint ss_consentimiento_de_un_contrato foreign key (contrato_id, contrato_version) references public.ss_contrato_sla (id, version)
);

-- La fecha la pone la base, y el contrato tiene que ser el de esa organización: el N1-N2 de la consultora o el N2-N3
-- de ese cliente. De una fila solo se toca la revocación, una vez.
create or replace function ss_priv.consentimiento_de_la_base() returns trigger language plpgsql security definer set search_path = '' as $$
declare k record;
begin
  if tg_op = 'INSERT' then
    new.otorgado_en := now(); new.revocado_en := null;
    select nivel, consultora_id, cliente_id into k from public.ss_contrato_sla where id = new.contrato_id and version = new.contrato_version;
    if not found or k.consultora_id is distinct from new.consultora_id or k.cliente_id is distinct from new.cliente_id then
      raise exception 'el consentimiento va con el contrato de esa organización (N1-N2 la consultora, N2-N3 su cliente)';
    end if;
    return new;
  end if;
  if (new.consultora_id, new.cliente_id, new.contrato_id, new.contrato_version, new.otorgado_por, new.otorgado_en)
     is distinct from (old.consultora_id, old.cliente_id, old.contrato_id, old.contrato_version, old.otorgado_por, old.otorgado_en) then
    raise exception 'de un consentimiento solo se registra su revocación';
  end if;
  if old.revocado_en is not null then raise exception 'un consentimiento revocado no se reabre: se da uno nuevo'; end if;
  new.revocado_en := now();
  return new;
end $$;
drop trigger if exists ss_consentimiento_fechas on public.ss_consentimiento_nucleo;
create trigger ss_consentimiento_fechas before insert or update on public.ss_consentimiento_nucleo
  for each row execute function ss_priv.consentimiento_de_la_base();

-- ¿Consiente esa organización, con la versión vigente de su contrato? (`cli` nulo: la consultora.)
create or replace function ss_priv.consiente_nucleo(cons uuid, cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ss_consentimiento_nucleo c
    where c.consultora_id = cons and c.cliente_id is not distinct from cli and c.revocado_en is null
      and c.contrato_version = (select max(k.version) from public.ss_contrato_sla k
                                where k.id = c.contrato_id and k.vigente_desde <= current_date))
$$;

-- --- D8 (PRP-012): retención y salida -------------------------------------------------------
-- Una salida la registra una PERSONA (DP-2): la de un cliente, el propio cliente o un consultor de su consultora; la
-- de una consultora, el superadministrador. La base pone quién y cuándo, y calcula desde cuándo se borra (la gracia
-- del contrato vigente, DP-4). Sin FK a la organización: la baja sobrevive a lo que borra, y es la lista de bajas.
create table if not exists public.ss_baja (
  id             uuid primary key default gen_random_uuid(),
  consultora_id  uuid not null,
  cliente_id     uuid,
  registrada_por uuid not null,
  registrada_en  timestamptz not null default now(),
  -- Null: el contrato no declara gracia, y entonces no vence nunca (DP-4: sin plazo no se borra nada).
  borrar_desde   timestamptz,
  export_sha256  text check (export_sha256 ~ '^[0-9a-f]{64}$'),
  borrada_en     timestamptz,
  constraint ss_una_baja_por_tenant unique nulls not distinct (consultora_id, cliente_id)
);

-- Los días que declara el contrato vigente de esa pareja (`cli` nulo: el N1-N2 de la consultora), o null. Van como
-- los demás números legales del contrato (`ContratoSla`, src/sla.ts): `{ valor, quienDecide }`, y `valor` null es
-- «por decidir».
create or replace function ss_priv.dias_del_contrato(cons uuid, cli uuid, clave text) returns integer language sql stable security definer set search_path = '' as $$
  select case when (k.contenido -> clave ->> 'valor') ~ '^[0-9]{1,4}$' then (k.contenido -> clave ->> 'valor')::integer end
  from public.ss_contrato_sla k
  where k.consultora_id = cons and k.cliente_id is not distinct from cli and k.vigente_desde <= current_date
  order by k.vigente_desde desc, k.version desc limit 1
$$;

-- ¿Hay una baja registrada que cubra a ese tenant? (`cli` nulo: lo que es de la consultora, no de un cliente.)
create or replace function ss_priv.en_baja(cons uuid, cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_baja b
                 where b.consultora_id = cons and (b.cliente_id is null or (cli is not null and b.cliente_id = cli)))
$$;

-- ¿Ya se puede borrar ese tenant? Con su export registrado y la gracia terminada; sin gracia declarada, nunca.
create or replace function ss_priv.baja_vencida(cons uuid, cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_baja b
                 where b.consultora_id = cons and (b.cliente_id is null or (cli is not null and b.cliente_id = cli))
                   and b.export_sha256 is not null and b.borrar_desde <= now())
$$;

-- ¿Venció el original? N días (contrato N2-N3, DP-4) desde la última de: la resolución de la incidencia o la de su
-- última impugnación; con una impugnación abierta, no vence (DP-3). Sin N declarado, nunca.
create or replace function ss_priv.original_vencido(adj uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ss_adjunto a join public.ss_incidencia i on i.id = a.incidencia_id
    where a.id = adj and a.original_borrado_en is null
      and i.estado in ('resuelta', 'cerrada') and i.resuelta_en is not null
      and not exists (select 1 from public.ss_impugnacion m where m.incidencia_id = i.id and m.estado = 'abierta')
      and greatest(i.resuelta_en, (select max(m.resuelta_en) from public.ss_impugnacion m where m.incidencia_id = i.id))
          + make_interval(days => ss_priv.dias_del_contrato(a.consultora_id, a.cliente_id, 'retencionOriginalesDias')) <= now())
$$;

create or replace function ss_priv.baja_de_la_base() returns trigger language plpgsql security definer set search_path = '' as $$
declare g integer;
begin
  if tg_op = 'INSERT' then
    if new.cliente_id is not null and ss_priv.padre_de(new.cliente_id) is distinct from new.consultora_id then
      raise exception 'el cliente % no es de la consultora %', new.cliente_id, new.consultora_id;
    end if;
    new.registrada_por := auth.uid();
    if new.registrada_por is null then raise exception 'una salida la registra una persona (D8, DP-2)'; end if;
    new.registrada_en := now();
    g := ss_priv.dias_del_contrato(new.consultora_id, new.cliente_id, 'graciaSalidaDias');
    new.borrar_desde := now() + make_interval(days => g);
    new.export_sha256 := null;
    new.borrada_en := null;
    return new;
  end if;
  if (new.consultora_id, new.cliente_id, new.registrada_por, new.registrada_en, new.borrar_desde)
     is distinct from (old.consultora_id, old.cliente_id, old.registrada_por, old.registrada_en, old.borrar_desde) then
    raise exception 'una baja no cambia de tenant, de quien la registró ni de plazo';
  end if;
  if old.export_sha256 is not null and new.export_sha256 is distinct from old.export_sha256 then
    raise exception 'el export de una baja se registra una sola vez';
  end if;
  if new.borrada_en is distinct from old.borrada_en then
    if old.borrada_en is not null then raise exception 'una baja cumplida no se reabre'; end if;
    if not ss_priv.baja_vencida(old.consultora_id, coalesce(old.cliente_id, old.consultora_id)) then
      raise exception 'sin el export de quien se va, o antes de que termine la gracia, la baja no se cumple (D8)';
    end if;
    if ss_priv.quedan_datos_de(old.consultora_id, old.cliente_id) then
      raise exception 'quedan datos del tenant: la baja no se da por cumplida';
    end if;
    new.borrada_en := now();
    -- Las personas se van con su organización; el nombre, también. La fila queda (el sandbox y las métricas la nombran).
    delete from public.ss_miembro m where m.organizacion_id in
      (select o.id from public.ss_organizacion o where o.id = coalesce(old.cliente_id, old.consultora_id)
         or (old.cliente_id is null and o.padre_id = old.consultora_id));
    update public.ss_organizacion o set nombre = 'dada de baja'
      where o.id = coalesce(old.cliente_id, old.consultora_id) or (old.cliente_id is null and o.padre_id = old.consultora_id);
  end if;
  return new;
end $$;
drop trigger if exists ss_baja_de_la_base on public.ss_baja;
create trigger ss_baja_de_la_base before insert or update on public.ss_baja
  for each row execute function ss_priv.baja_de_la_base();

-- Marcar un original como borrado: solo si venció (o venció la baja de su tenant) y sus bytes ya no están. La fecha
-- la pone la base, y un original borrado no se des-borra.
create or replace function ss_priv.original_borrado_de_la_base() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.original_borrado_en is not distinct from old.original_borrado_en then return new; end if;
  if old.original_borrado_en is not null then raise exception 'un original borrado no se des-borra'; end if;
  if not (ss_priv.original_vencido(old.id) or ss_priv.baja_vencida(old.consultora_id, old.cliente_id)) then
    raise exception 'el original todavía no vence (D8): N días después de resolver y sin impugnación abierta';
  end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'ss-originales' and o.name = old.ruta) then
    raise exception 'los bytes del original siguen en Storage: primero se borran, luego se marca';
  end if;
  new.original_borrado_en := now();
  return new;
end $$;
drop trigger if exists ss_adjunto_original_borrado on public.ss_adjunto;
create trigger ss_adjunto_original_borrado before update on public.ss_adjunto
  for each row execute function ss_priv.original_borrado_de_la_base();

-- De dónde nació cada propuesta: aquí y no en su fila. Ningún rol de la API lo lee; solo la regla de promoción.
create table if not exists ss_priv.propuesta_origen (
  propuesta_id  uuid primary key,
  consultora_id uuid not null,
  cliente_id    uuid not null
);
revoke all on ss_priv.propuesta_origen from public;

create or replace function ss_priv.propuesta_registra_origen() returns trigger language plpgsql security definer set search_path = '' as $$
declare c uuid; cl uuid;
begin
  if new.incidencia_id is null then return new; end if;
  select i.consultora_id, i.cliente_id into c, cl from public.ss_incidencia i where i.id = new.incidencia_id;
  if c is null or c is distinct from new.consultora_id then
    raise exception 'una propuesta nace de una incidencia de su consultora';
  end if;
  insert into ss_priv.propuesta_origen (propuesta_id, consultora_id, cliente_id) values (new.id, c, cl)
    on conflict (propuesta_id) do nothing;
  new.incidencia_id := null;
  return new;
end $$;
drop trigger if exists ss_propuesta_origen on public.ss_propuesta;
create trigger ss_propuesta_origen before insert on public.ss_propuesta
  for each row execute function ss_priv.propuesta_registra_origen();

-- Lo que le falta a una propuesta para subir al núcleo, o nulo. Dice QUÉ falta, nunca de quién.
create or replace function ss_priv.falta_para_el_nucleo(p uuid) returns text language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  select consultora_id, cliente_id into o from ss_priv.propuesta_origen where propuesta_id = p;
  if not found then return 'al núcleo común solo sube lo que tiene su origen registrado (D1)'; end if;
  if not ss_priv.consiente_nucleo(o.consultora_id, null) then return 'falta el consentimiento de la consultora de origen para el núcleo común (D1)'; end if;
  if not ss_priv.consiente_nucleo(o.consultora_id, o.cliente_id) then return 'falta el consentimiento del cliente de origen para el núcleo común (D1)'; end if;
  return null;
end $$;

create table if not exists public.ss_sla_resultado (
  incidencia_id       uuid not null references public.ss_incidencia (id) on delete cascade,
  contrato_id         text not null,
  contrato_version    integer not null,
  consultora_id       uuid not null,
  cliente_id          uuid not null,
  respuesta_min       integer,
  resolucion_min      integer,
  meta_respuesta_min  integer,
  meta_resolucion_min integer,
  cumple_respuesta    boolean,
  cumple_resolucion   boolean,
  prioridad           text check (prioridad in ('P1', 'P2', 'P3', 'P4')),
  estado              text check (estado in ('resuelta', 'abierta')),
  pausado_min         integer not null default 0 check (pausado_min >= 0),
  reabierta           boolean not null default false,
  espero_cliente      boolean not null default false,
  calculado_en        timestamptz not null default now(),
  primary key (incidencia_id, contrato_id, contrato_version),
  -- El resultado es de un contrato que existe (PRP-010 H-16: el agente lo guardaba con un contrato inventado).
  constraint ss_sla_de_un_contrato foreign key (contrato_id, contrato_version) references public.ss_contrato_sla (id, version)
);

create table if not exists public.ss_horas (
  id            uuid primary key default gen_random_uuid(),
  consultora_id uuid not null,
  cliente_id    uuid not null,
  incidencia_id uuid references public.ss_incidencia (id) on delete set null,
  consultor     text not null check (consultor ~ '^usr-[0-9a-f]{12}$'),
  minutos       integer not null check (minutos > 0),
  fecha         date not null
);

create table if not exists public.ss_presupuesto (
  consultora_id    uuid not null references public.ss_organizacion (id),
  mes              date not null,
  tope_tokens      bigint,
  tope_paginas_ocr integer,
  primary key (consultora_id, mes)
);

-- --- Onboarding: crudo inmutable, mapeo versionado y procedencia --------------------------

create table if not exists public.ss_crudo (
  id            uuid primary key default gen_random_uuid(),
  consultora_id uuid not null references public.ss_organizacion (id),
  herramienta   text not null,
  huella        text not null check (huella ~ '^[0-9a-f]{64}$'),
  contenido     jsonb not null,
  recibido_en   timestamptz not null default now(),
  unique (consultora_id, huella)
);
drop trigger if exists ss_crudo_solo_agregar on public.ss_crudo;
create trigger ss_crudo_solo_agregar before update or delete on public.ss_crudo
  for each row execute function ss_priv.solo_agregar();

create table if not exists public.ss_mapeo (
  consultora_id uuid not null references public.ss_organizacion (id),
  herramienta   text not null,
  version       integer not null check (version >= 1),
  contenido     jsonb not null,
  estado        text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'retirado')),
  aprobado_por  uuid,
  primary key (consultora_id, herramienta, version),
  constraint ss_aprobado_tiene_quien check ((estado = 'aprobado') = (aprobado_por is not null))
);

create table if not exists public.ss_procedencia (
  consultora_id uuid not null,
  registro      text not null,
  campo         text not null,
  original      text,
  valor         text,
  regla         text not null,
  fuente        text not null,
  primary key (consultora_id, registro, campo, regla)
);

-- Lo que pasó con cada fila de un crudo al aplicarle un mapeo aprobado: entrada = limpias +
-- revisión + descartadas, siempre. Lo que no mapea queda en revisión, nunca se tira.
create table if not exists public.ss_importacion_fila (
  crudo_id      uuid not null references public.ss_crudo (id),
  indice        integer not null check (indice >= 0),
  consultora_id uuid not null references public.ss_organizacion (id),
  cliente_id    uuid references public.ss_organizacion (id),
  herramienta   text not null,
  version_mapeo integer not null check (version_mapeo >= 1),
  resultado     text not null check (resultado in ('limpia', 'revision', 'descartada')),
  motivo        text,
  decidido_en   timestamptz not null default now(),
  primary key (crudo_id, indice),
  constraint ss_no_limpia_tiene_motivo check ((resultado = 'limpia') = (motivo is null))
);

-- El corte semántico: lo único que leen los tableros, el SLA, el pricing y el chat. Lo escribe solo
-- el job de métricas; cada versión es la huella de sus entradas. Un alcance por fila.
create table if not exists public.ss_metrica (
  version       text not null,
  metrica       text not null,
  periodo       date not null,
  alcance       text not null check (alcance in ('total', 'tamano', 'consultora', 'cliente')),
  tamano        text check (tamano in ('S', 'M', 'L')),
  consultora_id uuid references public.ss_organizacion (id),
  cliente_id    uuid references public.ss_organizacion (id),
  -- El segmento del ciclo de vida (solo en `clientes_en_cartera`): cuántos clientes hay en cada etapa.
  etapa         text check (etapa in ('alta', 'onboarding', 'adopcion', 'operacion', 'renovacion')),
  valor         numeric,
  -- Si el cliente la ve de sí mismo (el `meta.visible_al_cliente` del catálogo): el riesgo de baja,
  -- la salud y las horas son de la consultora. Sin esta columna la RLS dejaba al N3 leerlas.
  visible_al_cliente boolean not null default false,
  generado_en   timestamptz not null default now(),
  constraint ss_metrica_una unique nulls not distinct (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, etapa),
  constraint ss_metrica_alcance check (case alcance
    when 'total' then tamano is null and consultora_id is null and cliente_id is null
    when 'tamano' then tamano is not null and consultora_id is null and cliente_id is null
    when 'consultora' then consultora_id is not null and cliente_id is null
    else consultora_id is not null and cliente_id is not null end)
);

-- --- Chat del HIL: cada quien su conversación ----------------------------------------------

create table if not exists public.ss_chat_mensaje (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  autor      text not null check (autor in ('humano', 'agente')),
  contenido  text not null,
  fuentes    jsonb not null default '[]'::jsonb,
  creado_en  timestamptz not null default now()
);

-- --- Disparadores de tenencia en las tablas hijas ------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_impugnacion', 'ss_sla_resultado', 'ss_horas'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_tenencia', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function ss_priv.tenencia_de_incidencia()', t || '_tenencia', t);
  end loop;
end $$;

-- Los vínculos que la tenencia no ataba (PRP-010 H-14): un campo extraído cuelga de un adjunto de SU incidencia (si
-- no, el valor leído del documento de un cliente aparecía en la incidencia de otro), y una fila importada, de un crudo
-- de SU consultora. Se comprueban como dueño: quien escribe puede no ver la fila referida.
create or replace function ss_priv.campo_de_su_adjunto() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ss_adjunto a where a.id = new.adjunto_id and a.incidencia_id = new.incidencia_id) then
    raise exception 'el adjunto % no es de la incidencia %', new.adjunto_id, new.incidencia_id;
  end if;
  return new;
end $$;
drop trigger if exists ss_campo_revisado on public.ss_campo_extraido;
create trigger ss_campo_revisado before update on public.ss_campo_extraido
  for each row execute function ss_priv.campo_revisado_se_queda();
drop trigger if exists ss_campo_extraido_adjunto on public.ss_campo_extraido;
create trigger ss_campo_extraido_adjunto before insert or update on public.ss_campo_extraido
  for each row execute function ss_priv.campo_de_su_adjunto();

create or replace function ss_priv.fila_de_su_crudo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ss_crudo c where c.id = new.crudo_id and c.consultora_id = new.consultora_id) then
    raise exception 'el crudo % no es de la consultora %', new.crudo_id, new.consultora_id;
  end if;
  return new;
end $$;
drop trigger if exists ss_importacion_fila_crudo on public.ss_importacion_fila;
create trigger ss_importacion_fila_crudo before insert or update on public.ss_importacion_fila
  for each row execute function ss_priv.fila_de_su_crudo();

create or replace function ss_priv.cliente_es_de_consultora() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.cliente_id is not null and ss_priv.padre_de(new.cliente_id) is distinct from new.consultora_id then
    raise exception 'el cliente % no es de la consultora %', new.cliente_id, new.consultora_id;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  -- `ss_contrato_sla` también (PRP-010 H-14): un contrato N2-N3 no se firma con el cliente de otra consultora.
  foreach t in array array['ss_importacion_fila', 'ss_metrica', 'ss_contrato_sla', 'ss_consentimiento_nucleo'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_tenencia', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function ss_priv.cliente_es_de_consultora()', t || '_tenencia', t);
  end loop;
end $$;

-- D8 (PRP-012): con la salida registrada, el tenant se CONGELA. Su export es el último que hay, y la gracia sirve para
-- descargarlo y discutir con él en la mano: nada de lo suyo se escribe ni se cambia. Restaurar corre en modo réplica
-- (sin disparadores), y la plataforma solo borra. Lo que no tiene cliente se congela con la baja de su consultora.
create or replace function ss_priv.congelado_por_baja() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if ss_priv.en_baja(new.consultora_id, (to_jsonb(new) ->> 'cliente_id')::uuid) then
    raise exception 'la salida de este tenant está registrada (D8): no cambia nada, y su export es el último';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_impugnacion', 'ss_sla_resultado', 'ss_horas', 'ss_importacion_fila', 'ss_contrato_sla', 'ss_consentimiento_nucleo',
    'ss_mapeo', 'ss_procedencia', 'ss_presupuesto', 'ss_crudo'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_congelado', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function ss_priv.congelado_por_baja()', t || '_congelado', t);
  end loop;
end $$;

-- --- RLS: enable + force en toda tabla ------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ss_organizacion', 'ss_miembro', 'ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto',
    'ss_campo_extraido', 'ss_cuarentena', 'ss_impugnacion', 'ss_caso_sandbox', 'ss_propuesta', 'ss_acceso_motivado',
    'ss_contrato_sla', 'ss_sla_resultado', 'ss_horas', 'ss_presupuesto', 'ss_crudo', 'ss_mapeo',
    'ss_procedencia', 'ss_chat_mensaje', 'ss_importacion_fila', 'ss_metrica', 'ss_consentimiento_nucleo', 'ss_baja'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Personas: lectura -------------------------------------------------------------------------

drop policy if exists ss_org_lee on public.ss_organizacion;
create policy ss_org_lee on public.ss_organizacion for select to authenticated
  using (ss_priv.es_laboratorio() or ss_priv.ve_consultora(id) or ss_priv.ve_cliente(id));

drop policy if exists ss_miembro_lee on public.ss_miembro;
create policy ss_miembro_lee on public.ss_miembro for select to authenticated
  using (usuario_id = auth.uid() or ss_priv.es_laboratorio());

drop policy if exists ss_incidencia_lee on public.ss_incidencia;
create policy ss_incidencia_lee on public.ss_incidencia for select to authenticated
  using (ss_priv.ve_cliente(cliente_id) or ss_priv.lab_trabaja(id));

do $$
declare t text;
begin
  foreach t in array array['ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_impugnacion', 'ss_sla_resultado'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lee', t);
    execute format('create policy %I on public.%I for select to authenticated using (ss_priv.ve_cliente(cliente_id) or ss_priv.lab_trabaja(incidencia_id))', t || '_lee', t);
  end loop;
end $$;

-- Lo leído de un documento (el RFC y el total de un CFDI) es contenido del original: el laboratorio lo lee en lo
-- escalado y con el acceso motivado vigente, como los bytes. Sin eso, lo leía sin acceso (PRP-010, tercera revisión:
-- R3-04). Reemplaza la política del bucle de arriba.
drop policy if exists ss_campo_extraido_lee on public.ss_campo_extraido;
create policy ss_campo_extraido_lee on public.ss_campo_extraido for select to authenticated
  using (ss_priv.ve_cliente(cliente_id) or (ss_priv.lab_trabaja(incidencia_id) and ss_priv.baja_original(cliente_id)));

-- La cuarentena no guarda datos, solo tipos de señal, y nadie la revisa hasta D14 (DP-7): el laboratorio no la lee.
-- Antes la leía entera, también la de incidencias que nadie le escaló (R3-18).
drop policy if exists ss_cuarentena_lee on public.ss_cuarentena;
create policy ss_cuarentena_lee on public.ss_cuarentena for select to authenticated
  using (ss_priv.ve_cliente(cliente_id));

-- Las horas son de la consultora: ni el cliente ni el laboratorio las leen fila por fila.
drop policy if exists ss_horas_lee on public.ss_horas;
-- Cada consultor ve SUS filas (PRP-010 H-05): leer las de sus colegas una por una era una vista de desempeño
-- individual, y el producto dice que no la ofrece. Los totales salen de la capa semántica (`horas_por_ticket` en
-- `ss_metrica`), sin persona; una función `security definer` en `public` para sumarlas rompería la regla del esquema.
create policy ss_horas_lee on public.ss_horas for select to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor' and consultor = ss_priv.mi_seudonimo());

drop policy if exists ss_sandbox_lee on public.ss_caso_sandbox;
create policy ss_sandbox_lee on public.ss_caso_sandbox for select to authenticated
  using (ss_priv.es_laboratorio() or ss_priv.rol_en(origen_consultora_id) = 'consultor');

drop policy if exists ss_propuesta_lee on public.ss_propuesta;
create policy ss_propuesta_lee on public.ss_propuesta for select to authenticated
  using (ss_priv.es_laboratorio() or (consultora_id is not null and ss_priv.rol_en(consultora_id) = 'consultor'));

drop policy if exists ss_acceso_lee on public.ss_acceso_motivado;
create policy ss_acceso_lee on public.ss_acceso_motivado for select to authenticated
  using (usuario_id = auth.uid() or otorgado_por = auth.uid() or ss_priv.rol_en(ss_priv.padre_de(cliente_id)) = 'consultor');

drop policy if exists ss_contrato_lee on public.ss_contrato_sla;
create policy ss_contrato_lee on public.ss_contrato_sla for select to authenticated
  using (case when cliente_id is null then ss_priv.ve_consultora(consultora_id) or ss_priv.es_laboratorio()
              else ss_priv.ve_cliente(cliente_id) end);

drop policy if exists ss_presupuesto_lee on public.ss_presupuesto;
create policy ss_presupuesto_lee on public.ss_presupuesto for select to authenticated
  using (ss_priv.ve_consultora(consultora_id) or ss_priv.es_superadmin());

drop policy if exists ss_crudo_lee on public.ss_crudo;
create policy ss_crudo_lee on public.ss_crudo for select to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_mapeo_lee on public.ss_mapeo;
create policy ss_mapeo_lee on public.ss_mapeo for select to authenticated
  using (ss_priv.ve_consultora(consultora_id) or ss_priv.es_laboratorio());

drop policy if exists ss_procedencia_lee on public.ss_procedencia;
create policy ss_procedencia_lee on public.ss_procedencia for select to authenticated
  using (ss_priv.ve_consultora(consultora_id));

drop policy if exists ss_importacion_lee on public.ss_importacion_fila;
create policy ss_importacion_lee on public.ss_importacion_fila for select to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor');

-- El corte por nivel: el laboratorio, los agregados (total, tamaño, consultora); la consultora, lo
-- suyo y lo de sus clientes; el cliente, solo lo suyo. Nadie ve el total de otros por ser consultora.
-- D14: el laboratorio ve un agregado solo si su grupo tiene 3 clientes o más en ese periodo (`clientes_en_cartera`,
-- sumado por etapa). Y en una partición (las consultoras, o los tamaños) lo suprimido junto tiene que sumar 3 o más: si
-- no, el grupo chico se despejaría restando del total, y la partición entera se suprime. Sin el conteo, no se ve. La
-- misma regla marca el corte del laboratorio (`semantica/grupo-minimo.ts`), y una prueba cruza las dos.
create or replace function ss_priv.grupo_visible_al_laboratorio(ver text, per date, alc text, tam text, cons uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with grupos as (
    select m.tamano, m.consultora_id, sum(m.valor) as n from public.ss_metrica m
    where m.version = ver and m.metrica = 'clientes_en_cartera' and m.periodo = per and m.alcance = alc and m.cliente_id is null
      and m.etapa is not null
    group by m.tamano, m.consultora_id)
  select coalesce((select g.n from grupos g where g.tamano is not distinct from tam and g.consultora_id is not distinct from cons), 0) >= 3
     and coalesce((select sum(g.n) from grupos g where g.n < 3) not between 1 and 2, true)
$$;

drop policy if exists ss_metrica_lee on public.ss_metrica;
create policy ss_metrica_lee on public.ss_metrica for select to authenticated
  using ((alcance <> 'cliente' and ss_priv.es_laboratorio() and ss_priv.grupo_visible_al_laboratorio(version, periodo, alcance, tamano, consultora_id))
      or (alcance in ('consultora', 'cliente') and ss_priv.rol_en(consultora_id) = 'consultor')
      or (alcance = 'cliente' and visible_al_cliente and ss_priv.ve_cliente(cliente_id)));

drop policy if exists ss_chat_lee on public.ss_chat_mensaje;
create policy ss_chat_lee on public.ss_chat_mensaje for select to authenticated
  using (usuario_id = auth.uid());

-- Personas: escritura -----------------------------------------------------------------------

drop policy if exists ss_incidencia_alta on public.ss_incidencia;
create policy ss_incidencia_alta on public.ss_incidencia for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' or ss_priv.rol_en(consultora_id) = 'consultor');
-- D8: con la salida registrada no entra nada nuevo de ese cliente (el export ya no lo llevaría).
drop policy if exists ss_incidencia_sin_baja on public.ss_incidencia;
create policy ss_incidencia_sin_baja on public.ss_incidencia as restrictive for insert to authenticated
  with check (not ss_priv.en_baja(consultora_id, cliente_id));

-- La salida (D8, DP-2): la registra una persona de esa organización, a su nombre (la base pone quién).
drop policy if exists ss_baja_registra on public.ss_baja;
create policy ss_baja_registra on public.ss_baja for insert to authenticated
  with check (case when cliente_id is null then coalesce(ss_priv.es_superadmin(), false)
                   else ss_priv.rol_en(cliente_id) is not distinct from 'usuario_cliente'
                        or ss_priv.rol_en(consultora_id) is not distinct from 'consultor' end);
drop policy if exists ss_baja_lee on public.ss_baja;
create policy ss_baja_lee on public.ss_baja for select to authenticated
  using (coalesce(ss_priv.es_superadmin(), false) or ss_priv.rol_en(consultora_id) is not distinct from 'consultor'
         or (cliente_id is not null and ss_priv.rol_en(cliente_id) is not distinct from 'usuario_cliente'));

drop policy if exists ss_incidencia_atiende on public.ss_incidencia;
create policy ss_incidencia_atiende on public.ss_incidencia for update to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor') with check (ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_escalamiento_alta on public.ss_escalamiento;
create policy ss_escalamiento_alta on public.ss_escalamiento for insert to authenticated
  with check (ss_priv.rol_en(consultora_id) = 'consultor' and escalada_por = ss_priv.mi_seudonimo());

drop policy if exists ss_evento_alta on public.ss_evento;
create policy ss_evento_alta on public.ss_evento for insert to authenticated
  with check (ss_priv.ve_cliente(cliente_id) or ss_priv.lab_trabaja(incidencia_id));

-- El adjunto lo registra la ingesta, que es la que validó sus bytes (PRP-010 H-23): ni el cliente ni la consultora.
drop policy if exists ss_adjunto_alta on public.ss_adjunto;

-- Confirmar o corregir un campo: un consultor de la consultora o un usuario del cliente, A SU NOMBRE.
drop policy if exists ss_campo_revisa on public.ss_campo_extraido;
create policy ss_campo_revisa on public.ss_campo_extraido for update to authenticated
  using (ss_priv.ve_cliente(cliente_id)) with check (ss_priv.ve_cliente(cliente_id));
drop policy if exists ss_campo_revisa_a_su_nombre on public.ss_campo_extraido;
create policy ss_campo_revisa_a_su_nombre on public.ss_campo_extraido as restrictive for update to authenticated
  with check (revisado_por is null or revisado_por = auth.uid());

drop policy if exists ss_impugnacion_alta on public.ss_impugnacion;
create policy ss_impugnacion_alta on public.ss_impugnacion for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' and creada_por = auth.uid() and estado = 'abierta');
drop policy if exists ss_impugnacion_resuelve on public.ss_impugnacion;
create policy ss_impugnacion_resuelve on public.ss_impugnacion for update to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor') with check (ss_priv.rol_en(consultora_id) = 'consultor');
drop policy if exists ss_impugnacion_a_su_nombre on public.ss_impugnacion;
create policy ss_impugnacion_a_su_nombre on public.ss_impugnacion as restrictive for update to authenticated
  with check (resuelta_por is null or resuelta_por = auth.uid());

drop policy if exists ss_horas_alta on public.ss_horas;
create policy ss_horas_alta on public.ss_horas for insert to authenticated
  with check (ss_priv.rol_en(consultora_id) = 'consultor' and consultor = ss_priv.mi_seudonimo());

-- Decidir una propuesta: lo a medida, el laboratorio; lo que va al núcleo, el superadministrador.
drop policy if exists ss_propuesta_decide on public.ss_propuesta;
create policy ss_propuesta_decide on public.ss_propuesta for update to authenticated
  using (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end)
  with check (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end);
drop policy if exists ss_propuesta_a_su_nombre on public.ss_propuesta;
create policy ss_propuesta_a_su_nombre on public.ss_propuesta as restrictive for update to authenticated
  with check (decidida_por is null or decidida_por = auth.uid());

-- D1: consiente una persona de ESA organización, a su nombre; la lee esa organización (y la consultora, lo de sus
-- clientes). Ni el laboratorio ni un rol de servicio escriben un consentimiento.
drop policy if exists ss_consentimiento_lee on public.ss_consentimiento_nucleo;
create policy ss_consentimiento_lee on public.ss_consentimiento_nucleo for select to authenticated
  using (case when cliente_id is null then ss_priv.rol_en(consultora_id) is not distinct from 'consultor' else ss_priv.ve_cliente(cliente_id) end);
drop policy if exists ss_consentimiento_otorga on public.ss_consentimiento_nucleo;
create policy ss_consentimiento_otorga on public.ss_consentimiento_nucleo for insert to authenticated
  with check (otorgado_por = auth.uid() and case when cliente_id is null then ss_priv.rol_en(consultora_id) is not distinct from 'consultor'
                                                  else ss_priv.rol_en(cliente_id) is not distinct from 'usuario_cliente' end);
drop policy if exists ss_consentimiento_revoca on public.ss_consentimiento_nucleo;
create policy ss_consentimiento_revoca on public.ss_consentimiento_nucleo for update to authenticated
  using (case when cliente_id is null then ss_priv.rol_en(consultora_id) is not distinct from 'consultor'
              else ss_priv.rol_en(cliente_id) is not distinct from 'usuario_cliente' end)
  with check (case when cliente_id is null then ss_priv.rol_en(consultora_id) is not distinct from 'consultor'
                   else ss_priv.rol_en(cliente_id) is not distinct from 'usuario_cliente' end);

drop policy if exists ss_acceso_otorga on public.ss_acceso_motivado;
create policy ss_acceso_otorga on public.ss_acceso_motivado for insert to authenticated
  with check (otorgado_por = auth.uid()
    and ss_priv.rol_en(ss_priv.padre_de(cliente_id)) = 'consultor'
    and ss_priv.es_del_laboratorio(usuario_id));

-- Revocar es de la consultora del cliente, cualquiera de sus consultores (si quien otorgó se va, el acceso
-- no queda huérfano). Solo se toca `revocado_en`, y la hora la pone la base (PRP-010 H-02).
drop policy if exists ss_acceso_revoca on public.ss_acceso_motivado;
create policy ss_acceso_revoca on public.ss_acceso_motivado for update to authenticated
  using (ss_priv.rol_en(ss_priv.padre_de(cliente_id)) = 'consultor')
  with check (ss_priv.rol_en(ss_priv.padre_de(cliente_id)) = 'consultor' and revocado_en is not null);

drop policy if exists ss_presupuesto_fija on public.ss_presupuesto;
create policy ss_presupuesto_fija on public.ss_presupuesto for all to authenticated
  using (ss_priv.es_superadmin()) with check (ss_priv.es_superadmin());

drop policy if exists ss_mapeo_aprueba on public.ss_mapeo;
create policy ss_mapeo_aprueba on public.ss_mapeo for update to authenticated
  using (ss_priv.es_laboratorio()) with check (ss_priv.es_laboratorio());
drop policy if exists ss_mapeo_a_su_nombre on public.ss_mapeo;
create policy ss_mapeo_a_su_nombre on public.ss_mapeo as restrictive for update to authenticated
  with check (aprobado_por is null or aprobado_por = auth.uid());

drop policy if exists ss_chat_escribe on public.ss_chat_mensaje;
create policy ss_chat_escribe on public.ss_chat_mensaje for insert to authenticated
  with check (usuario_id = auth.uid() and autor = 'humano' and ss_priv.es_laboratorio());

-- El agente: lee la consultora de su tarea y PROPONE; ninguna fila sale de él ya decidida ---------

-- La política vieja del agente sobre el escalamiento se borra ANTES del bloque: si un cambio lo vuelve a
-- meter en la lista, la política reaparece y su prueba cae (si se borrara después, lo taparía).
drop policy if exists ss_escalamiento_agente_escribe on public.ss_escalamiento;
-- Igual con el resultado de SLA: lo calcula el job de la plataforma desde los eventos, no el agente (PRP-010 H-16).
drop policy if exists ss_sla_resultado_agente_escribe on public.ss_sla_resultado;

do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_sla_resultado', 'ss_crudo', 'ss_mapeo', 'ss_procedencia', 'ss_presupuesto', 'ss_contrato_sla', 'ss_importacion_fila'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agente_lee', t);
    execute format('create policy %I on public.%I for select to soporte_sap_agente using (consultora_id = ss_priv.consultora_de_tarea())', t || '_agente_lee', t);
  end loop;
  -- Sin `ss_escalamiento`: escalar al laboratorio lo decide la consultora a su nombre, no el agente (DP-3,
  -- PRP-010 H-01). Con el agente escalando, el laboratorio leía lo que nadie de la consultora eligió darle.
  foreach t in array array['ss_evento', 'ss_cuarentena', 'ss_procedencia'] loop
    execute format('drop policy if exists %I on public.%I', t || '_agente_escribe', t);
    execute format('create policy %I on public.%I for insert to soporte_sap_agente with check (consultora_id = ss_priv.consultora_de_tarea())', t || '_agente_escribe', t);
  end loop;
end $$;

drop policy if exists ss_incidencia_agente_actualiza on public.ss_incidencia;
create policy ss_incidencia_agente_actualiza on public.ss_incidencia for update to soporte_sap_agente
  using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea());

drop policy if exists ss_mapeo_agente_propone on public.ss_mapeo;
create policy ss_mapeo_agente_propone on public.ss_mapeo for insert to soporte_sap_agente
  with check (consultora_id = ss_priv.consultora_de_tarea() and estado = 'propuesto' and aprobado_por is null);

drop policy if exists ss_sandbox_agente on public.ss_caso_sandbox;
create policy ss_sandbox_agente on public.ss_caso_sandbox for select to soporte_sap_agente
  using (origen_consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_sandbox_agente_escribe on public.ss_caso_sandbox;
create policy ss_sandbox_agente_escribe on public.ss_caso_sandbox for insert to soporte_sap_agente
  with check (origen_consultora_id = ss_priv.consultora_de_tarea());

drop policy if exists ss_propuesta_agente on public.ss_propuesta;
-- Solo A MEDIDA de su consultora (D1, PRP-011): al núcleo se llega promoviendo, con el origen y los consentimientos.
-- Antes el agente insertaba directo al núcleo y la regla del consentimiento quedaba esquivada.
create policy ss_propuesta_agente on public.ss_propuesta for insert to soporte_sap_agente
  with check (estado = 'propuesta' and decidida_por is null and alcance = 'a_medida' and consultora_id = ss_priv.consultora_de_tarea());

drop policy if exists ss_chat_agente on public.ss_chat_mensaje;
-- Solo en el chat del usuario de SU turno: el token de la tarea de chat lo nombra (`usuario`). Antes bastaba
-- `autor = 'agente'`, y con una tarea de cualquier consultora escribía en el chat de cualquiera (PRP-010 H-12).
create policy ss_chat_agente on public.ss_chat_mensaje for insert to soporte_sap_agente
  with check (autor = 'agente' and usuario_id = ss_priv.uuid_o_nulo(ss_priv.claims_de_tarea() ->> 'usuario'));

-- La ingesta (sin modelo): ve incidencias y adjuntos de su consultora y deja campos POR REVISAR ----

drop policy if exists ss_incidencia_ingesta on public.ss_incidencia;
create policy ss_incidencia_ingesta on public.ss_incidencia for select to soporte_sap_ingesta
  using (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_adjunto_ingesta on public.ss_adjunto;
create policy ss_adjunto_ingesta on public.ss_adjunto for select to soporte_sap_ingesta
  using (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_adjunto_ingesta_alta on public.ss_adjunto;
create policy ss_adjunto_ingesta_alta on public.ss_adjunto for insert to soporte_sap_ingesta
  with check (consultora_id = ss_priv.consultora_de_tarea() and not ss_priv.en_baja(consultora_id, cliente_id));
drop policy if exists ss_campo_ingesta on public.ss_campo_extraido;
create policy ss_campo_ingesta on public.ss_campo_extraido for insert to soporte_sap_ingesta
  with check (consultora_id = ss_priv.consultora_de_tarea() and estado = 'por_revisar' and revisado_por is null);

-- La plataforma (jobs declarados, C7): EXPORTA (lee) y BORRA por retención, solo la consultora de su tarea. No
-- inserta nada (PRP-010 H-07): con `for all` metía decisiones ya tomadas (un mapeo aprobado, un campo confirmado) y
-- eventos con el seudónimo de un consultor. Restaurar NO es de este rol: es la ruta con privilegio de migración, y
-- `restauraTenant` verifica el export firmado, el tenant de cada fila y las huellas antes del commit (H-08).
do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_impugnacion', 'ss_sla_resultado', 'ss_horas', 'ss_crudo', 'ss_mapeo', 'ss_procedencia', 'ss_importacion_fila',
    'ss_contrato_sla', 'ss_presupuesto', 'ss_propuesta', 'ss_consentimiento_nucleo'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plataforma', t);
    execute format('drop policy if exists %I on public.%I', t || '_plataforma_lee', t);
    execute format('create policy %I on public.%I for select to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_lee', t);
  end loop;
  -- D8 (PRP-012): borra SOLO lo de un tenant cuya baja venció (con su export y la gracia terminada). Antes borraba
  -- lo de su consultora en cualquier momento. Lo que es de un cliente mira su baja; lo de la consultora, la suya.
  foreach t in array array['ss_incidencia', 'ss_escalamiento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_impugnacion', 'ss_sla_resultado', 'ss_horas', 'ss_importacion_fila', 'ss_contrato_sla', 'ss_consentimiento_nucleo'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plataforma_borra', t);
    execute format('create policy %I on public.%I for delete to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea() and ss_priv.baja_vencida(consultora_id, cliente_id))', t || '_plataforma_borra', t);
  end loop;
  foreach t in array array['ss_mapeo', 'ss_procedencia', 'ss_presupuesto', 'ss_crudo'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plataforma_borra', t);
    execute format('create policy %I on public.%I for delete to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea() and ss_priv.baja_vencida(consultora_id, null))', t || '_plataforma_borra', t);
  end loop;
end $$;
-- Lo ÚNICO que escribe la plataforma: el resultado de SLA que calcula su job desde los eventos de la base, con
-- `relojSla` (src/sla-job.ts), para su consultora (PRP-010 H-16). Ni decisiones, ni eventos, ni horas (H-07).
drop policy if exists ss_sla_resultado_plataforma_calcula on public.ss_sla_resultado;
create policy ss_sla_resultado_plataforma_calcula on public.ss_sla_resultado for insert to soporte_sap_plataforma
  with check (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_sla_resultado_plataforma_recalcula on public.ss_sla_resultado;
create policy ss_sla_resultado_plataforma_recalcula on public.ss_sla_resultado for update to soporte_sap_plataforma
  using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea());

drop policy if exists ss_caso_sandbox_plataforma_lee on public.ss_caso_sandbox;
create policy ss_caso_sandbox_plataforma_lee on public.ss_caso_sandbox for select to soporte_sap_plataforma
  using (origen_consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_acceso_motivado_plataforma_borra on public.ss_acceso_motivado;
create policy ss_acceso_motivado_plataforma_borra on public.ss_acceso_motivado for delete to soporte_sap_plataforma
  using (ss_priv.padre_de(cliente_id) = ss_priv.consultora_de_tarea() and ss_priv.baja_vencida(ss_priv.padre_de(cliente_id), cliente_id));
-- D8: la plataforma lee las bajas de su consultora, registra el export (una vez) y la da por cumplida (la base
-- verifica que no quede nada). Marca un original como borrado; la base verifica que venció y que no están los bytes.
drop policy if exists ss_baja_plataforma_lee on public.ss_baja;
create policy ss_baja_plataforma_lee on public.ss_baja for select to soporte_sap_plataforma
  using (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_baja_plataforma_cumple on public.ss_baja;
create policy ss_baja_plataforma_cumple on public.ss_baja for update to soporte_sap_plataforma
  using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_adjunto_plataforma_marca on public.ss_adjunto;
create policy ss_adjunto_plataforma_marca on public.ss_adjunto for update to soporte_sap_plataforma
  using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_acceso_motivado_plataforma_lee on public.ss_acceso_motivado;
create policy ss_acceso_motivado_plataforma_lee on public.ss_acceso_motivado for select to soporte_sap_plataforma
  using (ss_priv.padre_de(cliente_id) = ss_priv.consultora_de_tarea());

-- El job de métricas (C7, declarado): lee filas de todos los tenants; las COLUMNAS las acotan los
-- privilegios de abajo. Inserta el corte; no lo cambia ni lo borra (una versión nueva es otra fila).
do $$
declare t text;
begin
  foreach t in array array['ss_organizacion', 'ss_incidencia', 'ss_sla_resultado', 'ss_horas', 'ss_importacion_fila', 'ss_metrica'] loop
    execute format('drop policy if exists %I on public.%I', t || '_metricas', t);
    execute format('create policy %I on public.%I for select to soporte_sap_metricas using (true)', t || '_metricas', t);
  end loop;
end $$;
drop policy if exists ss_metrica_escribe on public.ss_metrica;
create policy ss_metrica_escribe on public.ss_metrica for insert to soporte_sap_metricas with check (true);

-- Los modelos de la capa semántica (dbt) viven en su propio esquema, que la API no expone; el job de
-- métricas crea ahí sus vistas y tablas y no puede crear nada en `public`.
create schema if not exists ss_semantica;
grant usage, create on schema ss_semantica to soporte_sap_metricas;

-- --- Privilegios: lo justo por rol --------------------------------------------------------------

grant usage on schema ss_priv to authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;
grant execute on all functions in schema ss_priv to authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;
revoke execute on function ss_priv.seudonimo(uuid) from public, authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;
grant usage on schema public to soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;
grant select on public.ss_organizacion, public.ss_miembro to authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma;

grant select, insert, update on public.ss_campo_extraido, public.ss_propuesta, public.ss_mapeo, public.ss_presupuesto to authenticated;
-- Por columna (PRP-010 H-16, H-10): ni las fechas ni el texto del cliente se reescriben, y de una impugnación
-- solo se decide su estado; el motivo y quien la levantó son del cliente.
grant select, insert on public.ss_incidencia, public.ss_impugnacion to authenticated;
grant update (sistema, modulo, componente, transaccion, mensaje_error, categoria, impacto, urgencia, prioridad, complejidad,
  regla_aplicada, estado) on public.ss_incidencia to authenticated;
grant update (estado, resuelta_por) on public.ss_impugnacion to authenticated;
grant select, insert on public.ss_escalamiento, public.ss_evento, public.ss_adjunto, public.ss_horas,
  public.ss_acceso_motivado, public.ss_chat_mensaje to authenticated;
grant update (revocado_en) on public.ss_acceso_motivado to authenticated;
grant select, insert on public.ss_consentimiento_nucleo to authenticated;
grant update (revocado_en) on public.ss_consentimiento_nucleo to authenticated;
grant select on public.ss_consentimiento_nucleo to soporte_sap_plataforma;
grant select on public.ss_cuarentena, public.ss_caso_sandbox, public.ss_contrato_sla, public.ss_sla_resultado,
  public.ss_crudo, public.ss_procedencia, public.ss_importacion_fila, public.ss_metrica to authenticated;

grant select on public.ss_incidencia, public.ss_escalamiento, public.ss_evento, public.ss_adjunto, public.ss_campo_extraido,
  public.ss_cuarentena, public.ss_caso_sandbox, public.ss_sla_resultado, public.ss_crudo, public.ss_mapeo,
  public.ss_procedencia, public.ss_presupuesto, public.ss_contrato_sla, public.ss_importacion_fila to soporte_sap_agente;
grant insert on public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta,
  public.ss_mapeo, public.ss_procedencia, public.ss_chat_mensaje to soporte_sap_agente;
grant update (estado, categoria, regla_aplicada, modulo, componente, transaccion, mensaje_error, impacto, urgencia, prioridad, complejidad)
  on public.ss_incidencia to soporte_sap_agente;

grant select on public.ss_incidencia, public.ss_adjunto to soporte_sap_ingesta;
grant insert on public.ss_adjunto to soporte_sap_ingesta;
grant insert on public.ss_campo_extraido to soporte_sap_ingesta;

grant select, delete on public.ss_incidencia, public.ss_escalamiento, public.ss_adjunto, public.ss_campo_extraido,
  public.ss_cuarentena, public.ss_sla_resultado, public.ss_horas, public.ss_mapeo,
  public.ss_procedencia, public.ss_importacion_fila to soporte_sap_plataforma;
-- Una impugnación es la evidencia de una queja: la plataforma la lee para exportarla, no la borra (R3-09). La
-- retención, cuando exista, es D8.
grant select on public.ss_impugnacion to soporte_sap_plataforma;
-- D8 (PRP-012): lo que borra tras la baja vencida, el original que marca y la baja que cumple. Sin `insert`.
grant delete on public.ss_contrato_sla, public.ss_consentimiento_nucleo, public.ss_presupuesto, public.ss_crudo,
  public.ss_acceso_motivado to soporte_sap_plataforma;
grant update (original_borrado_en) on public.ss_adjunto to soporte_sap_plataforma;
grant select, update (export_sha256, borrada_en) on public.ss_baja to soporte_sap_plataforma;
grant select, insert (consultora_id, cliente_id) on public.ss_baja to authenticated;
-- Sin `insert` en ninguna tabla (PRP-010 H-07). Lectura de todo lo que exporta: sin `ss_contrato_sla` y compañía,
-- `exportaTenant` con este rol fallaba con «permission denied».
grant select on public.ss_evento, public.ss_crudo, public.ss_contrato_sla, public.ss_presupuesto, public.ss_propuesta,
  public.ss_caso_sandbox, public.ss_acceso_motivado to soporte_sap_plataforma;
grant insert, update on public.ss_sla_resultado to soporte_sap_plataforma;

-- Métricas: privilegios POR COLUMNA. Ni `titulo`, ni `descripcion`, ni `nombre`, ni `motivo`.
grant select (id, tipo, padre_id, creada_en, tamano, sistema, usuarios_sap) on public.ss_organizacion to soporte_sap_metricas;
grant select (id, consultora_id, cliente_id, sistema, modulo, prioridad, complejidad, regla_aplicada, estado, creada_en,
  primera_respuesta_en, resuelta_en, cerrada_en) on public.ss_incidencia to soporte_sap_metricas;
grant select on public.ss_sla_resultado to soporte_sap_metricas;
grant select (consultora_id, cliente_id, incidencia_id, minutos, fecha) on public.ss_horas to soporte_sap_metricas;
grant select (crudo_id, indice, consultora_id, cliente_id, herramienta, version_mapeo, resultado, decidido_en)
  on public.ss_importacion_fila to soporte_sap_metricas;
grant select, insert on public.ss_metrica to soporte_sap_metricas;

-- Solo agregar: nadie cambia ni borra eventos ni crudo (además del disparador).
revoke update, delete on public.ss_evento, public.ss_crudo from authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma;
revoke update, delete on public.ss_metrica from authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;
-- Ninguna fila decidida sale de un rol de servicio: el agente no actualiza mapeos, campos ni propuestas.
revoke update on public.ss_mapeo, public.ss_campo_extraido, public.ss_propuesta from soporte_sap_agente, soporte_sap_ingesta;

-- --- Storage: tres buckets privados, ruta por tenant y nombre por sha256 -----------------------
--   ss-originales  {consultora}/{cliente}/{incidencia}/{sha256}   (lo que sube el cliente)
--   ss-sandbox     {consultora_origen}/{caso}/{sha256}             (solo anonimizado)
--   ss-exportes    {consultora}/{fecha}-{sha256}                   (export por tenant, ERP-6)

insert into storage.buckets (id, name, public) values
  ('ss-originales', 'ss-originales', false),
  ('ss-sandbox', 'ss-sandbox', false),
  ('ss-exportes', 'ss-exportes', false)
-- Privados SIEMPRE: con `do nothing`, un bucket que ya existiera como público se quedaba público (PRP-010 H-14).
on conflict (id) do update set public = false;

create or replace function ss_priv.carpeta(name text, n int) returns uuid language sql immutable set search_path = '' as $$
  select ss_priv.uuid_o_nulo((storage.foldername(name))[n])
$$;

-- D8 (PRP-012): un original borrado no vuelve a subir; lo que vence se puede borrar; y lo que queda de un tenant.
create or replace function ss_priv.original_dado_de_baja(nombre text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_adjunto a where a.ruta = nombre and a.original_borrado_en is not null)
$$;
create or replace function ss_priv.objeto_vencido(bucket text, nombre text) returns boolean language sql stable security definer set search_path = '' as $$
  select case bucket
    when 'ss-originales' then ss_priv.baja_vencida(ss_priv.carpeta(nombre, 1), ss_priv.carpeta(nombre, 2))
                           or exists (select 1 from public.ss_adjunto a where a.ruta = nombre and ss_priv.original_vencido(a.id))
    when 'ss-exportes' then ss_priv.baja_vencida(ss_priv.carpeta(nombre, 1), ss_priv.carpeta(nombre, 2))
    else false end
$$;
-- ¿Queda algo de ese tenant? (`cli` nulo: la consultora entera.) Lo que se queda a propósito no cuenta: el sandbox
-- anonimizado, las propuestas, el núcleo y las métricas (D8). La baja no se da por cumplida mientras quede algo.
create or replace function ss_priv.quedan_datos_de(cons uuid, cli uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ss_incidencia t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_evento t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_adjunto t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_horas t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_importacion_fila t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_contrato_sla t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_consentimiento_nucleo t where t.consultora_id = cons and (cli is null or t.cliente_id = cli))
      or exists (select 1 from public.ss_acceso_motivado t where ss_priv.padre_de(t.cliente_id) = cons and (cli is null or t.cliente_id = cli))
      or (cli is null and (exists (select 1 from public.ss_mapeo t where t.consultora_id = cons)
                        or exists (select 1 from public.ss_procedencia t where t.consultora_id = cons)
                        or exists (select 1 from public.ss_presupuesto t where t.consultora_id = cons)
                        or exists (select 1 from public.ss_crudo t where t.consultora_id = cons)))
      or exists (select 1 from storage.objects o where o.bucket_id in ('ss-originales', 'ss-exportes')
                   and ss_priv.carpeta(o.name, 1) = cons and (cli is null or ss_priv.carpeta(o.name, 2) = cli))
$$;


drop policy if exists ss_originales_lee on storage.objects;
create policy ss_originales_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-originales' and ss_priv.baja_original(ss_priv.carpeta(name, 2)));

-- Subir: SOLO la ingesta, después de validar los bytes (PRP-010 H-23). Antes subían el cliente o su consultora directo
-- al bucket, y un archivo que dice ser PNG y es otra cosa quedaba guardado sin pasar por `clasePorBytes`. La carpeta 1
-- es la consultora de la tarea, y la carpeta 2 tiene que ser cliente de la carpeta 1.
drop policy if exists ss_originales_sube on storage.objects;
drop policy if exists ss_originales_ingesta_sube on storage.objects;
create policy ss_originales_ingesta_sube on storage.objects for insert to soporte_sap_ingesta
  with check (bucket_id = 'ss-originales'
    and ss_priv.padre_de(ss_priv.carpeta(name, 2)) = ss_priv.carpeta(name, 1)
    and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea()
    and not ss_priv.en_baja(ss_priv.carpeta(name, 1), ss_priv.carpeta(name, 2))
    and not ss_priv.original_dado_de_baja(name));

-- D8 (PRP-012): la plataforma borra los bytes de un original vencido, o de un tenant cuya baja venció; los exportes
-- de su consultora, solo con la baja de la consultora vencida.
drop policy if exists ss_objetos_plataforma_borra on storage.objects;
create policy ss_objetos_plataforma_borra on storage.objects for delete to soporte_sap_plataforma
  using (bucket_id in ('ss-originales', 'ss-exportes') and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea()
         and ss_priv.objeto_vencido(bucket_id, name));


drop policy if exists ss_originales_ingesta on storage.objects;
create policy ss_originales_ingesta on storage.objects for select to soporte_sap_ingesta
  using (bucket_id = 'ss-originales' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

-- El manifiesto de objetos del export: la plataforma lista los de su consultora (sin esto, con su rol el manifiesto
-- salía vacío sin decir nada, PRP-010 H-08).
drop policy if exists ss_objetos_plataforma on storage.objects;
create policy ss_objetos_plataforma on storage.objects for select to soporte_sap_plataforma
  using (bucket_id in ('ss-originales', 'ss-sandbox', 'ss-exportes') and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

drop policy if exists ss_sandbox_lee_objetos on storage.objects;
create policy ss_sandbox_lee_objetos on storage.objects for select to authenticated
  using (bucket_id = 'ss-sandbox' and (ss_priv.es_laboratorio() or ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor'));

-- Nadie sube objetos al sandbox: es solo texto anonimizado, y una imagen no la revisa ningún cerrojo. El agente
-- subía cualquier objeto y todo el laboratorio lo leía (PRP-010, tercera revisión: R3-06).
drop policy if exists ss_sandbox_agente_sube on storage.objects;

-- Los exportes son de la consultora que se lleva sus datos: el laboratorio no los lee.
-- D8: el cliente que se va lee SU export ({consultora}/{cliente}/...), y nada más de ss-exportes.
drop policy if exists ss_exportes_cliente_lee on storage.objects;
create policy ss_exportes_cliente_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-exportes' and ss_priv.rol_en(ss_priv.carpeta(name, 2)) is not distinct from 'usuario_cliente');
drop policy if exists ss_exportes_lee on storage.objects;
create policy ss_exportes_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-exportes' and ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor');

-- La plataforma SUBE el export de su consultora. Era `for all` sobre exportes Y originales: con ella borraba un original
-- en cualquier momento, y ninguna prueba lo intentaba (hallazgo de D8, PRP-012). Leer es `ss_objetos_plataforma`;
-- borrar, `ss_objetos_plataforma_borra`, solo lo vencido.
drop policy if exists ss_exportes_plataforma on storage.objects;
create policy ss_exportes_plataforma on storage.objects for insert to soporte_sap_plataforma
  with check (bucket_id = 'ss-exportes' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

grant usage on schema storage to soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma;
grant select, insert on storage.objects to soporte_sap_ingesta;
grant select, insert, delete on storage.objects to soporte_sap_plataforma;
