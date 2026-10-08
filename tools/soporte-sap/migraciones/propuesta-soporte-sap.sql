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

do $$
declare r text;
begin
  foreach r in array array['soporte_sap_agente', 'soporte_sap_ingesta', 'soporte_sap_plataforma', 'soporte_sap_metricas'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin nobypassrls', r);
    end if;
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
create or replace function ss_priv.seudonimo(u uuid) returns text language sql immutable set search_path = '' as $$
  select 'usr-' || left(md5(u::text), 12)
$$;

-- La consultora de la tarea: el claim `consultora` del JWT que firmó quien encoló la tarea.
-- El alcance de un rol de servicio se VERIFICA en la base (PRP-010 H-21, DP-2). Antes, la consultora salía de
-- `request.jwt.claims`, que cualquier sesión con SQL fija con `set_config` (dentro de la misma consulta): con una tarea
-- de A se leía B. Ahora la sesión presenta el token CRUDO (`ss.tarea`, o la cabecera `x-tarea` vía PostgREST) y la base
-- comprueba la firma del orquestador, el vencimiento y que el rol del token sea el de la sesión. Sin token válido, la
-- consultora es nula y las políticas no dejan ver nada. pgcrypto vive en `extensions`, como en Supabase.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
  if current_user = 'authenticated' and new.actor <> ss_priv.seudonimo(auth.uid()) then
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

-- Quién emite qué (PRP-010 H-16, H-17, DP-4). Responder, pausar el reloj, resolver, cerrar, reabrir y cambiar la
-- prioridad son actos de una PERSONA de la consultora: una acción de la máquina no cuenta como primera respuesta
-- ni pausa el SLA. El cambio de prioridad lleva la nueva y su motivo.
create or replace function ss_priv.evento_de_quien_puede() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tipo in ('PRIMERA_RESPUESTA', 'ESPERA_CLIENTE', 'RESUELTA', 'CERRADA', 'REABIERTA', 'CAMBIO_PRIORIDAD')
     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) = 'consultor') then
    raise exception 'un evento % lo emite una persona de la consultora, no %', new.tipo, current_user;
  end if;
  if new.tipo = 'CAMBIO_PRIORIDAD' and (coalesce(new.datos->>'prioridad', '') not in ('P1', 'P2', 'P3', 'P4')
     or length(coalesce(new.datos->>'motivo', '')) < 10) then
    raise exception 'un cambio de prioridad lleva la nueva prioridad y un motivo';
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
  creado_en     timestamptz not null default now(),
  unique (incidencia_id, sha256),
  constraint ss_ruta_de_su_tenant check (ruta = consultora_id::text || '/' || cliente_id::text || '/' || incidencia_id::text || '/' || sha256)
);

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
    'caso de RR. HH. o nómina: revisión humana obligatoria antes del sandbox',
    'queda algo con forma de correo', 'queda una secuencia larga de dígitos',
    'queda un tratamiento seguido de un nombre', 'queda un posible usuario SAP']::text[])
);

-- El cliente puede impugnar una prioridad o una categoría; la resuelve su consultora.
create table if not exists public.ss_impugnacion (
  id            uuid primary key default gen_random_uuid(),
  incidencia_id uuid not null references public.ss_incidencia (id) on delete cascade,
  consultora_id uuid not null,
  cliente_id    uuid not null,
  campo         text not null check (campo in ('prioridad', 'categoria', 'complejidad', 'pausa')),
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
create table if not exists public.ss_caso_sandbox (
  id                   uuid primary key default gen_random_uuid(),
  origen_consultora_id uuid not null references public.ss_organizacion (id),
  texto                text not null,
  campos               jsonb not null default '{}'::jsonb,
  estado               text not null default 'aprendiendo' check (estado in ('aprendiendo', 'documentado', 'propuesto')),
  creado_en            timestamptz not null default now(),
  constraint ss_sandbox_sin_identificadores check (
    (texto || ' ' || campos::text) !~* '(@|\marroba\M|\(at\)|\[at\]|\mpunto[[:space:]]+com\M)'
    and (texto || ' ' || campos::text) !~ '[0-9]([[:space:]().-]{0,2}[0-9]){6,}'
    and (texto || ' ' || campos::text) !~* '\m[A-ZÑ&]{3,4}[0-9]{6}')
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
  constraint ss_a_medida_es_de_alguien check ((alcance = 'a_medida') = (consultora_id is not null)),
  constraint ss_decidida_tiene_quien check ((estado = 'propuesta') = (decidida_por is null))
);

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
  foreach t in array array['ss_importacion_fila', 'ss_metrica'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_tenencia', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function ss_priv.cliente_es_de_consultora()', t || '_tenencia', t);
  end loop;
end $$;

-- --- RLS: enable + force en toda tabla ------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ss_organizacion', 'ss_miembro', 'ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto',
    'ss_campo_extraido', 'ss_cuarentena', 'ss_impugnacion', 'ss_caso_sandbox', 'ss_propuesta', 'ss_acceso_motivado',
    'ss_contrato_sla', 'ss_sla_resultado', 'ss_horas', 'ss_presupuesto', 'ss_crudo', 'ss_mapeo',
    'ss_procedencia', 'ss_chat_mensaje', 'ss_importacion_fila', 'ss_metrica'] loop
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

