-- =============================================================================
-- Ágora · 003 · el tablero: ítems con campos tipados, dependencias sin ciclos, historial por campo
-- (solo se agrega), recordatorios, el vínculo con el calendario y los avisos. Idempotente.
--
-- Lo que la base impone, no la UI: un monto NO lo cambia nadie directo (va por propuesta y lo aplica
-- `aplica_propuesta`); asignar a un externo tampoco; «Listo» exige las dependencias cerradas; un
-- colaborador solo toca el progreso y las etiquetas de lo suyo; los agentes no editan nada.
-- =============================================================================
set check_function_bodies = off;

create table if not exists agora.item (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references agora.org (id) on delete cascade,
  categoria_id        uuid not null references agora.nodo (id) on delete cascade,
  grupo               text not null default 'General',
  nombre              text not null check (length(nombre) between 2 and 200),
  estado              text not null default 'todo' check (estado in ('todo', 'doing', 'review', 'block', 'done')),
  responsable_persona uuid references agora.persona (id) on delete set null,
  responsable_agente  uuid references agora.agente (id) on delete set null,
  prioridad           text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  inicio              date,
  fin                 date,
  monto_mxn           numeric(14,2) check (monto_mxn is null or monto_mxn >= 0),
  progreso            int not null default 0 check (progreso between 0 and 100),
  etiquetas           text[] not null default '{}',
  vinculo             text check (vinculo is null or vinculo ~ '^https://[a-z0-9.-]+(/[^\s]*)?$'),
  archivo             jsonb check (archivo is null or (archivo ? 'nombre' and archivo ? 'sha256' and (archivo ->> 'bytes')::bigint between 1 and 10485760)),
  hilo_id             uuid,
  version_fecha       int not null default 1,
  fecha_real          date,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint cronograma check (inicio is null or fin is null or inicio <= fin),
  constraint un_responsable check (not (responsable_persona is not null and responsable_agente is not null))
);
create index if not exists ix_item_categoria on agora.item (categoria_id);

create table if not exists agora.dependencia (
  org_id     uuid not null references agora.org (id) on delete cascade,
  item_id    uuid not null references agora.item (id) on delete cascade,
  depende_de uuid not null references agora.item (id) on delete cascade,
  primary key (item_id, depende_de),
  constraint sin_autodependencia check (item_id <> depende_de)
);

-- Cada cambio de campo: antes, después, quién, por qué propuesta y su traza. Solo se agrega.
create table if not exists agora.item_historial (
  id              bigserial primary key,
  org_id          uuid not null references agora.org (id) on delete cascade,
  item_id         uuid not null references agora.item (id) on delete cascade,
  campo           text not null,
  antes           jsonb,
  despues         jsonb,
  actor_tipo      text not null check (actor_tipo in ('humano', 'agente', 'sistema')),
  actor_persona   uuid,
  actor_agente    uuid,
  propuesta_id    uuid,
  traza_id        uuid not null default gen_random_uuid(),
  deshacer_hasta  timestamptz,
  deshace         bigint references agora.item_historial (id),
  cuando          timestamptz not null default now()
);
create index if not exists ix_historial_item on agora.item_historial (item_id, cuando desc);

-- Los tipos de campo de las columnas: el editor de cada una lo decide su tipo (dato, no código).
create table if not exists agora.columna (
  org_id  uuid not null references agora.org (id) on delete cascade,
  clave   text not null check (clave ~ '^[a-z_]+$'),
  nombre  text not null,
  tipo    text not null check (tipo in ('texto', 'estado', 'fecha', 'cronograma', 'persona', 'prioridad', 'moneda', 'progreso',
                                        'dependencia', 'etiquetas', 'vinculo', 'archivo', 'hilo', 'formula')),
  config  jsonb not null default '{}',
  orden   int not null default 0,
  primary key (org_id, clave)
);

create table if not exists agora.recordatorio (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references agora.org (id) on delete cascade,
  item_id   uuid references agora.item (id) on delete cascade,
  agente_id uuid references agora.agente (id) on delete cascade,
  tipo      text not null check (tipo in ('fecha_3d', 'fecha_1d', 'vence', 'seguimiento', 'cierre')),
  cuando    timestamptz not null,
  clave     text not null unique,
  estado    text not null default 'programado' check (estado in ('programado', 'disparado', 'cancelado'))
);

-- El evento del calendario que calendariza la fecha de un ítem: clave item:<id>:fecha:v<n>. Un reintento
-- con la misma clave no crea otro (la pluma de tools/calendario es idempotente por clave; aquí, la llave única).
create table if not exists agora.item_evento (
  org_id        uuid not null references agora.org (id) on delete cascade,
  item_id       uuid not null references agora.item (id) on delete cascade,
  version_fecha int not null,
  clave         text not null unique,
  evento_ref    text not null,
  creado_en     timestamptz not null default now()
);

