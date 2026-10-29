-- =============================================================================
-- Ágora · 005 · el libro de costos: control presupuestal por compromisos (encumbrance accounting).
-- Idempotente.
--
-- Tres cifras por centro, nunca una (más la que se calcula):
--   · presupuesto   aprobado por Finanzas y versionado (quién, cuándo, por qué), por categoría y mes;
--   · comprometido  lo aprobado y aún no ejercido; nace SOLO de una propuesta aprobada; se libera o se
--                   convierte en ejercido, nunca se cuenta dos veces;
--   · ejercido      el costo real CON evidencia: un CFDI (UUID), un comprobante (sha256) o el registro de
--                   uso de un modelo. Sin evidencia no hay ejercido: hay pendiente.
--   · disponible    = presupuesto − comprometido vigente − ejercido
--                   (= presupuesto − compromisos aprobados − ejercido que no venía de un compromiso).
--
-- El gasto de modelo se registra en USD por llamada y se lleva a MXN con un tipo de cambio CON FUENTE Y
-- FECHA; sin tipo de cambio, o sin datos de uso, la cifra en MXN es NULL y se cuenta como «sin costo»
-- (null no es cero). Los topes de gasto por agente leen ESTAS filas: no hay un segundo contador.
-- =============================================================================
set check_function_bodies = off;

create table if not exists agora.tipo_cambio (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  moneda      text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
  valor_mxn   numeric(12,6) not null check (valor_mxn > 0),
  fuente      text not null check (length(btrim(fuente)) >= 3),
  serie       text,
  fuente_url  text not null check (fuente_url ~ '^https://'),
  publicado   date not null,
  nota        text,
  unique (fecha, moneda, fuente),
  constraint publicado_despues check (publicado >= fecha)
);

create table if not exists agora.periodo (
  org_id      uuid not null references agora.org (id) on delete cascade,
  periodo     text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  estado      text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cerrado_por uuid,
  cerrado_en  timestamptz,
  cita        text,
  primary key (org_id, periodo),
  constraint cierre_completo check (estado = 'abierto' or (cerrado_por is not null and cerrado_en is not null and length(coalesce(cita, '')) >= 8))
);

create or replace function agora_priv.periodo_cerrado(o uuid, p text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from agora.periodo x where x.org_id = o and x.periodo = p and x.estado = 'cerrado')
$$;

/** El periodo donde cae un gasto de hoy: el del mes si está abierto; si no, el primero abierto después. */
create or replace function agora_priv.periodo_de_registro(o uuid, cuando timestamptz) returns text language plpgsql stable security definer set search_path = '' as $$
declare
  zona text := coalesce((select c.zona from agora.org_config c where c.org_id = o), 'America/Mexico_City');
  d date := (cuando at time zone zona)::date;
  p text;
begin
  for k in 0..24 loop
    p := to_char(date_trunc('month', d) + make_interval(months => k), 'YYYY-MM');
    if not agora_priv.periodo_cerrado(o, p) then return p; end if;
  end loop;
  raise exception 'no hay periodo abierto' using errcode = 'AG409';
end $$;

/** Un periodo cerrado no se edita: tras el cierre solo cabe reclasificar en el periodo abierto. */
create or replace function agora_priv.periodo_no_cerrado() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and agora_priv.periodo_cerrado(old.org_id, old.periodo) then
    raise exception 'el periodo % está cerrado: no se edita, se reclasifica en el periodo abierto', old.periodo using errcode = 'AG409';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and agora_priv.periodo_cerrado(new.org_id, new.periodo) then
    raise exception 'el periodo % está cerrado: no se edita, se reclasifica en el periodo abierto', new.periodo using errcode = 'AG409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- --- Presupuesto versionado ------------------------------------------------------------------------------