-- La cuarentena no guarda datos, solo tipos de señal: el laboratorio la ve para revisarla.
drop policy if exists ss_cuarentena_lee on public.ss_cuarentena;
create policy ss_cuarentena_lee on public.ss_cuarentena for select to authenticated
  using (ss_priv.ve_cliente(cliente_id) or ss_priv.es_laboratorio());

-- Las horas son de la consultora: ni el cliente ni el laboratorio las leen fila por fila.
drop policy if exists ss_horas_lee on public.ss_horas;
create policy ss_horas_lee on public.ss_horas for select to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor');

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
drop policy if exists ss_metrica_lee on public.ss_metrica;
create policy ss_metrica_lee on public.ss_metrica for select to authenticated
  using ((alcance <> 'cliente' and ss_priv.es_laboratorio())
      or (alcance in ('consultora', 'cliente') and ss_priv.rol_en(consultora_id) = 'consultor')
      or (alcance = 'cliente' and visible_al_cliente and ss_priv.ve_cliente(cliente_id)));

drop policy if exists ss_chat_lee on public.ss_chat_mensaje;
create policy ss_chat_lee on public.ss_chat_mensaje for select to authenticated
  using (usuario_id = auth.uid());

-- Personas: escritura -----------------------------------------------------------------------

drop policy if exists ss_incidencia_alta on public.ss_incidencia;
create policy ss_incidencia_alta on public.ss_incidencia for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' or ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_incidencia_atiende on public.ss_incidencia;
create policy ss_incidencia_atiende on public.ss_incidencia for update to authenticated
  using (ss_priv.rol_en(consultora_id) = 'consultor') with check (ss_priv.rol_en(consultora_id) = 'consultor');

drop policy if exists ss_escalamiento_alta on public.ss_escalamiento;
create policy ss_escalamiento_alta on public.ss_escalamiento for insert to authenticated
  with check (ss_priv.rol_en(consultora_id) = 'consultor' and escalada_por = ss_priv.seudonimo(auth.uid()));

drop policy if exists ss_evento_alta on public.ss_evento;
create policy ss_evento_alta on public.ss_evento for insert to authenticated
  with check (ss_priv.ve_cliente(cliente_id) or ss_priv.lab_trabaja(incidencia_id));

drop policy if exists ss_adjunto_alta on public.ss_adjunto;
create policy ss_adjunto_alta on public.ss_adjunto for insert to authenticated
  with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' or ss_priv.rol_en(consultora_id) = 'consultor');

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
  with check (ss_priv.rol_en(consultora_id) = 'consultor' and consultor = ss_priv.seudonimo(auth.uid()));

-- Decidir una propuesta: lo a medida, el laboratorio; lo que va al núcleo, el superadministrador.
drop policy if exists ss_propuesta_decide on public.ss_propuesta;
create policy ss_propuesta_decide on public.ss_propuesta for update to authenticated
  using (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end)
  with check (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end);
drop policy if exists ss_propuesta_a_su_nombre on public.ss_propuesta;
create policy ss_propuesta_a_su_nombre on public.ss_propuesta as restrictive for update to authenticated
  with check (decidida_por is null or decidida_por = auth.uid());

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
create policy ss_propuesta_agente on public.ss_propuesta for insert to soporte_sap_agente
  with check (estado = 'propuesta' and decidida_por is null and (consultora_id is null or consultora_id = ss_priv.consultora_de_tarea()));

drop policy if exists ss_chat_agente on public.ss_chat_mensaje;
create policy ss_chat_agente on public.ss_chat_mensaje for insert to soporte_sap_agente
  with check (autor = 'agente');

