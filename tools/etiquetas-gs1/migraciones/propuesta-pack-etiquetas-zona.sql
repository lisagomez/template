-- ═══════════════════════════════════════════════════════════════════
-- ERP · PROPUESTA — PACK ETIQUETAS GS1 · ESCANEAR POR ZONA (rondas, tareas, dispositivos)
-- ═══════════════════════════════════════════════════════════════════
-- ESTADO: PROPUESTA. No se aplica a ninguna base: integrarla al ERP es gate humano.
-- Va DESPUÉS de propuesta-pack-etiquetas.sql (usa eti_sitio, eti_evento, eti_foto y
-- eti_solo_agregar; los tipos TAREA_CERRADA y HALLAZGO ya están en la lista única de tipos de
-- eti_evento de ese archivo). Validada en el Postgres efímero con `prueba-efimera.sh`, casos (q)…(u).
-- Mismo contrato: cliente_id en toda tabla (RLS por tenant de 004), lo que es traza solo-agregar.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- Escanear por zona: rondas del día, tareas, dispositivos por rol y conteo cíclico
-- ============================================================
-- La RONDA se genera una vez por sitio y día del estado (determinista) y se CONGELA: sus tareas no
-- se editan. Una tarea se cierra con un evento TAREA_CERRADA en la cadena (el escaneo que la prueba,
-- con su seudónimo), nunca con un UPDATE. Lo que ya no aplica (el lote se vendió) se calcula; no se escribe.
create table if not exists erp.eti_ronda (
  cliente_id     uuid not null,
  eti_sitio_id   uuid not null references erp.eti_sitio(id),
  id             text not null check (id ~ '^RONDA-[A-Z0-9-]{1,40}-\d{8}$'),
  fecha          date not null,
  generada       timestamptz not null,
  cabeza_seq     bigint not null check (cabeza_seq >= 0),
  cabeza_hash    text not null check (cabeza_hash = '' or cabeza_hash ~ '^sha256:[0-9a-f]{64}$'),
  primary key (cliente_id, id),
  unique (cliente_id, eti_sitio_id, fecha)
);
comment on table erp.eti_ronda is 'Ronda del día por sitio, congelada al generarse (con la cabeza de la cadena de ese momento). Solo-agregar.';

create table if not exists erp.eti_tarea (
  cliente_id     uuid not null,
  ronda_id       text not null,
  id             text not null check (id ~ '^TAREA-[0-9a-f]{10}$'),
  tipo           text not null check (tipo in ('retirar', 'resurtir', 'promover', 'confirmar', 'ubicar', 'contar')),
  zona           text not null check (zona in ('recibo', 'almacen', 'piso', 'merma')),
  ubicacion      text not null check (ubicacion ~ '^(RECIBO|ALMACEN|PISO|MERMA)(-[A-Z]{1,2}-\d{2}-\d{1,2})?$'),
  sku            text,
  gtin           char(14) check (gtin is null or erp.gs1_digito_ok(gtin)),
  lote           text check (lote is null or (length(lote) <= 20 and erp.gs1_cset82(lote))),
  caducidad      date,
  revision       text check (revision is null or revision ~ '^sha256:[0-9a-f]{64}$'),
  razones        jsonb not null default '[]'::jsonb check (jsonb_typeof(razones) = 'array'),
  instruccion    text not null check (length(instruccion) between 3 and 400),
  hasta          time not null,
  orden          int not null check (orden >= 1),
  primary key (cliente_id, ronda_id, id),
  foreign key (cliente_id, ronda_id) references erp.eti_ronda (cliente_id, id),
  -- Las que se prueban con un lote lo llevan entero; confirmar lleva su revisión; contar, su ubicación.
  check ((tipo in ('retirar', 'resurtir', 'promover', 'ubicar')) = (gtin is not null and lote is not null and caducidad is not null)),
  check ((tipo = 'confirmar') = (revision is not null)),
  -- Las instrucciones las lee el almacenista, que cuenta a ciegas: ninguna cantidad de cajas.
  check (instruccion !~* '\m\d+\s*cajas?\M')
);
comment on table erp.eti_tarea is 'Tareas de la ronda en orden de recorrido. Sin cantidades (las lee el almacenista). Solo-agregar: se cierran con TAREA_CERRADA.';
create or replace trigger eti_ronda_solo_agregar before update or delete on erp.eti_ronda for each row execute function erp.eti_solo_agregar();
create or replace trigger eti_tarea_solo_agregar before update or delete on erp.eti_tarea for each row execute function erp.eti_solo_agregar();