create table if not exists agora.presupuesto (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  categoria_id uuid not null references agora.nodo (id) on delete cascade,
  periodo      text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  version      int not null check (version >= 1),
  importe_mxn  numeric(14,2) not null check (importe_mxn >= 0),
  motivo       text not null check (length(motivo) >= 3),
  quien        uuid,
  aprobado_por uuid,
  propuesta_id uuid references agora.propuesta (id),
  cuando       timestamptz not null default now(),
  unique (categoria_id, periodo, version)
);

create or replace function agora_priv.presupuesto_coherente() returns trigger language plpgsql set search_path = '' as $$
begin
  if not agora_priv.confiable() then raise exception 'un presupuesto lo aprueba Finanzas por propuesta: no se escribe directo' using errcode = 'AG403'; end if;
  if not exists (select 1 from agora.nodo n where n.id = new.categoria_id and n.tipo = 'categoria' and n.org_id = new.org_id) then
    raise exception 'el presupuesto es de una categoría de su organización' using errcode = 'AG400';
  end if;
  new.version := coalesce((select max(p.version) from agora.presupuesto p where p.categoria_id = new.categoria_id and p.periodo = new.periodo), 0) + 1;
  return new;
end $$;
drop trigger if exists tg_presupuesto_coherente on agora.presupuesto;
create trigger tg_presupuesto_coherente before insert on agora.presupuesto for each row execute function agora_priv.presupuesto_coherente();
drop trigger if exists tg_presupuesto_periodo on agora.presupuesto;
create trigger tg_presupuesto_periodo before insert or update or delete on agora.presupuesto for each row execute function agora_priv.periodo_no_cerrado();
drop trigger if exists tg_presupuesto_solo_agregar on agora.presupuesto;
create trigger tg_presupuesto_solo_agregar before update or delete on agora.presupuesto for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

-- --- Compromisos ------------------------------------------------------------------------------------------
create table if not exists agora.compromiso (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references agora.org (id) on delete cascade,
  categoria_id  uuid not null references agora.nodo (id) on delete cascade,
  item_id       uuid references agora.item (id) on delete set null,
  periodo       text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  importe_mxn   numeric(14,2) not null check (importe_mxn > 0),
  liberado_mxn  numeric(14,2) not null default 0 check (liberado_mxn >= 0),
  propuesta_id  uuid not null references agora.propuesta (id),
  aprobacion_id uuid not null references agora.aprobacion (id),
  estado        text not null default 'vigente' check (estado in ('vigente', 'liberado', 'ejercido')),
  concepto      text not null,
  creado_en     timestamptz not null default now(),
  constraint liberado_tope check (liberado_mxn <= importe_mxn)
);

/** Un compromiso sin aprobación no existe: lo exige la base, también para quien escribe como servicio. */
create or replace function agora_priv.compromiso_con_aprobacion() returns trigger language plpgsql set search_path = '' as $$
declare p agora.propuesta;
begin
  select * into p from agora.propuesta where id = new.propuesta_id;
  if not found or p.org_id <> new.org_id or p.estado not in ('aprobada', 'aplicada') then
    raise exception 'un compromiso nace de una propuesta aprobada' using errcode = 'AG403';
  end if;
  if not exists (select 1 from agora.aprobacion a where a.id = new.aprobacion_id and a.propuesta_id = p.id and a.decision = 'aprobar' and a.sha256 = p.sha256) then
    raise exception 'un compromiso sin su fila de aprobación no existe' using errcode = 'AG403';
  end if;
  if not agora_priv.firmas_completas(p.id) then raise exception 'la propuesta no tiene todas sus firmas' using errcode = 'AG403'; end if;
  return new;
end $$;
drop trigger if exists tg_compromiso_con_aprobacion on agora.compromiso;
create trigger tg_compromiso_con_aprobacion before insert on agora.compromiso for each row execute function agora_priv.compromiso_con_aprobacion();
drop trigger if exists tg_compromiso_periodo on agora.compromiso;
create trigger tg_compromiso_periodo before insert or update or delete on agora.compromiso for each row execute function agora_priv.periodo_no_cerrado();

