-- Pruebas del pack de etiquetas en el Postgres efímero. Cada bloque lanza si falla.
-- Tenants ficticios; datos ficticios (prefijo 952 de demostración de GS1).
\set ON_ERROR_STOP on


-- (a) RLS habilitada y FORZADA en todas las tablas eti_*
do $$ declare n int; begin
  select count(*) into n from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'erp' and c.relname like 'eti\_%' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity);
  if n > 0 then raise exception '(a) % tablas eti_* sin RLS forzada', n; end if;
  raise notice '(a) OK RLS forzada en todas las tablas eti_*';
end $$;

-- (b) dígito verificador en la base: vectores de las GenSpecs y de GS1
do $$ begin
  if not erp.gs1_digito_ok('376104250021234569') then raise exception '(b) Tabla 7-9'; end if;
  if not erp.gs1_digito_ok('09521234000020') or erp.gs1_digito_ok('09521234000021') then raise exception '(b) GTIN 952'; end if;
  raise notice '(b) OK gs1_digito_ok con la Tabla 7-9 y el GTIN de ejemplo 952';
end $$;

-- Datos de dos tenants, como administrador (rol postgres: dueño, sin RLS de por medio al sembrar)
set app.cliente_id = '11111111-1111-4111-8111-111111111111';
insert into erp.inv_articulo (id, cliente_id, sku, nombre) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'YOG-001', 'Yogurt natural 1 kg'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'PAN-004', 'Pan de caja 680 g'),
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'YOG-001', 'Yogurt de otro tenant')
  on conflict do nothing;
insert into erp.eti_sitio (id, cliente_id, clave, nombre, tipo) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CEDIS-NTE', 'CEDIS Norte', 'cedis')
  on conflict do nothing;
insert into erp.eti_articulo (id, cliente_id, inv_articulo_id, gtin_unidad, regla_unidad, gtin_caja, regla_caja, unidades_por_caja) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '09521111000013', 'fabricante', '19521111000010', 'fabricante', 12),
  ('eeeeeeee-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000001', '09521111000013', 'fabricante', null, null, 12)
  on conflict do nothing;

-- (c) un GTIN malo no entra, ni uno ya usado por otro artículo del MISMO tenant (en otro tenant sí)
do $$ begin
  begin
    insert into erp.eti_articulo (cliente_id, inv_articulo_id, gtin_unidad) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', '09521234000021');
    raise exception '(c) aceptó un dígito malo';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_articulo (cliente_id, inv_articulo_id, gtin_unidad) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', '19521111000010');
    raise exception '(c) aceptó un GTIN de caja de otro artículo';
  exception when unique_violation then null; end;
  raise notice '(c) OK dígito malo y GTIN de otro artículo rechazados (el mismo GTIN en otro tenant convive)';
end $$;

-- (d) lote fuera de CSET 82 rechazado; el mismo lote sin SSCC es un renglón (el alta suma)
do $$ begin
  begin
    insert into erp.eti_existencia (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cantidad, origen)
    values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'LOTE Ñ1', '2026-10-30', 1, 'etiquetado');
    raise exception '(d) aceptó un lote con Ñ y espacio';
  exception when check_violation then null; end;
  insert into erp.eti_existencia (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cantidad, origen)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'L4471', '2026-10-30', 1, 'etiquetado')
  on conflict (cliente_id, eti_sitio_id, gtin, lote, caducidad) where sscc is null do update set cantidad = erp.eti_existencia.cantidad + excluded.cantidad;
  insert into erp.eti_existencia (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cantidad, origen)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'L4471', '2026-10-30', 1, 'etiquetado')
  on conflict (cliente_id, eti_sitio_id, gtin, lote, caducidad) where sscc is null do update set cantidad = erp.eti_existencia.cantidad + excluded.cantidad;
  if (select count(*) from erp.eti_existencia where lote = 'L4471') <> 1 or (select cantidad from erp.eti_existencia where lote = 'L4471') < 2 then raise exception '(d) no sumó'; end if;
  raise notice '(d) OK CSET 82 en la base y alta de lote que suma';
end $$;

insert into erp.eti_emitido (cliente_id, clave, tipo) values ('11111111-1111-4111-8111-111111111111', '09521234000013', 'gtin') on conflict do nothing;
insert into erp.eti_asignacion (cliente_id, eti_articulo_id, nivel, gtin, regla, operador) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'caja', '19521111000010', 'fabricante', 'prueba');

-- (e) aislamiento entre tenants, como el rol de ejecución
set role rol_exe_fin;
set app.cliente_id = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if (select count(*) from erp.eti_articulo) <> 1 or exists (select 1 from erp.eti_existencia) then raise exception '(e) el tenant 2 ve datos del 1'; end if;
  raise notice '(e) OK el tenant 2 solo ve lo suyo';
end $$;

-- (f) ledgers append-only para el rol de ejecución (NO se puede reusar ni reescribir la traza)
set app.cliente_id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  begin update erp.eti_emitido set tipo = 'sscc'; raise exception '(f) pudo modificar eti_emitido';
  exception when insufficient_privilege then null; end;
  begin update erp.eti_asignacion set operador = 'otro'; raise exception '(f) pudo modificar eti_asignacion';
  exception when insufficient_privilege then null; end;
  begin delete from erp.eti_emitido; raise exception '(f) pudo borrar eti_emitido';
  exception when insufficient_privilege then null; end;
  raise notice '(f) OK eti_emitido y eti_asignacion son append-only para rol_exe_fin';
end $$;
reset role;