-- Dispositivos: el ROL lo decide el código con que se empareja; la base guarda su HUELLA, nunca el código.
create table if not exists erp.eti_dispositivo (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null,
  rol           text not null check (rol in ('operacion', 'recibo', 'almacenista', 'conteo')),
  codigo_hash   text not null check (codigo_hash ~ '^sha256:[0-9a-f]{64}$'),
  nombre        text not null check (length(nombre) between 2 and 60),
  alta          timestamptz not null default now(),
  baja          timestamptz,
  unique (cliente_id, codigo_hash),
  check (baja is null or baja >= alta)
);
comment on table erp.eti_dispositivo is 'Códigos de dispositivo por rol (operacion = supervisor). Solo la huella SHA-256 del código; rotar = alta nueva + baja de la anterior.';

-- TAREA_CERRADA cita una tarea de la ronda de ESE sitio, con SU lote, y la cierra una vez (salvo que la
-- acción que la cerró se haya deshecho con una CORRECCION). HALLAZGO cita una foto que existe.
create or replace function erp.eti_evento_zona() returns trigger language plpgsql as $$
declare t record; foto text;
begin
  if new.tipo = 'TAREA_CERRADA' then
    select k.* into t from erp.eti_tarea k join erp.eti_ronda r on r.cliente_id = k.cliente_id and r.id = k.ronda_id
      where k.cliente_id = new.cliente_id and r.eti_sitio_id = new.eti_sitio_id and k.ronda_id = new.datos->>'ronda' and k.id = new.datos->>'tarea';
    if not found then raise exception 'la tarea % no está en la ronda % de %', new.datos->>'tarea', new.datos->>'ronda', new.sitio using errcode = 'check_violation'; end if;
    if t.gtin is not null and (t.gtin <> new.gtin or t.lote <> new.lote or t.caducidad is distinct from new.caducidad) then
      raise exception 'el escaneo (% %) no es el lote de la tarea %', new.gtin, new.lote, t.id using errcode = 'check_violation';
    end if;
    if new.datos ? 'accion' and not exists (select 1 from erp.eti_evento e where e.cliente_id = new.cliente_id and e.eti_sitio_id = new.eti_sitio_id and e.hash = new.datos->>'accion') then
      raise exception 'la acción que cierra la tarea no está en la cadena de %', new.sitio using errcode = 'check_violation';
    end if;
    if exists (select 1 from erp.eti_evento c where c.cliente_id = new.cliente_id and c.eti_sitio_id = new.eti_sitio_id and c.tipo = 'TAREA_CERRADA'
               and c.datos->>'ronda' = new.datos->>'ronda' and c.datos->>'tarea' = new.datos->>'tarea'
               and not exists (select 1 from erp.eti_evento d where d.cliente_id = c.cliente_id and d.eti_sitio_id = c.eti_sitio_id and d.tipo = 'CORRECCION'
                               and d.datos->>'deshace' = 'true' and d.datos->>'corrige' = c.datos->>'accion')) then
      raise exception 'la tarea % ya se cerró', t.id using errcode = 'check_violation';
    end if;
  elsif new.tipo = 'HALLAZGO' then
    foto := new.datos->'fotos'->>'completa';
    if foto is null or not exists (select 1 from erp.eti_foto f where f.cliente_id = new.cliente_id and f.huella = foto) then
      raise exception 'HALLAZGO sin su foto en eti_foto (%)', coalesce(foto, 'falta') using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create or replace trigger eti_evento_zona before insert on erp.eti_evento for each row execute function erp.eti_evento_zona();