-- Avisos: lo que llega al hilo y a «Espera tu clic». La clave hace que haya UN aviso por tope y por ventana.
create table if not exists agora.aviso (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  clave        text not null,
  tipo         text not null check (tipo in ('tope_80', 'tope_100', 'presupuesto_desviacion', 'fecha_3d', 'fecha_1d', 'atrasado',
                                             'deriva_tarjeta', 'cierre_proximo', 'sin_responsable', 'sin_avance', 'suspension')),
  para_rol     text,
  para_persona uuid,
  nodo_id      uuid references agora.nodo (id) on delete cascade,
  agente_id    uuid references agora.agente (id) on delete cascade,
  item_id      uuid references agora.item (id) on delete cascade,
  texto        text not null,
  creado_en    timestamptz not null default now(),
  atendido     boolean not null default false,
  unique (org_id, clave)
);

-- --- Coherencia del ítem -------------------------------------------------------------------------------
create or replace function agora_priv.item_coherente() returns trigger language plpgsql security definer set search_path = '' as $$
declare c agora.nodo;
begin
  select * into c from agora.nodo where id = new.categoria_id;
  if not found or c.tipo <> 'categoria' or c.org_id <> new.org_id then
    raise exception 'un ítem vive en una categoría de su organización' using errcode = 'AG400';
  end if;
  if new.responsable_persona is not null and not exists (select 1 from agora.persona p where p.id = new.responsable_persona and p.org_id = new.org_id) then
    raise exception 'el responsable no es de la organización' using errcode = 'AG400';
  end if;
  if new.responsable_agente is not null and not exists (
       select 1 from agora.agente a where a.id = new.responsable_agente and a.org_id = new.org_id and a.estado in ('aprobado', 'prueba')
         and agora_priv.agente_alcanza(a.id, new.categoria_id)) then
    raise exception 'un agente solo es responsable dentro de su alcance y con su idCard vivo' using errcode = 'AG400';
  end if;
  if new.estado = 'done' and (tg_op = 'INSERT' or old.estado <> 'done') and exists (
       select 1 from agora.dependencia d join agora.item p on p.id = d.depende_de where d.item_id = new.id and p.estado <> 'done') then
    raise exception '«Listo» exige las dependencias cerradas' using errcode = 'AG409';
  end if;
  if tg_op = 'UPDATE' then
    if new.fin is distinct from old.fin or new.inicio is distinct from old.inicio then new.version_fecha := old.version_fecha + 1; end if;
    if new.estado = 'done' and old.estado <> 'done' then new.fecha_real := current_date; new.progreso := 100; end if;
    new.actualizado_en := now();
  end if;
  return new;
end $$;
drop trigger if exists tg_item_coherente on agora.item;
create trigger tg_item_coherente before insert or update on agora.item for each row execute function agora_priv.item_coherente();

/** Lo que una persona puede cambiar DIRECTO. Lo demás va por propuesta. Lo aprobado (aplica_propuesta) pasa. */
create or replace function agora_priv.item_guarda() returns trigger language plpgsql set search_path = '' as $$
declare
  editor boolean;
  suyo boolean;
  externo boolean;
begin
  if agora_priv.confiable() then return new; end if; -- lo aprobado (aplica_propuesta), la siembra del laboratorio
  if current_user <> 'authenticated' then
    raise exception 'un agente no edita el tablero: propone' using errcode = 'AG403';
  end if;
  editor := agora_priv.tiene_rol(new.org_id, new.categoria_id, array['propietario', 'administrador', 'aprobador', 'editor']);
  if tg_op = 'INSERT' then
    if not editor then raise exception 'crear un ítem: lo propone quien no es editor' using errcode = 'AG403'; end if;
    if new.monto_mxn is not null and new.monto_mxn > 0 then
      raise exception 'un ítem con monto se crea por propuesta: el dinero lo aprueba quien dice la matriz' using errcode = 'AG403';
    end if;
    if new.responsable_agente is not null and exists (select 1 from agora.agente a where a.id = new.responsable_agente and a.origen = 'externo') then
      raise exception 'asignar a un externo pide aprobador: va por propuesta' using errcode = 'AG403';
    end if;
    return new;
  end if;
  if new.monto_mxn is distinct from old.monto_mxn then
    raise exception 'un monto no se cambia directo: va por propuesta y lo aprueba quien dice la matriz' using errcode = 'AG403';
  end if;
  if new.categoria_id <> old.categoria_id or new.org_id <> old.org_id then
    raise exception 'un ítem no cambia de categoría ni de organización' using errcode = 'AG403';
  end if;
  externo := new.responsable_agente is distinct from old.responsable_agente and new.responsable_agente is not null
             and exists (select 1 from agora.agente a where a.id = new.responsable_agente and a.origen = 'externo');
  if externo then raise exception 'asignar a un externo pide aprobador: va por propuesta' using errcode = 'AG403'; end if;
  if editor then return new; end if;
  suyo := old.responsable_persona = auth.uid() and agora_priv.tiene_rol(new.org_id, new.categoria_id, array['colaborador']);
  if suyo and (new.nombre, new.estado, new.prioridad, new.inicio, new.fin, new.responsable_persona, new.responsable_agente, new.vinculo, new.archivo)
              is not distinct from (old.nombre, old.estado, old.prioridad, old.inicio, old.fin, old.responsable_persona, old.responsable_agente, old.vinculo, old.archivo) then
    return new;
  end if;
  raise exception 'tu rol no cambia ese campo directo: propónlo en el hilo' using errcode = 'AG403';
