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
insert into erp.eti_sitio (id, cliente_id, clave, nombre, tipo, gln) values
  ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'CEDIS-NTE', 'CEDIS Norte', 'cedis', '9521234900016')
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
  on conflict (cliente_id, eti_sitio_id, zona, gtin, lote, caducidad) where sscc is null do update set cantidad = erp.eti_existencia.cantidad + excluded.cantidad;
  insert into erp.eti_existencia (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cantidad, origen)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'L4471', '2026-10-30', 1, 'etiquetado')
  on conflict (cliente_id, eti_sitio_id, zona, gtin, lote, caducidad) where sscc is null do update set cantidad = erp.eti_existencia.cantidad + excluded.cantidad;
  if (select count(*) from erp.eti_existencia where lote = 'L4471') <> 1 or (select cantidad from erp.eti_existencia where lote = 'L4471') < 2 then raise exception '(d) no sumó'; end if;
  raise notice '(d) OK CSET 82 en la base y alta de lote que suma';
end $$;

insert into erp.eti_emitido (cliente_id, clave, tipo) values ('11111111-1111-4111-8111-111111111111', '09521234000013', 'gtin') on conflict do nothing;
insert into erp.eti_asignacion (cliente_id, eti_articulo_id, nivel, gtin, regla, operador) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'caja', '19521111000010', 'fabricante', 'prueba');
insert into erp.eti_movimiento (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cajas, de_zonas, a_zona, operador) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'L4471', '2026-10-30', 2, array['almacen'], 'piso', 'prueba');

-- (g) la zona solo admite las cuatro, y un GLN con dígito malo no entra como sitio
do $$ begin
  begin
    insert into erp.eti_movimiento (cliente_id, eti_sitio_id, eti_articulo_id, gtin, lote, caducidad, cajas, de_zonas, a_zona, operador) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '19521111000010', 'L4471', '2026-10-30', 1, array['piso'], 'bodega-2', 'prueba');
    raise exception '(g) aceptó una zona inventada';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_sitio (cliente_id, clave, nombre, tipo, gln) values ('11111111-1111-4111-8111-111111111111', 'SUC-X', 'X', 'sucursal', '9521234900011');
    raise exception '(g) aceptó un GLN con dígito malo';
  exception when check_violation then null; end;
  raise notice '(g) OK zonas cerradas a recibo/almacén/piso/merma y GLN del sitio con dígito verificador';
end $$;


-- Expediente: vectores generados con el núcleo (tools/etiquetas-gs1: nuevoEvento, preparaAncla).
-- (h) el génesis de la base es el del núcleo; la cadena solo acepta el evento que continúa la cabeza
do $$ begin
  if erp.eti_genesis('CEDIS-NTE') <> 'sha256:f9531b830cf2395274a6d1d34d0c2a41967622057d6b70a4d75ba914755b17ff' then raise exception '(h) génesis distinto del núcleo: %', erp.eti_genesis('CEDIS-NTE'); end if;
end $$;
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 1, '2026-09-20T09:00:00.000Z', 'RECIBIDO', '19521111000010', 'L4471', '2026-10-30', '{"cajas":48,"zona":"recibo"}', 'op-5e1a0c01', 'sha256:f9531b830cf2395274a6d1d34d0c2a41967622057d6b70a4d75ba914755b17ff', null, 'sha256:ef8e53f30567f22ba9273ffd26b8aa4279b8417f1fd763be9c9ef8ccedcd46b3');
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 2, '2026-09-20T10:00:00.000Z', 'UBICADO', '19521111000010', 'L4471', '2026-10-30', '{"posicion":"B-04-2","cajas":48}', 'op-5e1a0c01', 'sha256:ef8e53f30567f22ba9273ffd26b8aa4279b8417f1fd763be9c9ef8ccedcd46b3', 'sha256:ef8e53f30567f22ba9273ffd26b8aa4279b8417f1fd763be9c9ef8ccedcd46b3', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6');
do $$ begin
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 4, '2026-09-20T18:00:00.000Z', 'VENDIDO', '19521111000010', 'L4471', '2026-10-30', '{"cajas":2}', 'op-5e1a0c02', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167');
    raise exception '(h) aceptó un salto de secuencia';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 3, '2026-09-20T18:00:00.000Z', 'VENDIDO', '19521111000010', 'L4471', '2026-10-30', '{"cajas":2}', 'op-5e1a0c02', 'sha256:ef8e53f30567f22ba9273ffd26b8aa4279b8417f1fd763be9c9ef8ccedcd46b3', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167');
    raise exception '(h) aceptó un evento que no apunta a la cabeza';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 3, '2026-09-20T18:00:00.000Z', 'VENDIDO', '19521111000010', 'L4471', '2026-10-30', '{"cajas":2}', 'Ana López', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167');
    raise exception '(h) aceptó un nombre de persona como operador';
  exception when check_violation then null; end;
  raise notice '(h) OK génesis igual al del núcleo; sin saltos, sin enlaces falsos y sin nombres en la cadena';