-- Avance de la ronda por zona (lo ve el supervisor): tareas y las cerradas por escaneo.
create or replace view erp.eti_ronda_avance with (security_invoker = true) as
  select r.cliente_id, r.id as ronda, r.fecha, k.zona, count(*) as total,
    count(*) filter (where exists (select 1 from erp.eti_evento e where e.cliente_id = r.cliente_id and e.eti_sitio_id = r.eti_sitio_id
                                   and e.tipo = 'TAREA_CERRADA' and e.datos->>'ronda' = r.id and e.datos->>'tarea' = k.id)) as cerradas
  from erp.eti_ronda r join erp.eti_tarea k on k.cliente_id = r.cliente_id and k.ronda_id = r.id
  group by r.cliente_id, r.id, r.fecha, k.zona;

-- Conteo cíclico por riesgo: por ubicación, cuándo se contó por última vez y en cuántos conteos hubo
-- diferencia (dos de las entradas de la regla; la caducidad y el volumen salen de eti_existencia).
create or replace view erp.eti_ubicacion_conteo with (security_invoker = true) as
  select e.cliente_id, e.sitio,
    upper(x.r->>'zona') || case when x.r->>'zona' = 'almacen' and coalesce(x.r->>'posicion', '') <> '' then '-' || (x.r->>'posicion') else '' end as ubicacion,
    max(e.fecha) as ultimo_conteo,
    count(distinct e.datos->>'folio') filter (where coalesce((x.r->>'diferencia')::int, 0) <> 0) as conteos_con_diferencia
  from erp.eti_evento e cross join lateral jsonb_array_elements(coalesce(e.datos->'renglones', '[]'::jsonb)) as x(r)
  where e.tipo = 'CONTEO'
  group by e.cliente_id, e.sitio, 3;

-- ============================================================
-- Códigos ANTERIORES: la etiqueta vieja se sigue leyendo (decisión del laboratorio, 2026-09-28)
-- ============================================================
-- eti_asignacion (solo-agregar) ya guarda el `anterior` de cada sustitución: la vista dice de qué
-- artículo fue cada código que hoy no es vigente de nadie. No es una tabla más: no se desincroniza.
create or replace view erp.eti_codigo_anterior with (security_invoker = true) as
  select distinct on (a.cliente_id, a.anterior) a.cliente_id, a.anterior as gtin, a.eti_articulo_id, a.nivel, a.created_at as hasta, a.gtin as sustituido_por
  from erp.eti_asignacion a
  where a.anterior is not null and a.anterior <> a.gtin
    and not exists (select 1 from erp.eti_articulo o where o.cliente_id = a.cliente_id and a.anterior in (o.gtin_unidad, o.gtin_caja))
  order by a.cliente_id, a.anterior, a.created_at desc;

-- Un código anterior de un artículo no se le da a OTRO: sus etiquetas viejas se siguen leyendo como
-- el primero (y GS1 pide no reusar un GTIN retirado). Devolvérselo al mismo artículo sí se puede.
create or replace function erp.eti_gtin_no_anterior_de_otro() returns trigger language plpgsql as $$
declare x record;
begin
  select c.eti_articulo_id, c.hasta into x from erp.eti_codigo_anterior c
   where c.cliente_id = new.cliente_id and c.eti_articulo_id <> new.id and c.gtin in (new.gtin_unidad, new.gtin_caja) limit 1;
  if found then
    raise exception 'ese GTIN fue código de otro artículo hasta % y sus etiquetas viejas se leen como él', x.hasta using errcode = 'unique_violation';
  end if;
  return new;
end $$;
create or replace trigger eti_gtin_no_anterior_de_otro before insert or update of gtin_unidad, gtin_caja on erp.eti_articulo
  for each row execute function erp.eti_gtin_no_anterior_de_otro();

-- ============================================================
-- Append-only (como 005 hace con los suyos)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rol_exe_fin') then
    -- Rondas y tareas: congeladas al generarse. Un dispositivo se da de baja, no se borra.
    revoke update, delete on erp.eti_ronda, erp.eti_tarea from rol_exe_fin;
    revoke delete on erp.eti_dispositivo from rol_exe_fin;
  end if;
end $$;
-- HALLAZGO para quien integre: como con el pack, 004 debe listar eti_ronda y eti_tarea entre los
-- ledgers a los que no re-concede UPDATE (los triggers de solo-agregar aguantan aunque lo reabra).
