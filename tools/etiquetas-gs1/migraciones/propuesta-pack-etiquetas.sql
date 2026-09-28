-- ═══════════════════════════════════════════════════════════════════
-- ERP · PROPUESTA — PACK ETIQUETAS GS1 (control de caducidades)
-- ═══════════════════════════════════════════════════════════════════
-- ESTADO: PROPUESTA. No se aplica a ninguna base: integrarla al ERP es gate humano.
-- Validada en un Postgres 17 efímero con `bash migraciones/prueba-efimera.sh`, encima de
-- erp/migrations/001..005 de main. El número de migración lo asigna quien la integre.
--
-- Lo que el nucleo de tools/etiquetas-gs1 guarda en su almacen inyectado, en tablas del esquema
-- `erp`, con el mismo contrato que el resto del ERP:
--   · cliente_id NOT NULL en toda tabla (la RLS por tenant la pone 004 al re-correrse);
--   · el pack referencia al núcleo/retail (inv_articulo), nunca al revés;
--   · ledgers append-only: eti_asignacion (quién asignó qué y cuándo) y eti_emitido
--     (todo GTIN/SSCC emitido: NUNCA se reusa). Sus revokes van aquí y 004 debe listarlos
--     (ver HALLAZGO al final).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- Digito verificador GS1 (GenSpecs §7.9.1), para que la base tampoco acepte uno malo.
create or replace function erp.gs1_digito_ok(clave text) returns boolean
language sql immutable strict as $$
  select clave ~ '^[0-9]{2,18}$' and (
    (10 - (
      select sum(substr(clave, length(clave) - 1 - i, 1)::int * case when i % 2 = 0 then 3 else 1 end)
      from generate_series(0, length(clave) - 2) as i
    ) % 10) % 10
  ) = right(clave, 1)::int
$$;

-- CSET 82 (GenSpecs Tabla 7-20): lo único que admite un lote GS1.
create or replace function erp.gs1_cset82(valor text) returns boolean
language sql immutable strict as $$ select valor ~ '^[!"%&''()*+,./0-9:;<=>?A-Z_a-z-]+$' $$;

-- ============================================================
-- Configuración de la instalación, por tenant
-- ============================================================
create table if not exists erp.eti_config (
  cliente_id          uuid primary key,
  prefijo_empresa     text not null default '' check (prefijo_empresa = '' or prefijo_empresa ~ '^[0-9]{6,12}$'),
  prefijo_interno     text not null default '04' check (prefijo_interno ~ '^(04|02|2[0-9])$'),
  extension_sscc      smallint not null default 0 check (extension_sscc between 0 and 9),
  contador_propio     bigint not null default 1 check (contador_propio >= 1),
  contador_interno    bigint not null default 1 check (contador_interno >= 1),
  contador_sscc       bigint not null default 1 check (contador_sscc >= 1),
  labelary_permitido  boolean not null default false,   -- C4: apagado salvo decisión expresa
  created_at          timestamptz not null default now()
);
comment on table erp.eti_config is 'Parámetros GS1 del tenant. prefijo_empresa: el GCP que asignó GS1 México (nunca uno ajeno).';

create table if not exists erp.eti_sitio (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null,
  clave       text not null check (clave ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),
  nombre      text not null,
  tipo        text not null check (tipo in ('cedis', 'sucursal')),
  agente_url  text,
  gln         char(13) check (gln is null or erp.gs1_digito_ok(gln)),   -- (414) de sus etiquetas de ubicacion
  unique (cliente_id, clave),
  unique (cliente_id, gln)
);

create table if not exists erp.eti_categoria (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null,
  clave                  text not null,
  nombre                 text not null,
  alerta_dias            int not null check (alerta_dias >= 0),
  retiro_dias            int not null check (retiro_dias >= 0),
  minimo_recepcion_dias  int not null default 0 check (minimo_recepcion_dias >= 0),
  de_ejemplo             boolean not null default true,
  unique (cliente_id, clave),
  check (retiro_dias <= alerta_dias)
);