end $$;
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 3, '2026-09-20T18:00:00.000Z', 'VENDIDO', '19521111000010', 'L4471', '2026-10-30', '{"cajas":2}', 'op-5e1a0c02', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167');

-- (i) nadie reescribe ni borra un evento, ni siquiera el dueño de la tabla
do $$ begin
  begin update erp.eti_evento set datos = '{"cajas":46,"zona":"recibo"}' where seq = 1; raise exception '(i) pudo reescribir un evento';
  exception when insufficient_privilege then null; end;
  begin delete from erp.eti_evento where seq = 3; raise exception '(i) pudo borrar el último evento';
  exception when insufficient_privilege then null; end;
  raise notice '(i) OK eti_evento es solo-agregar también para el dueño';
end $$;

-- (j) anclas: la primera apunta al génesis, la siguiente continúa y apunta al hash de la anterior
-- (calculado en la base con el mismo JCS), y la cabeza tiene que ser un evento de la cadena
insert into erp.eti_ancla (cliente_id, eti_sitio_id, sitio, periodo, desde_seq, hasta_seq, n, raiz, cabeza, ancla_anterior, creada, firma, llave)
  values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', '2026-09-20', 1, 2, 2, 'sha256:a8d9c61429ad26f8dc11b0b027515dbfb793531c01b74fcf5034091c50bac2a5', 'sha256:71837d36dd9ad8084dace2d75f50ed314b19b722541368cb3c1f34120ea59ca6', 'sha256:f9531b830cf2395274a6d1d34d0c2a41967622057d6b70a4d75ba914755b17ff', '2026-09-20T23:00:00.000Z', 'firma-verificada-por-el-central', 'ed25519:0123456789abcdef');
do $$ begin
  if (select erp.eti_hash_ancla(a) from erp.eti_ancla a where desde_seq = 1) <> 'sha256:74ebd1e6d5a6d2e330c50e4a0ce6d87d88e3514785e46839940cc30d8e5b6d16' then raise exception '(j) hash del ancla distinto del núcleo'; end if;
  begin
    insert into erp.eti_ancla (cliente_id, eti_sitio_id, sitio, periodo, desde_seq, hasta_seq, n, raiz, cabeza, ancla_anterior, creada, firma, llave)
      values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', '2026-09-21', 3, 3, 1, 'sha256:a90b9d2318361dc8e1f29d3b7840dec09ae538a866da3eda95a4df6c3d952c5c', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167', 'sha256:f9531b830cf2395274a6d1d34d0c2a41967622057d6b70a4d75ba914755b17ff', '2026-09-21T23:00:00.000Z', 'f', 'ed25519:0123456789abcdef');
    raise exception '(j) aceptó un ancla que no apunta a la anterior';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_ancla (cliente_id, eti_sitio_id, sitio, periodo, desde_seq, hasta_seq, n, raiz, cabeza, ancla_anterior, creada, firma, llave)
      values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', '2026-09-21', 3, 3, 1, 'sha256:a90b9d2318361dc8e1f29d3b7840dec09ae538a866da3eda95a4df6c3d952c5c', 'sha256:ef8e53f30567f22ba9273ffd26b8aa4279b8417f1fd763be9c9ef8ccedcd46b3', 'sha256:74ebd1e6d5a6d2e330c50e4a0ce6d87d88e3514785e46839940cc30d8e5b6d16', '2026-09-21T23:00:00.000Z', 'f', 'ed25519:0123456789abcdef');
    raise exception '(j) aceptó una cabeza que no es el evento #3';
  exception when check_violation then null; end;
  insert into erp.eti_ancla (cliente_id, eti_sitio_id, sitio, periodo, desde_seq, hasta_seq, n, raiz, cabeza, ancla_anterior, creada, firma, llave)
    values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', '2026-09-21', 3, 3, 1, 'sha256:a90b9d2318361dc8e1f29d3b7840dec09ae538a866da3eda95a4df6c3d952c5c', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167', 'sha256:74ebd1e6d5a6d2e330c50e4a0ce6d87d88e3514785e46839940cc30d8e5b6d16', '2026-09-21T23:00:00.000Z', 'f', 'ed25519:0123456789abcdef');
  raise notice '(j) OK anclas encadenadas con el hash JCS calculado en la base; cabeza atada a la cadena';
end $$;