end $$;
drop trigger if exists tg_item_guarda on agora.item;
create trigger tg_item_guarda before insert or update on agora.item for each row execute function agora_priv.item_guarda();

/** El historial lo escribe la base: no depende de que la app se acuerde. Lo anota una función `definer` que
 *  solo corre DENTRO de un disparador (pg_trigger_depth > 0): nadie la llama a mano para inventar historia. */
create or replace function agora_priv.anota_historial(o uuid, it uuid, campo text, antes jsonb, despues jsonb, actor_tipo text,
    persona uuid, agente uuid, prop uuid, deshacer timestamptz) returns void language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 0 then raise exception 'el historial solo lo anota la base' using errcode = 'AG403'; end if;
  insert into agora.item_historial (org_id, item_id, campo, antes, despues, actor_tipo, actor_persona, actor_agente, propuesta_id, deshacer_hasta)
  values (o, it, campo, antes, despues, actor_tipo, persona, agente, prop, deshacer);
end $$;

-- Este disparador NO es definer: corre con el rol de quien cambia el ítem, así `confiable()` dice si el cambio
-- viene de lo aprobado (una función de la base) o de una persona. Solo lo aprobado se atribuye a una propuesta.
create or replace function agora_priv.item_historia() returns trigger language plpgsql set search_path = '' as $$
declare
  campo text;
  a jsonb := to_jsonb(old);
  d jsonb := to_jsonb(new);
  aplicando boolean := agora_priv.confiable();
  prop uuid := case when aplicando then nullif(current_setting('agora.propuesta', true), '')::uuid end;
  nivel text := case when aplicando then nullif(current_setting('agora.nivel', true), '') end;
  autor_agente uuid := case when aplicando then nullif(current_setting('agora.autor_agente', true), '')::uuid end;
  quien uuid := case when aplicando then nullif(current_setting('agora.autor_persona', true), '')::uuid else auth.uid() end;
begin
  foreach campo in array array['nombre', 'estado', 'responsable_persona', 'responsable_agente', 'prioridad', 'inicio', 'fin', 'monto_mxn', 'progreso', 'etiquetas', 'vinculo', 'archivo'] loop
    if (a -> campo) is distinct from (d -> campo) then
      perform agora_priv.anota_historial(new.org_id, new.id, campo, a -> campo, d -> campo,
        case when autor_agente is not null then 'agente' when quien is not null then 'humano' else 'sistema' end,
        case when autor_agente is null then quien end, autor_agente, prop,
        case when nivel = 'A2' then now() + interval '24 hours' end);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists tg_item_historia on agora.item;
create trigger tg_item_historia after update on agora.item for each row execute function agora_priv.item_historia();

create or replace function agora_priv.dependencia_sin_ciclo() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from agora.item a, agora.item b where a.id = new.item_id and b.id = new.depende_de and (a.org_id <> new.org_id or b.org_id <> new.org_id)) then
    raise exception 'la dependencia cruza organizaciones' using errcode = 'AG400';
  end if;
  if exists (
    with recursive cadena(id) as (
      select new.depende_de
      union
      select d.depende_de from agora.dependencia d join cadena c on d.item_id = c.id
    ) select 1 from cadena where id = new.item_id) then
    raise exception 'esa dependencia cierra un ciclo' using errcode = 'AG409';
  end if;
  return new;
end $$;
drop trigger if exists tg_dependencia_sin_ciclo on agora.dependencia;
create trigger tg_dependencia_sin_ciclo before insert or update on agora.dependencia for each row execute function agora_priv.dependencia_sin_ciclo();

create or replace function agora_priv.solo_agregar() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% solo se agrega: no se edita ni se borra', tg_table_name using errcode = 'AG403';
end $$;
drop trigger if exists tg_historial_solo_agregar on agora.item_historial;
create trigger tg_historial_solo_agregar before update or delete on agora.item_historial for each row execute function agora_priv.solo_agregar();
