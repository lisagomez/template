-- PROPUESTA — NO APLICADA. Esquema del vendedor en WhatsApp para Postgres/Supabase.
-- Vive fuera de `supabase/migrations/` a propósito: nada lo aplica. Se valida en un Postgres
-- EFÍMERO (PGlite, en proceso) con `pruebas/esquema.ts`; aplicarlo a una base real es decisión
-- humana aparte (migración = acción irreversible, gate humano).
--
-- Reglas:
--  * `inquilino_id` en TODAS las tablas (la fuente: «desde el primer día, para no migrar al escalar»).
--  * RLS en todas. El panel del dueño corre como `authenticated`: ve solo los inquilinos de los que
--    es miembro (`vw_miembro`), y no puede escribir filas de otro (WITH CHECK).
--  * C7: `service_role` (BYPASSRLS) SOLO en el trabajador del webhook de Meta y del procesador,
--    que llegan con firma verificada y no tienen usuario. Declarado aquí; ninguna superficie de
--    negocio lo usa.
--  * La idempotencia es del esquema, no solo del código: `wamid`, `origen_wamid`, id de pago y
--    `event_id` son únicos por inquilino.
--  * Idempotente: se puede correr dos veces.

create table if not exists vw_inquilino (
  id text primary key,
  nombre text not null,
  giro text not null check (giro in ('restaurante', 'tienda', 'servicios')),
  pais text not null default 'MX',
  moneda text not null default 'MXN',
  zona_horaria text not null default 'America/Mexico_City',
  waba_id text not null,
  phone_number_id text not null unique,
  dataset_id text not null,
  catalogo_id text not null,
  politicas jsonb not null default '{}'::jsonb,
  estado text not null default 'activo' check (estado in ('activo', 'pausado')),
  motivo_pausa text,
  creado_en timestamptz not null default now()
);

-- Quién ve qué inquilino (el dueño, su equipo). El token del canal NO vive aquí: va a un vault (P-02).
create table if not exists vw_miembro (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  user_id uuid not null,
  rol text not null default 'dueno' check (rol in ('dueno', 'equipo')),
  primary key (inquilino_id, user_id)
);

create table if not exists vw_contacto (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  wa_id text not null,
  nombre text,
  opt_in_en timestamptz,
  opt_in_fuente text,
  aviso_privacidad_en timestamptz,
  -- Lista de bloqueo del dueño: sus mensajes se guardan y no se responden.
  bloqueado_en timestamptz,
  bloqueado_motivo text,
  -- Ráfaga de contactos nuevos: la única respuesta de cortesía ya se mandó.
  contenido_en timestamptz,
  creado_en timestamptz not null default now(),
  primary key (inquilino_id, wa_id)
);

create table if not exists vw_conversacion (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  context_id text not null,
  wa_id text not null,
  estado text not null default 'agente' check (estado in ('agente', 'humano', 'pausada_eco')),
  pausada_hasta timestamptz,
  ventanas jsonb not null default '{}'::jsonb,
  origen_tipo text not null default 'directo' check (origen_tipo in ('anuncio', 'organico', 'directo')),
  ctwa_clid text,
  anuncio_id text,
  campana_id text,
  etiqueta text,
  fallos_comprension int not null default 0,
  turnos int not null default 0,
  tokens int not null default 0,
  abierta_en timestamptz not null default now(),
  primary key (inquilino_id, id),
  foreign key (inquilino_id, wa_id) references vw_contacto(inquilino_id, wa_id)
);

create table if not exists vw_mensaje (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  wamid text not null,
  conversacion_id text not null,
  direccion text not null check (direccion in ('entrante', 'saliente', 'eco', 'historial')),
  autor text not null check (autor in ('cliente', 'agente', 'dueno', 'sistema')),
  tipo text not null,
  resumen text not null,
  estado text,
  precio_categoria text,
  precio_tipo text,
  precio_cobrable boolean,
  costo_micro_usd bigint,
  instante timestamptz not null,
  primary key (inquilino_id, wamid),
  foreign key (inquilino_id, conversacion_id) references vw_conversacion(inquilino_id, id)
);

create table if not exists vw_producto (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  retailer_id text not null,
  nombre text not null,
  descripcion text not null default '',
  precio_centavos bigint not null check (precio_centavos > 0),
  existencias int not null check (existencias >= 0),
  categoria text not null default 'general',
  activo boolean not null default true,
  primary key (inquilino_id, retailer_id)
);