-- --- El ejercido con evidencia ------------------------------------------------------------------------------
create table if not exists agora.costo (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references agora.org (id) on delete cascade,
  categoria_id     uuid not null references agora.nodo (id) on delete cascade,
  item_id          uuid references agora.item (id) on delete set null,
  compromiso_id    uuid references agora.compromiso (id),
  periodo          text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  importe_mxn      numeric(14,2) not null check (importe_mxn > 0),
  concepto         text not null check (length(concepto) >= 3),
  tipo             text not null check (tipo in ('cfdi', 'comprobante', 'reclasificacion')),
  evidencia_uuid   uuid,
  evidencia_sha256 text check (evidencia_sha256 is null or evidencia_sha256 ~ '^[0-9a-f]{64}$'),
  proveedor_rfc    text check (proveedor_rfc is null or proveedor_rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  proveedor        text,
  estado           text not null default 'pendiente' check (estado in ('ejercido', 'pendiente')),
  reclasifica      uuid references agora.costo (id),
  de_categoria_id  uuid references agora.nodo (id),
  registrado_por   uuid,
  cuando           timestamptz not null default now(),
  -- Sin evidencia no hay ejercido: hay pendiente.
  constraint ejercido_con_evidencia check (estado = 'pendiente' or
    (tipo = 'cfdi' and evidencia_uuid is not null) or
    (tipo = 'comprobante' and evidencia_sha256 is not null) or
    (tipo = 'reclasificacion' and reclasifica is not null and de_categoria_id is not null)),
  constraint reclasificacion_coherente check ((tipo = 'reclasificacion') = (reclasifica is not null))
);
-- El mismo costo dos veces no cabe: la misma evidencia (UUID o huella del comprobante) es un duplicado.
create unique index if not exists ux_costo_uuid on agora.costo (org_id, evidencia_uuid) where evidencia_uuid is not null;
create unique index if not exists ux_costo_sha on agora.costo (org_id, evidencia_sha256) where evidencia_sha256 is not null;

create or replace function agora_priv.costo_coherente() returns trigger language plpgsql set search_path = '' as $$
declare o agora.costo;
begin
  if not exists (select 1 from agora.nodo n where n.id = new.categoria_id and n.tipo = 'categoria' and n.org_id = new.org_id) then
    raise exception 'un costo cae en una categoría de su organización' using errcode = 'AG400';
  end if;
  if new.compromiso_id is not null and not exists (
       select 1 from agora.compromiso c where c.id = new.compromiso_id and c.org_id = new.org_id and c.categoria_id = new.categoria_id and c.estado = 'vigente') then
    raise exception 'el compromiso no es de ese centro o ya no está vigente' using errcode = 'AG409';
  end if;
  if new.tipo = 'reclasificacion' then
    select * into o from agora.costo where id = new.reclasifica;
    if not found or o.org_id <> new.org_id or o.estado <> 'ejercido' or o.categoria_id <> new.de_categoria_id or new.importe_mxn > o.importe_mxn then
      raise exception 'una reclasificación mueve un ejercido existente, por no más de su importe' using errcode = 'AG409';
    end if;
  end if;
  if not agora_priv.confiable() then new.registrado_por := agora_priv.uid(); new.cuando := now(); end if;
  return new;
end $$;
drop trigger if exists tg_costo_coherente on agora.costo;
create trigger tg_costo_coherente before insert or update on agora.costo for each row execute function agora_priv.costo_coherente();
drop trigger if exists tg_costo_periodo on agora.costo;
-- «tg_a…»: los disparadores corren por nombre; el del periodo cerrado va primero para que su motivo sea el que se lee.
drop trigger if exists tg_a_costo_periodo on agora.costo;
create trigger tg_a_costo_periodo before insert or update or delete on agora.costo for each row execute function agora_priv.periodo_no_cerrado();

-- --- El gasto de modelo de los agentes: USD por llamada, MXN con tipo de cambio con fuente --------------------
create table if not exists agora.gasto_modelo (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references agora.org (id) on delete cascade,
  -- A quién se cobra: el agente que ORIGINÓ la llamada (si la pidió una persona, el agente que la ejecutó).
  agente_id      uuid not null references agora.agente (id),
  ejecutado_por  uuid not null references agora.agente (id),
  solicitado_por uuid references agora.persona (id),
  categoria_id   uuid not null references agora.nodo (id),
  item_id        uuid references agora.item (id) on delete set null,
  propuesta_id   uuid references agora.propuesta (id) on delete set null,
  proveedor      text not null,
  modelo         text not null check (modelo !~* '(^|[/:])latest$'),
  tokens_entrada int check (tokens_entrada is null or tokens_entrada >= 0),
  tokens_salida  int check (tokens_salida is null or tokens_salida >= 0),
  costo_usd      numeric(12,6) check (costo_usd is null or costo_usd >= 0),
  tipo_cambio_id uuid references agora.tipo_cambio (id),
  costo_mxn      numeric(12,2),
  periodo        text not null default '0000-00',
  cuando         timestamptz not null default now()
);
create index if not exists ix_gasto_agente on agora.gasto_modelo (agente_id, periodo);

create or replace function agora_priv.gasto_coherente() returns trigger language plpgsql set search_path = '' as $$
declare
  tc agora.tipo_cambio;
  zona text := coalesce((select c.zona from agora.org_config c where c.org_id = new.org_id), 'America/Mexico_City');
begin
  if current_user = 'agora_agente' then
    if agora_priv.agente_de_tarea() is distinct from new.ejecutado_por then raise exception 'un agente registra lo que él ejecutó' using errcode = 'AG403'; end if;
    new.cuando := now();
  elsif not agora_priv.confiable() then
    raise exception 'el gasto de modelo lo registra el agente que llamó al modelo' using errcode = 'AG403';
  end if;
  if not exists (select 1 from agora.agente a where a.id = new.agente_id and a.org_id = new.org_id)
     or not exists (select 1 from agora.agente a where a.id = new.ejecutado_por and a.org_id = new.org_id and a.origen = 'interno')
     or not exists (select 1 from agora.nodo n where n.id = new.categoria_id and n.tipo = 'categoria' and n.org_id = new.org_id) then
    raise exception 'el gasto se imputa a un agente y a una categoría de su organización (lo ejecuta un interno)' using errcode = 'AG400';
  end if;
  new.periodo := agora_priv.periodo_de_registro(new.org_id, new.cuando);
  -- El tipo de cambio: el publicado más reciente a esa fecha (cinco días como máximo). Sin él, MXN es null.
  select * into tc from agora.tipo_cambio t
   where t.moneda = 'USD' and t.fecha <= (new.cuando at time zone zona)::date and t.fecha >= (new.cuando at time zone zona)::date - 5
   order by t.fecha desc, t.publicado desc limit 1;
  new.tipo_cambio_id := case when found then tc.id end;
  new.costo_mxn := case when new.costo_usd is not null and found then round(new.costo_usd * tc.valor_mxn, 2) end;
  return new;
end $$;
drop trigger if exists tg_gasto_coherente on agora.gasto_modelo;
create trigger tg_gasto_coherente before insert on agora.gasto_modelo for each row execute function agora_priv.gasto_coherente();
drop trigger if exists tg_gasto_periodo on agora.gasto_modelo;
create trigger tg_gasto_periodo before update or delete on agora.gasto_modelo for each row execute function agora_priv.periodo_no_cerrado();
drop trigger if exists tg_gasto_solo_agregar on agora.gasto_modelo;
create trigger tg_gasto_solo_agregar before update or delete on agora.gasto_modelo for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

-- --- Las cifras del libro (una sola fuente: estas vistas) ------------------------------------------------------
create or replace view agora.v_compromiso_saldo with (security_invoker = true) as
  select c.*, coalesce(e.ejercido, 0) as ejercido_mxn,
         greatest(c.importe_mxn - c.liberado_mxn - coalesce(e.ejercido, 0), 0) as vigente_mxn
    from agora.compromiso c
    left join lateral (select sum(x.importe_mxn) ejercido from agora.costo x where x.compromiso_id = c.id and x.estado = 'ejercido') e on true;

create or replace view agora.v_centro_periodo with (security_invoker = true) as
  with periodos as (
    select org_id, categoria_id, periodo from agora.presupuesto
    union select org_id, categoria_id, periodo from agora.compromiso
    union select org_id, categoria_id, periodo from agora.costo
    union select org_id, de_categoria_id, periodo from agora.costo where de_categoria_id is not null
    union select org_id, categoria_id, periodo from agora.gasto_modelo
  ),
  pres as (
    select distinct on (categoria_id, periodo) categoria_id, periodo, importe_mxn, version
      from agora.presupuesto order by categoria_id, periodo, version desc
  ),
  comp as (
    select categoria_id, periodo, sum(importe_mxn - liberado_mxn) aprobado, sum(vigente_mxn) vigente from agora.v_compromiso_saldo where estado <> 'liberado' or liberado_mxn < importe_mxn group by 1, 2
  ),
  cost as (
    select categoria_id, periodo,
           sum(importe_mxn) filter (where estado = 'ejercido' and tipo <> 'reclasificacion') ejercido,
           sum(importe_mxn) filter (where estado = 'ejercido' and tipo <> 'reclasificacion' and compromiso_id is not null) de_compromiso,
           sum(importe_mxn) filter (where estado = 'pendiente') pendiente,
           count(*) filter (where estado = 'pendiente') pendientes
      from agora.costo group by 1, 2
  ),
  recl as (
    select categoria_id, periodo, sum(importe_mxn) entra from agora.costo where tipo = 'reclasificacion' and estado = 'ejercido' group by 1, 2
  ),
  recl_sale as (
    select de_categoria_id categoria_id, periodo, sum(importe_mxn) sale from agora.costo where tipo = 'reclasificacion' and estado = 'ejercido' group by 1, 2
  ),
  gast as (
    select categoria_id, periodo, sum(costo_mxn) mxn, count(*) llamadas, count(*) filter (where costo_mxn is null) sin_costo, sum(costo_usd) usd
      from agora.gasto_modelo group by 1, 2
  )
  select p.org_id, p.categoria_id, p.periodo,
         coalesce(pr.importe_mxn, 0)::numeric(14,2) as presupuesto_mxn,
         pr.version as presupuesto_version,
         coalesce(cm.aprobado, 0)::numeric(14,2) as compromisos_aprobados_mxn,
         coalesce(cm.vigente, 0)::numeric(14,2) as comprometido_mxn,
         (coalesce(co.ejercido, 0) + coalesce(rc.entra, 0) - coalesce(rs.sale, 0) + coalesce(g.mxn, 0))::numeric(14,2) as ejercido_mxn,
         coalesce(co.de_compromiso, 0)::numeric(14,2) as ejercido_de_compromiso_mxn,
         coalesce(g.mxn, 0)::numeric(14,2) as gasto_modelo_mxn,
         coalesce(g.usd, 0)::numeric(14,6) as gasto_modelo_usd,
         coalesce(g.llamadas, 0)::int as llamadas_modelo,
         coalesce(g.sin_costo, 0)::int as filas_sin_costo,
         coalesce(co.pendiente, 0)::numeric(14,2) as pendiente_mxn,
         coalesce(co.pendientes, 0)::int as pendientes,
         (coalesce(pr.importe_mxn, 0) - coalesce(cm.vigente, 0)
           - (coalesce(co.ejercido, 0) + coalesce(rc.entra, 0) - coalesce(rs.sale, 0) + coalesce(g.mxn, 0)))::numeric(14,2) as disponible_mxn
    from (select distinct org_id, categoria_id, periodo from periodos) p
    left join pres pr on pr.categoria_id = p.categoria_id and pr.periodo = p.periodo
    left join comp cm on cm.categoria_id = p.categoria_id and cm.periodo = p.periodo
    left join cost co on co.categoria_id = p.categoria_id and co.periodo = p.periodo
    left join recl rc on rc.categoria_id = p.categoria_id and rc.periodo = p.periodo
    left join recl_sale rs on rs.categoria_id = p.categoria_id and rs.periodo = p.periodo
    left join gast g on g.categoria_id = p.categoria_id and g.periodo = p.periodo;

-- El árbol: cada cifra sube por la jerarquía (categoría → dominio → workspace → organización).
create or replace view agora.v_arbol_periodo with (security_invoker = true) as
  select c.org_id, n.id as nodo_id, n.tipo, n.nombre, c.periodo,
         sum(c.presupuesto_mxn)::numeric(14,2) presupuesto_mxn, sum(c.comprometido_mxn)::numeric(14,2) comprometido_mxn,
         sum(c.ejercido_mxn)::numeric(14,2) ejercido_mxn, sum(c.disponible_mxn)::numeric(14,2) disponible_mxn,
         sum(c.gasto_modelo_mxn)::numeric(14,2) gasto_modelo_mxn, sum(c.filas_sin_costo)::int filas_sin_costo,
         sum(c.pendiente_mxn)::numeric(14,2) pendiente_mxn
    from agora.v_centro_periodo c
    join agora.nodo cat on cat.id = c.categoria_id
    join agora.nodo n on n.id = any (cat.ancestros || cat.id)
   group by c.org_id, n.id, n.tipo, n.nombre, c.periodo;

-- --- Los topes por agente, leídos del libro y de las filas (no hay contador propio) -------------------------------
create or replace function agora_priv.uso_mensajes_hora(a uuid) returns int language sql stable security definer set search_path = '' as $$
  select ((select count(*) from agora.a2a_llamada l where l.agente_id = a and l.resultado = 'admitida' and l.cuando > now() - interval '60 minutes')
        + (select count(*) from agora.mensaje m where m.autor_agente = a and m.origen = 'sala' and m.creado_en > now() - interval '60 minutes'))::int
$$;

create or replace function agora_priv.uso_propuestas_dia(a uuid) returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from agora.propuesta p join agora.agente x on x.id = p.autor_agente
    join agora.org_config c on c.org_id = x.org_id
   where p.autor_agente = a and (p.creada_en at time zone c.zona)::date = (now() at time zone c.zona)::date
$$;

create or replace function agora_priv.uso_gasto_mes(a uuid) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(g.costo_mxn), 0) from agora.gasto_modelo g join agora.agente x on x.id = g.agente_id
   where g.agente_id = a and g.periodo = agora_priv.periodo_de_registro(x.org_id, now())