-- ============================================================
-- GS1 del artículo: extiende erp.inv_articulo sin tocarla
-- ============================================================
create table if not exists erp.eti_articulo (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null,
  inv_articulo_id    uuid not null references erp.inv_articulo(id) on delete restrict,
  categoria          text not null default 'general',
  marca_propia       boolean not null default false,
  gtin_unidad        char(14) check (gtin_unidad is null or erp.gs1_digito_ok(gtin_unidad)),
  regla_unidad       text check (regla_unidad in ('fabricante','propio','propio-existente','interno','interno-existente')),
  gtin_caja          char(14) check (gtin_caja is null or erp.gs1_digito_ok(gtin_caja)),
  regla_caja         text check (regla_caja in ('fabricante','propio-existente','derivado-caja','igual-unidad','interno','interno-existente')),
  unidades_por_caja  int not null default 1 check (unidades_por_caja >= 1),
  cajas_por_tarima   int check (cajas_por_tarima is null or cajas_por_tarima >= 1),
  vida_util_dias     int check (vida_util_dias is null or vida_util_dias >= 0),
  unique (cliente_id, inv_articulo_id),
  check (gtin_caja is distinct from gtin_unidad or unidades_por_caja = 1)
);
create index if not exists eti_articulo_gtin_unidad_idx on erp.eti_articulo (cliente_id, gtin_unidad);
create index if not exists eti_articulo_gtin_caja_idx on erp.eti_articulo (cliente_id, gtin_caja);

-- Un GTIN pertenece a UN artículo del tenant, en cualquiera de sus dos niveles.
create or replace function erp.eti_gtin_unico() returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from erp.eti_articulo o
    where o.cliente_id = new.cliente_id and o.id <> new.id
      and (o.gtin_unidad in (new.gtin_unidad, new.gtin_caja) or o.gtin_caja in (new.gtin_unidad, new.gtin_caja))
  ) then
    raise exception 'GTIN duplicado: ya pertenece a otro artículo del tenant' using errcode = 'unique_violation';
  end if;
  return new;
end $$;
drop trigger if exists eti_gtin_unico on erp.eti_articulo;
create trigger eti_gtin_unico before insert or update on erp.eti_articulo for each row execute function erp.eti_gtin_unico();

create table if not exists erp.eti_articulo_sitio (
  cliente_id       uuid not null,
  eti_articulo_id  uuid not null references erp.eti_articulo(id) on delete cascade,
  eti_sitio_id     uuid not null references erp.eti_sitio(id) on delete cascade,
  primary key (eti_articulo_id, eti_sitio_id)
);