-- (l) inventario físico: el CONTEO entra a la cadena como cualquier evento (vector del núcleo)
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 4, '2026-09-22T15:00:00.000Z', 'CONTEO', '19521111000010', 'L4471', '2026-10-30',
   '{"folio":"CNT-CEDIS-NTE-20260922090000","diferencia":-1}', 'op-5e1a0c03', 'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167',
   'sha256:eb3e728a708bdaa2b99d8db3049c4097397a79907b298cbd0ba29cf8a5155167', 'sha256:396d3d8801be1b7728cd8f78b70f7f10a194709982f344d80ffc439efc523665');
do $$ begin
  if not exists (select 1 from erp.eti_evento where tipo = 'CONTEO' and seq = 4) then raise exception '(l) no entró el CONTEO'; end if;
  raise notice '(l) OK el CONTEO se encadena tras la venta, como cualquier evento';
end $$;

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
  begin update erp.eti_movimiento set cajas = 99; raise exception '(f) pudo reescribir un movimiento';
  exception when insufficient_privilege then null; end;
  raise notice '(f) OK eti_emitido, eti_asignacion y eti_movimiento son append-only para rol_exe_fin';
end $$;

-- (k) la operación de la sucursal no escribe anclas (eso es del central) ni toca la cadena
do $$ begin
  begin
    insert into erp.eti_ancla (cliente_id, eti_sitio_id, sitio, periodo, desde_seq, hasta_seq, n, raiz, cabeza, ancla_anterior, creada, firma, llave)
      values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', '2026-09-22', 4, 4, 1, 'sha256:0000000000000000000000000000000000000000000000000000000000000000', 'sha256:0000000000000000000000000000000000000000000000000000000000000000', 'sha256:0000000000000000000000000000000000000000000000000000000000000000', 'x', 'f', 'ed25519:0123456789abcdef');
    raise exception '(k) la sucursal pudo escribir un ancla';
  exception when insufficient_privilege then null; end;
  begin delete from erp.eti_evento; raise exception '(k) pudo borrar la cadena';
  exception when insufficient_privilege then null; end;
  if (select count(*) from erp.eti_evento) <> 4 then raise exception '(k) no ve su cadena'; end if;
  raise notice '(k) OK rol_exe_fin lee su cadena, no la borra y no escribe anclas';
end $$;
reset role;

-- (m) recepción con foto: EN_REVISION sin caducidad y citando una foto que EXISTE; un RECIBIDO sin caducidad no entra
insert into erp.eti_foto (cliente_id, huella, tipo, bytes, ancho, alto, ubicacion) values
  ('11111111-1111-4111-8111-111111111111', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'image/jpeg', 182340, 1280, 720, 'fotos/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg'),
  ('11111111-1111-4111-8111-111111111111', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'image/png', 40211, 1075, 202, 'fotos/bb/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png')
  on conflict do nothing;
do $$ begin
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 5, '2026-09-27T15:00:00.000Z', 'EN_REVISION', '19521111000010', 'REV-MFK00001', null, '{"sku":"YOG-001","cajas":20,"zona":"recibo","fotos":{"completa":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","recortes":["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]},"propuesta":{"estado":"propuesta","fecha":"2027-05-30","lote":"L4471"},"cambios":[]}', 'op-5e1a0c04', 'sha256:396d3d8801be1b7728cd8f78b70f7f10a194709982f344d80ffc439efc523665', null, 'sha256:5555555555555555555555555555555555555555555555555555555555555555');
    raise exception '(m) aceptó una revisión cuya foto no está en eti_foto';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 5, '2026-09-27T15:00:00.000Z', 'RECIBIDO', '19521111000010', 'L4471', null, '{"cajas":20}', 'op-5e1a0c04', 'sha256:396d3d8801be1b7728cd8f78b70f7f10a194709982f344d80ffc439efc523665', null, 'sha256:5555555555555555555555555555555555555555555555555555555555555555');
    raise exception '(m) aceptó un RECIBIDO sin caducidad';
  exception when check_violation then null; end;
end $$;
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 5, '2026-09-27T15:00:00.000Z', 'EN_REVISION', '19521111000010', 'REV-MFK00001', null, '{"sku":"YOG-001","cajas":20,"zona":"recibo","fotos":{"completa":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","recortes":["sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]},"propuesta":{"estado":"propuesta","fecha":"2027-05-30","lote":"L4471"},"cambios":[]}', 'op-5e1a0c04', 'sha256:396d3d8801be1b7728cd8f78b70f7f10a194709982f344d80ffc439efc523665', null, 'sha256:5555555555555555555555555555555555555555555555555555555555555555');
do $$ begin
  if (select count(*) from erp.eti_revision_abierta) <> 1 then raise exception '(m) la bandeja no ve la revisión abierta'; end if;
  raise notice '(m) OK EN_REVISION sin caducidad y con su foto; un RECIBIDO sin caducidad no entra; la bandeja la ve';
end $$;