$$;

create or replace function agora_priv.gasto_org_mes(o uuid) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(g.costo_mxn), 0) from agora.gasto_modelo g where g.org_id = o and g.periodo = agora_priv.periodo_de_registro(o, now())
$$;

/** Segundos hasta que la ventana del tope vuelve a tener cupo (para el Retry-After de la Puerta). */
create or replace function agora_priv.reintenta_en(a uuid, tipo text) returns int language plpgsql stable security definer set search_path = '' as $$
declare
  zona text := coalesce((select c.zona from agora.agente x join agora.org_config c on c.org_id = x.org_id where x.id = a), 'America/Mexico_City');
  primero timestamptz;
begin
  if tipo = 'mensajes' then
    select min(t) into primero from (
      select l.cuando t from agora.a2a_llamada l where l.agente_id = a and l.resultado = 'admitida' and l.cuando > now() - interval '60 minutes'
      union all select m.creado_en from agora.mensaje m where m.autor_agente = a and m.origen = 'sala' and m.creado_en > now() - interval '60 minutes') x;
    return greatest(1, ceil(extract(epoch from (coalesce(primero, now()) + interval '60 minutes' - now())))::int);
  elsif tipo = 'propuestas' then
    return greatest(1, ceil(extract(epoch from ((date_trunc('day', now() at time zone zona) + interval '1 day') at time zone zona - now())))::int);
  else
    return greatest(1, ceil(extract(epoch from ((date_trunc('month', now() at time zone zona) + interval '1 month') at time zone zona - now())))::int);
  end if;