create table if not exists vw_pedido (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  conversacion_id text not null,
  origen_wamid text not null,
  items jsonb not null,
  subtotal_centavos bigint not null,
  envio_centavos bigint not null default 0,
  total_centavos bigint not null,
  moneda text not null default 'MXN',
  estado text not null check (estado in ('carrito', 'por_pagar', 'pagado', 'fallido', 'cancelado', 'en_revision')),
  liga_id text,
  entrega jsonb,
  facturacion jsonb,
  pagado_en timestamptz,
  creado_en timestamptz not null default now(),
  primary key (inquilino_id, id),
  unique (inquilino_id, origen_wamid)
);

create table if not exists vw_pago (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  pedido_id text not null,
  monto_centavos bigint not null,
  moneda text not null,
  estado text not null check (estado in ('pagado', 'fallido')),
  duplicados_ignorados int not null default 0,
  recibido_en timestamptz not null default now(),
  primary key (inquilino_id, id),
  foreign key (inquilino_id, pedido_id) references vw_pedido(inquilino_id, id)
);

create table if not exists vw_cita (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  conversacion_id text not null,
  servicio_id text not null,
  inicio timestamptz not null,
  fin timestamptz not null check (fin > inicio),
  estado text not null check (estado in ('confirmada', 'cancelada')),
  primary key (inquilino_id, id)
);

create table if not exists vw_caso (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  conversacion_id text not null,
  motivo text not null,
  detalle text not null default '',
  estado text not null check (estado in ('abierto', 'tomado', 'liberado')),
  abierto_en timestamptz not null default now(),
  primary key (inquilino_id, id)
);

create table if not exists vw_evento_conversion (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  event_id text not null,
  nombre text not null check (nombre in ('Purchase', 'LeadSubmitted')),
  conversacion_id text not null,
  pedido_id text,
  valor_centavos bigint,
  moneda text,
  ctwa_clid text,
  estado text not null check (estado in ('pendiente', 'aceptado', 'rechazado', 'sin_clid')),
  intentos int not null default 0,
  ultima_respuesta text,
  enviado_en timestamptz,
  primary key (inquilino_id, event_id)
);

-- El costo va NULL cuando el proveedor no devolvió uso: nunca cero (contabilidad de la casa).
create table if not exists vw_uso_ia (
  inquilino_id text not null references vw_inquilino(id) on delete cascade,
  id text not null,
  conversacion_id text not null,
  modelo text not null,
  tokens_entrada int,
  tokens_salida int,
  costo_micro_usd bigint,
  simulado boolean not null,
  instante timestamptz not null default now(),
  primary key (inquilino_id, id)
);

-- RLS: todas las tablas. El panel lee y escribe solo sus inquilinos.
do $$
declare t text;
begin
  foreach t in array array['vw_inquilino', 'vw_miembro', 'vw_contacto', 'vw_conversacion', 'vw_mensaje', 'vw_producto', 'vw_pedido', 'vw_pago', 'vw_cita', 'vw_caso', 'vw_evento_conversion', 'vw_uso_ia'] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
  foreach t in array array['vw_contacto', 'vw_conversacion', 'vw_mensaje', 'vw_producto', 'vw_pedido', 'vw_pago', 'vw_cita', 'vw_caso', 'vw_evento_conversion', 'vw_uso_ia'] loop
    execute format('drop policy if exists %I on %I', t || '_del_inquilino', t);
    execute format(
      'create policy %I on %I for all to authenticated using (inquilino_id in (select m.inquilino_id from vw_miembro m where m.user_id = auth.uid())) with check (inquilino_id in (select m.inquilino_id from vw_miembro m where m.user_id = auth.uid()))',
      t || '_del_inquilino', t);
  end loop;
end $$;

drop policy if exists vw_miembro_propio on vw_miembro;
create policy vw_miembro_propio on vw_miembro for select to authenticated using (user_id = auth.uid());

drop policy if exists vw_inquilino_propio on vw_inquilino;
create policy vw_inquilino_propio on vw_inquilino for select to authenticated
  using (id in (select m.inquilino_id from vw_miembro m where m.user_id = auth.uid()));