-- ============================================================
-- Ledgers append-only: traza y "nunca se reusa"
-- ============================================================
create table if not exists erp.eti_importacion (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null,
  archivo     text not null,
  huella      text not null,
  operador    text not null,
  resumen     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists erp.eti_emitido (
  cliente_id  uuid not null,
  clave       text not null check (erp.gs1_digito_ok(clave) and length(clave) in (14, 18)),
  tipo        text not null check (tipo in ('gtin', 'sscc')),
  created_at  timestamptz not null default now(),
  primary key (cliente_id, clave)
);
comment on table erp.eti_emitido is 'Todo GTIN o SSCC que la casa emitió o registró como suyo. Append-only: un número no se reusa nunca.';

create table if not exists erp.eti_asignacion (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null,
  eti_articulo_id     uuid not null references erp.eti_articulo(id),
  nivel               text not null check (nivel in ('unidad', 'caja')),
  gtin                char(14) not null check (erp.gs1_digito_ok(gtin)),
  regla               text not null,
  anterior            char(14),
  operador            text not null,
  eti_importacion_id  uuid references erp.eti_importacion(id),
  created_at          timestamptz not null default now()
);
comment on table erp.eti_asignacion is 'Bitácora append-only: quién asignó qué GTIN, con qué regla y cuándo.';

-- ============================================================
-- Impresoras y existencias por lote
-- ============================================================
create table if not exists erp.eti_impresora (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null,
  eti_sitio_id    uuid not null references erp.eti_sitio(id) on delete cascade,
  clave           text not null,
  nombre          text not null,
  dpi             int not null check (dpi in (203, 300, 600)),
  ancho_mm        numeric(6,1) not null check (ancho_mm between 20 and 170),
  alto_mm         numeric(6,1) not null check (alto_mm between 10 and 400),
  lh_x            int not null default 0 check (lh_x between 0 and 32000),
  lh_y            int not null default 0 check (lh_y between 0 and 32000),
  ls              int not null default 0 check (ls between -9999 and 9999),
  lt              int not null default 0 check (lt between -120 and 120),
  oscuridad       int not null default 0 check (oscuridad between -30 and 30),
  velocidad       int not null default 4 check (velocidad between 2 and 14),
  perfil_lectura  text not null default 'pistola' check (perfil_lectura in ('pistola', 'automatico')),
  unique (cliente_id, clave)
);

create table if not exists erp.eti_existencia (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null,
  eti_sitio_id     uuid not null references erp.eti_sitio(id),
  eti_articulo_id  uuid not null references erp.eti_articulo(id),
  gtin             char(14) not null check (erp.gs1_digito_ok(gtin)),
  lote             text not null check (length(lote) <= 20 and erp.gs1_cset82(lote)),
  caducidad        date not null,
  cantidad         numeric(14,4) not null check (cantidad >= 0),
  sscc             char(18) check (sscc is null or erp.gs1_digito_ok(sscc)),
  origen           text not null check (origen in ('etiquetado', 'recepcion', 'semilla', 'conteo')),
  zona             text not null default 'recibo' check (zona in ('recibo', 'almacen', 'piso', 'merma')),
  updated_at       timestamptz not null default now()
);
-- Sin SSCC, un lote en una zona de un sitio es UN renglón (el alta suma); con SSCC, la tarima no se repite.
create unique index if not exists eti_existencia_lote_zona_uidx on erp.eti_existencia (cliente_id, eti_sitio_id, zona, gtin, lote, caducidad) where sscc is null;
create unique index if not exists eti_existencia_sscc_uidx on erp.eti_existencia (cliente_id, eti_sitio_id, sscc) where sscc is not null;
create index if not exists eti_existencia_fefo_idx on erp.eti_existencia (cliente_id, eti_sitio_id, caducidad);

-- Movimientos entre zonas (recibo → almacén → piso → merma): bitácora append-only.
create table if not exists erp.eti_movimiento (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null,
  eti_sitio_id     uuid not null references erp.eti_sitio(id),
  eti_articulo_id  uuid not null references erp.eti_articulo(id),
  gtin             char(14) not null check (erp.gs1_digito_ok(gtin)),
  lote             text not null check (erp.gs1_cset82(lote)),
  caducidad        date not null,
  cajas            numeric(14,4) not null check (cajas > 0),
  de_zonas         text[] not null,
  a_zona           text not null check (a_zona in ('recibo', 'almacen', 'piso', 'merma')),
  sscc             char(18),
  operador         text not null,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- Expediente de lote: cadena de eventos por sitio y raíces ancladas
-- ============================================================
-- Cada evento se encadena al anterior del sitio (seq y hash). El hash es SHA-256 sobre el
-- registro COMPLETO canonicalizado con RFC 8785 (JCS); la base no puede recalcularlo (jsonb no
-- ordena las claves como JCS), así que lo re-verifica el verificador del núcleo. La base SÍ exige
-- el encadenado al insertar y que nada se reescriba. El operador es un SEUDÓNIMO: la cadena es
-- inmutable y no puede guardar lo que alguien tenga derecho a cancelar.

-- Génesis de la cadena de un sitio: SHA-256 de JCS({"genesis": <clave>, "v": 1}).
create or replace function erp.eti_genesis(sitio text) returns text language sql immutable as $$
  select 'sha256:' || encode(sha256(convert_to('{"genesis":' || to_json(sitio)::text || ',"v":1}', 'UTF8')), 'hex')
$$;

create table if not exists erp.eti_evento (
  cliente_id     uuid not null,
  eti_sitio_id   uuid not null references erp.eti_sitio(id),
  sitio          text not null,
  seq            bigint not null check (seq >= 1),
  v              smallint not null default 1 check (v = 1),
  fecha          text not null check (fecha ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'),
  tipo           text not null check (tipo in ('RECIBIDO','RECHAZADO','UBICADO','MOVIDO','TRANSFERIDO','VENDIDO','DEVUELTO','DONADO','MERMA',
                                               'RECOMENDACION','RECOMENDACION_EJECUTADA','RECOMENDACION_DESCARTADA','CORRECCION','CONTEO')),
  gtin           char(14) not null check (erp.gs1_digito_ok(gtin)),
  lote           text not null check (length(lote) <= 20 and erp.gs1_cset82(lote)),
  caducidad      date not null,
  datos          jsonb not null,
  operador       text not null check (operador ~ '^(op-[0-9a-f]{8}|op-apertura|agente-riesgo)$'),
  anterior       text not null check (anterior ~ '^sha256:[0-9a-f]{64}$'),
  anterior_lote  text check (anterior_lote is null or anterior_lote ~ '^sha256:[0-9a-f]{64}$'),
  hash           text not null unique check (hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  primary key (cliente_id, eti_sitio_id, seq)
);
comment on table erp.eti_evento is 'Cadena solo-agregar por sitio: cada evento enlaza con el anterior (seq + hash). El estado de existencias es su proyección.';
create index if not exists eti_evento_lote_idx on erp.eti_evento (cliente_id, gtin, lote, caducidad);
-- Inventario físico (CONTEO), revisión de la caducidad leída de una foto (EN_REVISION) y
-- existencias que nacen de un conteo: una instalación anterior del pack trae los checks sin
-- ellos, así que se reemplazan (idempotente).
alter table erp.eti_evento drop constraint if exists eti_evento_tipo_check;
alter table erp.eti_evento add constraint eti_evento_tipo_check check (tipo in ('RECIBIDO','RECHAZADO','UBICADO','MOVIDO','TRANSFERIDO','VENDIDO','DEVUELTO','DONADO','MERMA',
  'RECOMENDACION','RECOMENDACION_EJECUTADA','RECOMENDACION_DESCARTADA','CORRECCION','CONTEO','EN_REVISION','TAREA_CERRADA','HALLAZGO'));
alter table erp.eti_existencia drop constraint if exists eti_existencia_origen_check;
alter table erp.eti_existencia add constraint eti_existencia_origen_check check (origen in ('etiquetado', 'recepcion', 'semilla', 'conteo'));

create or replace function erp.eti_evento_encadena() returns trigger language plpgsql as $$
declare ult record; clave text;
begin
  select s.clave into clave from erp.eti_sitio s where s.id = new.eti_sitio_id and s.cliente_id = new.cliente_id;
  if clave is distinct from new.sitio then raise exception 'el evento dice ser de % y el sitio es %', new.sitio, clave using errcode = 'check_violation'; end if;
  perform pg_advisory_xact_lock(hashtext('eti_evento|' || new.cliente_id::text || '|' || new.eti_sitio_id::text));
  select e.seq, e.hash into ult from erp.eti_evento e where e.cliente_id = new.cliente_id and e.eti_sitio_id = new.eti_sitio_id order by e.seq desc limit 1;
  if not found then
    if new.seq <> 1 or new.anterior <> erp.eti_genesis(new.sitio) then
      raise exception 'el primer evento de % va con secuencia 1 y apunta al génesis del sitio', new.sitio using errcode = 'check_violation';
    end if;
  elsif new.seq <> ult.seq + 1 or new.anterior <> ult.hash then
    raise exception 'el evento #% no continúa la cadena de % (la cabeza es #%)', new.seq, new.sitio, ult.seq using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger eti_evento_encadena before insert on erp.eti_evento for each row execute function erp.eti_evento_encadena();

-- Anclas: la raíz de Merkle (RFC 6962) de los eventos del periodo, firmada con Ed25519 por la
-- llave del sitio. La firma la verifica el central (Postgres no trae Ed25519); la base exige la
-- continuidad: cada ancla empieza donde acabó la anterior y apunta a su hash.
create table if not exists erp.eti_ancla (
  cliente_id      uuid not null,
  eti_sitio_id    uuid not null references erp.eti_sitio(id),
  sitio           text not null,
  periodo         text not null,
  desde_seq       bigint not null check (desde_seq >= 1),
  hasta_seq       bigint not null,
  n               int not null,
  raiz            text not null check (raiz ~ '^sha256:[0-9a-f]{64}$'),
  cabeza          text not null check (cabeza ~ '^sha256:[0-9a-f]{64}$'),
  ancla_anterior  text not null check (ancla_anterior ~ '^sha256:[0-9a-f]{64}$'),
  creada          text not null,
  firma           text not null,
  llave           text not null check (llave ~ '^ed25519:[0-9a-f]{16}$'),
  primary key (cliente_id, eti_sitio_id, desde_seq),
  check (hasta_seq >= desde_seq and n = hasta_seq - desde_seq + 1)
);
comment on table erp.eti_ancla is 'Raíces diarias firmadas. Las escribe SOLO el job del central (declarado, C7); la sucursal no.';

-- Hash del ancla: SHA-256 de su JCS (claves en orden UTF-16; aquí todas son ASCII fijas).
create or replace function erp.eti_hash_ancla(a erp.eti_ancla) returns text language sql immutable as $$
  select 'sha256:' || encode(sha256(convert_to(format(
    '{"anclaAnterior":%s,"cabeza":%s,"creada":%s,"desdeSeq":%s,"hastaSeq":%s,"n":%s,"periodo":%s,"raiz":%s,"sitio":%s,"v":1}',
    to_json(a.ancla_anterior), to_json(a.cabeza), to_json(a.creada), a.desde_seq, a.hasta_seq, a.n, to_json(a.periodo), to_json(a.raiz), to_json(a.sitio)), 'UTF8')), 'hex')
$$;

create or replace function erp.eti_ancla_continua() returns trigger language plpgsql as $$
declare prev erp.eti_ancla;
begin
  perform pg_advisory_xact_lock(hashtext('eti_ancla|' || new.cliente_id::text || '|' || new.eti_sitio_id::text));
  select * into prev from erp.eti_ancla a where a.cliente_id = new.cliente_id and a.eti_sitio_id = new.eti_sitio_id order by a.hasta_seq desc limit 1;
  if not found then
    if new.desde_seq <> 1 or new.ancla_anterior <> erp.eti_genesis(new.sitio) then raise exception 'la primera ancla de % empieza en #1 y apunta al génesis', new.sitio using errcode = 'check_violation'; end if;
  elsif new.desde_seq <> prev.hasta_seq + 1 or new.ancla_anterior <> erp.eti_hash_ancla(prev) then
    raise exception 'el ancla de % no continúa la anterior (#% y su hash)', new.sitio, prev.hasta_seq using errcode = 'check_violation';
  end if;
  if not exists (select 1 from erp.eti_evento e where e.cliente_id = new.cliente_id and e.eti_sitio_id = new.eti_sitio_id and e.seq = new.hasta_seq and e.hash = new.cabeza) then
    raise exception 'la cabeza del ancla no es el evento #% de la cadena de %', new.hasta_seq, new.sitio using errcode = 'check_violation';
  end if;
  return new;
end $$;
create or replace trigger eti_ancla_continua before insert on erp.eti_ancla for each row execute function erp.eti_ancla_continua();

-- Testigos de cabeza: el sitio avisa su cabeza al crecer la cadena; no puede retroceder.
create table if not exists erp.eti_testigo (
  cliente_id    uuid not null,
  eti_sitio_id  uuid not null references erp.eti_sitio(id),
  seq           bigint not null,
  cabeza        text not null check (cabeza ~ '^sha256:[0-9a-f]{64}$'),
  fecha         timestamptz not null default now(),
  primary key (cliente_id, eti_sitio_id, seq)
);

-- Solo-agregar para TODOS (también el dueño, salvo que desactive triggers: por eso existe el ancla).
create or replace function erp.eti_solo_agregar() returns trigger language plpgsql as $$
begin
  raise exception '% es solo-agregar: un error se corrige con un evento CORRECCION', tg_table_name using errcode = 'insufficient_privilege';
end $$;
create or replace trigger eti_evento_solo_agregar before update or delete on erp.eti_evento for each row execute function erp.eti_solo_agregar();
create or replace trigger eti_ancla_solo_agregar before update or delete on erp.eti_ancla for each row execute function erp.eti_solo_agregar();
create or replace trigger eti_testigo_solo_agregar before update or delete on erp.eti_testigo for each row execute function erp.eti_solo_agregar();

-- ============================================================
-- Fotos del artículo y caducidad leída de una foto (recepción con foto)
-- ============================================================
-- Una foto se guarda por su HUELLA SHA-256, ya normalizada (sin EXIF ni GPS). Los BYTES no van a
-- la base: viven en un almacenamiento de objetos privado del tenant (clave = huella), o en la
-- carpeta del sitio. Aquí van su huella, tipo, tamaño y dónde está: la cadena cita la huella.
create table if not exists erp.eti_foto (
  cliente_id  uuid not null,
  huella      text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  tipo        text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  bytes       int not null check (bytes > 0 and bytes <= 15728640),
  ancho       int check (ancho is null or ancho > 0),
  alto        int check (alto is null or alto > 0),
  ubicacion   text not null check (length(ubicacion) between 1 and 300),
  created_at  timestamptz not null default now(),
  primary key (cliente_id, huella)
);
comment on table erp.eti_foto is 'Metadatos de una foto normalizada (sin EXIF ni GPS). Los bytes viven fuera de la base, por huella.';

-- Las fotos de cada vista del artículo. Solo-agregar: la vigente es la última; cambiarla o
-- quitarla (retirada) no borra la anterior.
create table if not exists erp.eti_articulo_foto (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null,
  eti_articulo_id  uuid not null references erp.eti_articulo(id),
  vista            text not null check (vista in ('principal', 'frente', 'etiqueta', 'caja', 'caducidad')),
  huella           text,
  miniatura        text,
  nota             text check (nota is null or length(nota) <= 200),
  retirada         boolean not null default false,
  operador         text not null check (operador ~ '^op-[0-9a-f]{8}$'),
  created_at       timestamptz not null default now(),
  check (retirada or huella is not null),
  foreign key (cliente_id, huella) references erp.eti_foto (cliente_id, huella),
  foreign key (cliente_id, miniatura) references erp.eti_foto (cliente_id, huella)
);
create index if not exists eti_articulo_foto_idx on erp.eti_articulo_foto (cliente_id, eti_articulo_id, vista, created_at desc);

-- Cómo imprime la fecha cada artículo, aprendido de una confirmación (solo-agregar; vale la última).
create table if not exists erp.eti_formato_fecha (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null,
  eti_articulo_id  uuid not null references erp.eti_articulo(id),
  formato          text not null check (formato in ('DD/MM/AA','DD/MM/AAAA','MM/DD/AA','MM/DD/AAAA','AAAA/MM/DD','DDMMAA','AAMMDD','DDMMAAAA','AAAAMMDD','DD MES AA','DD MES AAAA','MES AA','MES AAAA','MM/AA','MM/AAAA','JULIANO AADDD')),
  tipo             text not null check (tipo in ('caducidad', 'consumo-preferente')),
  operador         text not null check (operador ~ '^op-[0-9a-f]{8}$'),
  evento           text check (evento is null or evento ~ '^sha256:[0-9a-f]{64}$'),
  created_at       timestamptz not null default now()
);

-- EN_REVISION: llegó mercancía cuya caducidad se leyó de una foto y aún no se confirma. Su clave
-- es el FOLIO y no tiene caducidad (null, que el núcleo escribe como ''): no es inventario. La
-- resuelve un RECIBIDO (o un RECHAZADO) con `datos.revision` = su hash.
-- (El tipo EN_REVISION ya va en eti_evento_tipo_check, arriba: una sola lista, o reinstalar el pack
-- la dejaria sin el y rechazaria las revisiones ya guardadas.)
alter table erp.eti_evento alter column caducidad drop not null;
alter table erp.eti_evento drop constraint if exists eti_evento_caducidad_check;
-- Un HALLAZGO (pieza de piso que no cuadra con ningún lote) va sin caducidad si la foto no la dejó leer.
alter table erp.eti_evento add constraint eti_evento_caducidad_check check ((caducidad is null) = (tipo = 'EN_REVISION' or (tipo = 'RECHAZADO' and datos ? 'descartada')
  or (tipo = 'HALLAZGO' and coalesce(datos->'leido'->>'fecha', '') = '')));
-- La foto del inventario de una recepción (`datos.existencia`, 2026-09-28): solo en un RECIBIDO, y lo
-- de después es lo de antes más lo recibido, en el lote y en el artículo. (Que cuadre con la cadena
-- entera lo comprueba la proyección del núcleo.)
create or replace function erp.eti_foto_inventario_ok(tipo text, datos jsonb) returns boolean language sql immutable as $$
  select not (datos ? 'existencia') or (tipo = 'RECIBIDO' and jsonb_typeof(datos->'cajas') = 'number'
    and jsonb_typeof(datos->'existencia'->'antes'->'lote') = 'number' and jsonb_typeof(datos->'existencia'->'antes'->'articulo') = 'number'
    and (datos->'existencia'->'despues'->>'lote')::numeric = (datos->'existencia'->'antes'->>'lote')::numeric + (datos->>'cajas')::numeric
    and (datos->'existencia'->'despues'->>'articulo')::numeric = (datos->'existencia'->'antes'->>'articulo')::numeric + (datos->>'cajas')::numeric)
$$;
alter table erp.eti_evento drop constraint if exists eti_evento_foto_inventario_check;
alter table erp.eti_evento add constraint eti_evento_foto_inventario_check check (coalesce(erp.eti_foto_inventario_ok(tipo, datos), false));

-- La base también exige lo que exige el núcleo: la revisión cita una foto que existe, se resuelve
-- una sola vez, y la CONFIRMA quien la registró (la pantalla no es la frontera; la base tampoco
-- debería ser la única, pero no deja pasar lo que el servidor rechazaría).
create or replace function erp.eti_evento_revision() returns trigger language plpgsql as $$
declare rev record; foto text; ref text;
begin
  if new.tipo = 'EN_REVISION' then
    foto := new.datos->'fotos'->>'completa';
    if foto is null or not exists (select 1 from erp.eti_foto f where f.cliente_id = new.cliente_id and f.huella = foto) then
      raise exception 'EN_REVISION sin su foto en eti_foto (%)', coalesce(foto, 'falta') using errcode = 'check_violation';
    end if;
  end if;
  ref := coalesce(case when new.tipo in ('RECIBIDO', 'RECHAZADO') then new.datos->>'revision' end, case when new.tipo = 'EN_REVISION' then new.datos->>'reemplaza' end);
  if ref is not null then
    select e.operador, e.tipo into rev from erp.eti_evento e where e.cliente_id = new.cliente_id and e.eti_sitio_id = new.eti_sitio_id and e.hash = ref;
    if not found or rev.tipo <> 'EN_REVISION' then raise exception 'la revisión % no está en la cadena de %', ref, new.sitio using errcode = 'check_violation'; end if;
    if exists (select 1 from erp.eti_evento r where r.cliente_id = new.cliente_id and r.eti_sitio_id = new.eti_sitio_id
               and ((r.tipo in ('RECIBIDO', 'RECHAZADO') and r.datos->>'revision' = ref) or (r.tipo = 'EN_REVISION' and r.datos->>'reemplaza' = ref))) then
      raise exception 'la revisión % ya se resolvió', ref using errcode = 'check_violation';
    end if;
    if new.tipo in ('RECIBIDO', 'EN_REVISION') and rev.operador <> new.operador then
      raise exception 'la caducidad la confirma quien registró la recepción (%)', rev.operador using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create or replace trigger eti_evento_revision before insert on erp.eti_evento for each row execute function erp.eti_evento_revision();

-- La bandeja «por confirmar»: revisiones sin resolver (con la RLS de quien consulta).
create or replace view erp.eti_revision_abierta with (security_invoker = true) as
  select e.cliente_id, e.sitio, e.seq, e.fecha, e.lote as folio, e.gtin, e.datos, e.operador, e.hash
  from erp.eti_evento e
  where e.tipo = 'EN_REVISION' and not exists (
    select 1 from erp.eti_evento r where r.cliente_id = e.cliente_id and r.eti_sitio_id = e.eti_sitio_id
      and ((r.tipo in ('RECIBIDO', 'RECHAZADO') and r.datos->>'revision' = e.hash) or (r.tipo = 'EN_REVISION' and r.datos->>'reemplaza' = e.hash)));

-- ============================================================
-- Append-only de los ledgers (como 005 hace con los suyos)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rol_exe_fin') then
    revoke update, delete on erp.eti_asignacion, erp.eti_emitido, erp.eti_importacion, erp.eti_movimiento, erp.eti_evento, erp.eti_testigo from rol_exe_fin;
    -- Fotos: la operación agrega; borrar lo que ya nadie cita (retención) es un job de plataforma declarado (C7).
    revoke update, delete on erp.eti_foto, erp.eti_articulo_foto, erp.eti_formato_fecha from rol_exe_fin;
    -- Las anclas las escribe el central, no la operación de la sucursal.
    revoke insert, update, delete on erp.eti_ancla from rol_exe_fin;
  end if;
end $$;

-- HALLAZGO para quien integre: 004_seguridad.sql re-concede UPDATE sobre TODAS las tablas de
-- `erp` a rol_exe_fin y solo vuelve a quitarlo en sis_bitacora y act_*. Re-correr 004 después de
-- este pack REABRE el UPDATE de sus ledgers (medido en prueba-efimera.sh, fase 2). Al integrar,
-- 004 debe listar también: eti_asignacion, eti_emitido, eti_importacion, eti_movimiento,
-- eti_evento, eti_testigo, eti_foto, eti_articulo_foto, eti_formato_fecha, eti_ronda, eti_tarea y eti_ancla (esta sin
-- INSERT para rol_exe_fin). Las rondas y tareas viven en propuesta-pack-etiquetas-zona.sql. Los triggers de
-- solo-agregar de las tres del expediente aguantan aunque 004 reabra el UPDATE.