end $$;

/** La guardia de gasto ANTES de llamar a un modelo: sin cupo del agente o de la organización, no se llama (fail-closed). */
drop function if exists agora.puede_llamar_modelo(uuid);
create or replace function agora.puede_llamar_modelo(aid uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a agora.agente;
  c agora.org_config;
  usado numeric;
  org numeric;
begin
  -- Lo pregunta el agente que va a ejecutar la llamada: interno y con su idCard vivo (o una función de la base).
  if agora_priv.rol_que_llama() = 'agora_agente' and agora_priv.agente_de_tarea() is null then
    return jsonb_build_object('ok', false, 'motivo', 'quien pregunta no tiene idCard vivo');
  end if;
  select * into a from agora.agente x where x.id = aid;
  if not found or a.estado not in ('aprobado', 'prueba') then return jsonb_build_object('ok', false, 'motivo', 'el agente no tiene idCard vivo'); end if;
  if a.sin_modelo then return jsonb_build_object('ok', false, 'motivo', 'este agente no usa modelo: solo reglas'); end if;
  select * into c from agora.org_config where org_id = a.org_id;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'sin configuración de la organización'); end if;
  usado := agora_priv.uso_gasto_mes(a.id);
  org := agora_priv.gasto_org_mes(a.org_id);
  if usado >= a.tope_gasto_mes_mxn then
    return jsonb_build_object('ok', false, 'motivo', 'tope de gasto del agente', 'usado', usado, 'tope', a.tope_gasto_mes_mxn, 'org', org, 'tope_org', c.tope_gasto_org_mxn, 'reintenta_en', agora_priv.reintenta_en(a.id, 'gasto'));
  end if;
  if org >= c.tope_gasto_org_mxn then
    return jsonb_build_object('ok', false, 'motivo', 'tope de gasto de la organización', 'usado', usado, 'tope', a.tope_gasto_mes_mxn, 'org', org, 'tope_org', c.tope_gasto_org_mxn, 'reintenta_en', agora_priv.reintenta_en(a.id, 'gasto'));
  end if;
  return jsonb_build_object('ok', true, 'usado', usado, 'tope', a.tope_gasto_mes_mxn, 'org', org, 'tope_org', c.tope_gasto_org_mxn);
end $$;

/** La suma de los topes de gasto de los agentes no pasa el tope de la organización. */
create or replace function agora_priv.topes_dentro_de_la_org() returns trigger language plpgsql set search_path = '' as $$
declare suma numeric; tope numeric;
begin
  select coalesce(sum(a.tope_gasto_mes_mxn), 0) into suma from agora.agente a where a.org_id = new.org_id and a.estado <> 'revocado';
  select c.tope_gasto_org_mxn into tope from agora.org_config c where c.org_id = new.org_id;
  if tope is not null and suma > tope then
    raise exception 'la suma de los topes de gasto de los agentes (%) pasa el de la organización (%)', suma, tope using errcode = 'AG409';
  end if;
  return null;
end $$;
drop trigger if exists tg_topes_dentro_de_la_org on agora.agente;
create constraint trigger tg_topes_dentro_de_la_org after insert or update of tope_gasto_mes_mxn, estado on agora.agente
  deferrable initially deferred for each row execute function agora_priv.topes_dentro_de_la_org();