-- (n) la CONFIRMA quien la registró, y una sola vez
do $$ begin
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 6, '2026-09-27T16:00:00.000Z', 'RECIBIDO', '19521111000010', 'L4471', '2027-05-30', '{"cajas":20,"zona":"recibo","revision":"sha256:5555555555555555555555555555555555555555555555555555555555555555"}', 'op-5e1a0c05', 'sha256:5555555555555555555555555555555555555555555555555555555555555555', null, 'sha256:6666666666666666666666666666666666666666666666666666666666666666');
    raise exception '(n) otra persona pudo confirmar la revisión';
  exception when check_violation then null; end;
end $$;
insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 6, '2026-09-27T16:00:00.000Z', 'RECIBIDO', '19521111000010', 'L4471', '2027-05-30', '{"cajas":20,"zona":"recibo","revision":"sha256:5555555555555555555555555555555555555555555555555555555555555555","lectura":{"propuesta":{"fecha":"2027-05-30"},"confirmada":{"caducidad":"2027-05-30","lote":"L4471"},"corregida":{"fecha":false,"lote":false}}}', 'op-5e1a0c04', 'sha256:5555555555555555555555555555555555555555555555555555555555555555', null, 'sha256:6666666666666666666666666666666666666666666666666666666666666666');
do $$ begin
  if exists (select 1 from erp.eti_revision_abierta) then raise exception '(n) la revisión sigue abierta tras confirmarla'; end if;
  begin
    insert into erp.eti_evento (cliente_id, eti_sitio_id, sitio, seq, fecha, tipo, gtin, lote, caducidad, datos, operador, anterior, anterior_lote, hash) values ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'CEDIS-NTE', 7, '2026-09-27T17:00:00.000Z', 'RECHAZADO', '19521111000010', 'REV-MFK00001', null, '{"revision":"sha256:5555555555555555555555555555555555555555555555555555555555555555","descartada":true,"motivo":"otra vez"}', 'op-5e1a0c05', 'sha256:6666666666666666666666666666666666666666666666666666666666666666', 'sha256:5555555555555555555555555555555555555555555555555555555555555555', 'sha256:7777777777777777777777777777777777777777777777777777777777777777');
    raise exception '(n) se resolvió dos veces la misma revisión';
  exception when check_violation then null; end;
  raise notice '(n) OK la confirma quien la registró (otra persona no), una sola vez, y la bandeja queda vacía';
end $$;

-- (o) foto del artículo por huella existente; formato de fecha solo de la lista
insert into erp.eti_articulo_foto (cliente_id, eti_articulo_id, vista, huella, nota, operador) values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'caducidad', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'cuello, por encima del líquido', 'op-5e1a0c04');
insert into erp.eti_formato_fecha (cliente_id, eti_articulo_id, formato, tipo, operador, evento) values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'DDMMAA', 'caducidad', 'op-5e1a0c04', 'sha256:6666666666666666666666666666666666666666666666666666666666666666');
do $$ begin
  begin
    insert into erp.eti_articulo_foto (cliente_id, eti_articulo_id, vista, huella, operador) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'principal', 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'op-5e1a0c04');
    raise exception '(o) aceptó una foto que no está en eti_foto';
  exception when foreign_key_violation then null; end;
  begin
    insert into erp.eti_formato_fecha (cliente_id, eti_articulo_id, formato, tipo, operador) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'latest', 'caducidad', 'op-5e1a0c04');
    raise exception '(o) aceptó un formato fuera de la lista';
  exception when check_violation then null; end;
  begin
    insert into erp.eti_articulo_foto (cliente_id, eti_articulo_id, vista, huella, operador) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-000000000001', 'principal', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Ana López');
    raise exception '(o) aceptó un nombre como operador';
  exception when check_violation then null; end;
  raise notice '(o) OK fotos del artículo por huella existente, seudónimo y formato de fecha de la lista';
end $$;

-- (p) para la operación, fotos y formatos son solo-agregar
set role rol_exe_fin;
set app.cliente_id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  begin update erp.eti_articulo_foto set nota = 'otra'; raise exception '(p) pudo reescribir una foto del artículo';
  exception when insufficient_privilege then null; end;
  begin delete from erp.eti_foto; raise exception '(p) pudo borrar una foto';
  exception when insufficient_privilege then null; end;
  begin update erp.eti_formato_fecha set formato = 'AAMMDD'; raise exception '(p) pudo cambiar un formato aprendido';
  exception when insufficient_privilege then null; end;
  if (select count(*) from erp.eti_foto) <> 2 then raise exception '(p) la operación no ve sus fotos'; end if;
  raise notice '(p) OK para rol_exe_fin, eti_foto, eti_articulo_foto y eti_formato_fecha son solo-agregar';
end $$;
reset role;