-- La ingesta (sin modelo): ve incidencias y adjuntos de su consultora y deja campos POR REVISAR ----

drop policy if exists ss_incidencia_ingesta on public.ss_incidencia;
create policy ss_incidencia_ingesta on public.ss_incidencia for select to soporte_sap_ingesta
  using (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_adjunto_ingesta on public.ss_adjunto;
create policy ss_adjunto_ingesta on public.ss_adjunto for select to soporte_sap_ingesta
  using (consultora_id = ss_priv.consultora_de_tarea());
drop policy if exists ss_campo_ingesta on public.ss_campo_extraido;
create policy ss_campo_ingesta on public.ss_campo_extraido for insert to soporte_sap_ingesta
  with check (consultora_id = ss_priv.consultora_de_tarea() and estado = 'por_revisar' and revisado_por is null);

-- La plataforma (jobs declarados, C7): export y restauración por tenant de la consultora de su tarea.
do $$
declare t text;
begin
  foreach t in array array['ss_incidencia', 'ss_escalamiento', 'ss_evento', 'ss_adjunto', 'ss_campo_extraido', 'ss_cuarentena',
    'ss_impugnacion', 'ss_sla_resultado', 'ss_horas', 'ss_crudo', 'ss_mapeo', 'ss_procedencia', 'ss_importacion_fila'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plataforma', t);
    execute format('create policy %I on public.%I for all to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea()) with check (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma', t);
  end loop;
end $$;

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
grant insert on public.ss_campo_extraido to soporte_sap_ingesta;

grant select, insert, delete on public.ss_incidencia, public.ss_escalamiento, public.ss_adjunto, public.ss_campo_extraido,
  public.ss_cuarentena, public.ss_impugnacion, public.ss_sla_resultado, public.ss_horas, public.ss_mapeo,
  public.ss_procedencia to soporte_sap_plataforma;
grant select, insert on public.ss_evento, public.ss_crudo to soporte_sap_plataforma;
grant select, insert, delete on public.ss_importacion_fila to soporte_sap_plataforma;

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
on conflict (id) do nothing;

create or replace function ss_priv.carpeta(name text, n int) returns uuid language sql immutable set search_path = '' as $$
  select ss_priv.uuid_o_nulo((storage.foldername(name))[n])
$$;

drop policy if exists ss_originales_lee on storage.objects;
create policy ss_originales_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-originales' and ss_priv.baja_original(ss_priv.carpeta(name, 2)));

-- Subir: el cliente o su consultora, y la carpeta 2 tiene que ser cliente de la carpeta 1.
drop policy if exists ss_originales_sube on storage.objects;
create policy ss_originales_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'ss-originales'
    and ss_priv.padre_de(ss_priv.carpeta(name, 2)) = ss_priv.carpeta(name, 1)
    and (ss_priv.rol_en(ss_priv.carpeta(name, 2)) = 'usuario_cliente' or ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor'));

drop policy if exists ss_originales_ingesta on storage.objects;
create policy ss_originales_ingesta on storage.objects for select to soporte_sap_ingesta
  using (bucket_id = 'ss-originales' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

drop policy if exists ss_sandbox_lee_objetos on storage.objects;
create policy ss_sandbox_lee_objetos on storage.objects for select to authenticated
  using (bucket_id = 'ss-sandbox' and (ss_priv.es_laboratorio() or ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor'));

drop policy if exists ss_sandbox_agente_sube on storage.objects;
create policy ss_sandbox_agente_sube on storage.objects for insert to soporte_sap_agente
  with check (bucket_id = 'ss-sandbox' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

-- Los exportes son de la consultora que se lleva sus datos: el laboratorio no los lee.
drop policy if exists ss_exportes_lee on storage.objects;
create policy ss_exportes_lee on storage.objects for select to authenticated
  using (bucket_id = 'ss-exportes' and ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor');

drop policy if exists ss_exportes_plataforma on storage.objects;
create policy ss_exportes_plataforma on storage.objects for all to soporte_sap_plataforma
  using (bucket_id in ('ss-exportes', 'ss-originales') and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea())
  with check (bucket_id = 'ss-exportes' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());

grant usage on schema storage to soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma;
grant select on storage.objects to soporte_sap_ingesta;
grant insert on storage.objects to soporte_sap_agente;
grant select, insert, delete on storage.objects to soporte_sap_plataforma;
