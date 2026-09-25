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
  origen           text not null check (origen in ('etiquetado', 'recepcion', 'semilla')),
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
-- Append-only de los ledgers (como 005 hace con los suyos)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'rol_exe_fin') then
    revoke update, delete on erp.eti_asignacion, erp.eti_emitido, erp.eti_importacion, erp.eti_movimiento from rol_exe_fin;
  end if;
end $$;

-- HALLAZGO para quien integre: 004_seguridad.sql re-concede UPDATE sobre TODAS las tablas de
-- `erp` a rol_exe_fin y solo vuelve a quitarlo en sis_bitacora y act_*. Re-correr 004 después de
-- este pack REABRE el UPDATE de sus ledgers (medido en prueba-efimera.sh, fase 2). Al integrar,
-- 004 debe listar también: eti_asignacion, eti_emitido, eti_importacion, eti_movimiento.
