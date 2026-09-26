-- ═══════════════════════════════════════════════════════════════════
-- ERP · pruebas de cierre de una instalación
-- ═══════════════════════════════════════════════════════════════════
-- Lo corre pruebas.sh. TODO pasa dentro de UNA transacción que termina en
-- ROLLBACK: se puede correr contra la base real de un tenant sin dejar filas
-- (ni en la bitácora append-only, que ningún rol del ERP puede limpiar).
--
-- Requiere que el usuario de conexión pueda hacer SET ROLE a rol_exe_fin y
-- rol_swm (superusuario, o el puente ERP_PUENTE_POSTGRES=1 del instalador):
-- las pruebas ejercitan los grants y la RLS REALES, nunca un atajo.
--
-- Tenant A = ERP_TENANT_ID (el de la instalación); tenant B = uno al azar.
-- Una prueba que falla aborta todo (ON_ERROR_STOP) y el script sale con error.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP 1
\getenv tenant ERP_TENANT_ID
select gen_random_uuid() as tenant_b \gset

begin;
select set_config('pruebas.tenant_a', :'tenant', true),
       set_config('pruebas.tenant_b', :'tenant_b', true) \g /dev/null

-- ── (h) estructura: RLS FORCE y política en TODA tabla del esquema ──
do $$
declare n int; m int; p int;
begin
  select count(*), count(*) filter (where relrowsecurity and relforcerowsecurity)
    into n, m from pg_class where relnamespace = 'erp'::regnamespace and relkind = 'r';
  select count(distinct tablename) into p
    from pg_policies where schemaname = 'erp' and policyname = 'tenant_aislamiento';
  if n = 0 or m <> n or p <> n then
    raise exception '(h) RLS: % tablas, % con FORCE, % con política', n, m, p;
  end if;
end $$;
\echo 'OK (h) RLS FORCE + política tenant_aislamiento en todas las tablas'

-- A partir de aquí, como el EJECUTOR y en el tenant A.
set local role rol_exe_fin;
select set_config('app.cliente_id', :'tenant', true) \g /dev/null

-- ── (a) la cadena completa cuadra: ped → fac → cfd → cob ────────────
do $$
declare
  t uuid := current_setting('app.cliente_id')::uuid;
  cli uuid; art uuid; ped uuid; fac uuid; con uuid; fol uuid; tim uuid; cob uuid;
  v_total numeric; v_cobrado numeric;
begin
  insert into erp.cob_cliente (cliente_id, nombre, rfc)
       values (t, 'Cliente de prueba', 'XAXX010101000') returning id into cli;
  insert into erp.inv_articulo (cliente_id, sku, nombre)
       values (t, 'SKU-PRUEBA', 'Artículo de prueba') returning id into art;
  insert into erp.inv_precio (cliente_id, inv_articulo_id, precio) values (t, art, 100);
  insert into erp.ped_pedido (cliente_id, folio, cob_cliente_id, subtotal, total)
       values (t, erp.siguiente_folio(t, 'PED'), cli, 200, 232) returning id into ped;
  insert into erp.ped_partida (cliente_id, ped_pedido_id, inv_articulo_id, cantidad, precio_unitario, importe)
       values (t, ped, art, 2, 100, 200);
  insert into erp.fac_factura (cliente_id, folio, cob_cliente_id, metodo_pago, forma_pago,
                               subtotal, impuestos_trasladados, total)
       values (t, erp.siguiente_folio(t, 'FAC'), cli, 'PUE', '03', 200, 32, 232) returning id into fac;
  insert into erp.fac_concepto (cliente_id, fac_factura_id, descripcion, cantidad, valor_unitario, importe)
       values (t, fac, 'Artículo de prueba', 2, 100, 200) returning id into con;
  insert into erp.fac_impuesto (cliente_id, fac_concepto_id, tipo, naturaleza, tasa, base, importe)
       values (t, con, 'IVA', 'traslado', 0.16, 200, 32);
  update erp.fac_factura set estado = 'emitida' where id = fac;
  update erp.ped_pedido set estado = 'facturado', fac_factura_id = fac where id = ped;
  insert into erp.cfd_folio (cliente_id, serie, folio_num) values (t, 'A', 1) returning id into fol;
  insert into erp.cfd_timbre (cliente_id, tipo, documento_tipo, documento_id, cfd_folio_id, llave_idempotencia)
       values (t, 'ingreso', 'factura', fac, fol, 'prueba-llave-1') returning id into tim;
  update erp.cfd_timbre set estado = 'enviado_sin_respuesta' where id = tim;
  update erp.cfd_timbre set estado = 'timbrado', uuid_fiscal = gen_random_uuid(), fecha_timbrado = now()
   where id = tim;
  insert into erp.cob_cobro (cliente_id, folio, cob_cliente_id, monto, forma_pago)
       values (t, erp.siguiente_folio(t, 'COB'), cli, 232, '03') returning id into cob;
  insert into erp.cob_cobro_aplicacion (cliente_id, cob_cobro_id, fac_factura_id, importe)
       values (t, cob, fac, 232);
  insert into erp.sis_bitacora (cliente_id, traza_id, actor, actor_tipo, modulo, verbo,
                                entidad_tipo, entidad_id, resultado)
       values (t, gen_random_uuid(), 'pruebas', 'sistema', 'fac', 'emitir', 'factura', fac::text, 'ok');

  select total into v_total from erp.fac_factura where id = fac;
  select sum(importe) into v_cobrado from erp.cob_cobro_aplicacion where fac_factura_id = fac;
  if not (200 + 32 = v_total and v_total = v_cobrado) then
    raise exception '(a) la cadena no cuadra: total %, cobrado %', v_total, v_cobrado;
  end if;
end $$;
\echo 'OK (a) cadena completa: subtotal + IVA = total = cobrado (232 = 232 = 232)'

-- ── (b) la BD rechaza sola lo que no cuadra ─────────────────────────
do $$
declare
  t uuid := current_setting('app.cliente_id')::uuid;
  cli uuid; fac uuid; con uuid; tim uuid; rechazos int := 0;
begin
  select id into cli from erp.cob_cliente where rfc = 'XAXX010101000';
  select id into tim from erp.cfd_timbre where llave_idempotencia = 'prueba-llave-1';

  begin  -- descuadre de cabecera
    insert into erp.fac_factura (cliente_id, folio, cob_cliente_id, metodo_pago, forma_pago,
                                 subtotal, impuestos_trasladados, total)
         values (t, 'FAC-X1', cli, 'PUE', '03', 100, 16, 999);
    raise exception '(b) NO rechazó el descuadre de cabecera';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- total negativo
    insert into erp.fac_factura (cliente_id, folio, cob_cliente_id, metodo_pago, forma_pago,
                                 subtotal, impuestos_retenidos, total)
         values (t, 'FAC-X2', cli, 'PUE', '03', 0, 1, -1);
    raise exception '(b) NO rechazó un total negativo';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- emitir sin conceptos
    insert into erp.fac_factura (cliente_id, folio, cob_cliente_id, metodo_pago, forma_pago)
         values (t, 'FAC-X3', cli, 'PUE', '03') returning id into fac;
    update erp.fac_factura set estado = 'emitida' where id = fac;
    raise exception '(b) NO rechazó emitir sin conceptos';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- descuadre cabecera ↔ detalle
    insert into erp.fac_factura (cliente_id, folio, cob_cliente_id, metodo_pago, forma_pago, subtotal, total)
         values (t, 'FAC-X4', cli, 'PUE', '03', 100, 100) returning id into fac;
    insert into erp.fac_concepto (cliente_id, fac_factura_id, descripcion, cantidad, valor_unitario, importe)
         values (t, fac, 'mitad', 1, 50, 50);
    update erp.fac_factura set estado = 'emitida' where id = fac;
    raise exception '(b) NO rechazó el descuadre cabecera↔detalle';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- transición de timbre inválida (timbrado → borrador)
    update erp.cfd_timbre set estado = 'borrador' where id = tim;
    raise exception '(b) NO rechazó la transición timbrado → borrador';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- importe de concepto mal calculado
    select id into fac from erp.fac_factura where folio like 'FAC-%' and estado = 'emitida' limit 1;
    insert into erp.fac_concepto (cliente_id, fac_factura_id, descripcion, cantidad, valor_unitario, importe)
         values (t, fac, 'mal', 2, 10, 21);
    raise exception '(b) NO rechazó un importe mal calculado';
  exception when check_violation then rechazos := rechazos + 1; end;

  begin  -- prefijo de folio fuera de la lista cerrada
    perform erp.siguiente_folio(t, 'XYZ');
    raise exception '(b) NO rechazó un prefijo de folio inventado';
  exception when check_violation then rechazos := rechazos + 1; end;

  if rechazos <> 7 then raise exception '(b) rechazos: % de 7', rechazos; end if;
end $$;
\echo 'OK (b) rechazos de la BD: cabecera, negativo, sin conceptos, cabecera↔detalle, timbre, importe, prefijo (7/7)'

-- ── (e) nadie borra; (f) lo append-only no se modifica ─────────────
do $$
declare rechazos int := 0; t text;
begin
  begin
    delete from erp.cob_cobro_aplicacion;
    raise exception '(e) el ejecutor PUDO borrar';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  foreach t in array array['sis_bitacora','act_version','act_costo'] loop
    begin
      execute format('update erp.%I set created_at = created_at', t);
      raise exception '(f) el ejecutor PUDO modificar %', t;
    exception when insufficient_privilege then rechazos := rechazos + 1; end;
  end loop;
  if rechazos <> 4 then raise exception '(e/f) rechazos: % de 4', rechazos; end if;
end $$;
\echo 'OK (e) DELETE denegado al ejecutor'
\echo 'OK (f) append-only: sis_bitacora, act_version y act_costo sin UPDATE'

-- ── (i) módulo act: costo acumulado por trigger y decisiones humanas ─
do $$
declare
  t uuid := current_setting('app.cliente_id')::uuid;
  act uuid; costo numeric; rechazos int := 0;
begin
  insert into erp.act_activo (cliente_id, folio, nombre, tipo, ubicacion, eje_dei)
       values (t, erp.siguiente_folio(t, 'ACT'), 'Activo de prueba', 'software', 'repo/ruta', 'desarrollo')
    returning id into act;
  insert into erp.act_costo (cliente_id, activo_id, componente, monto, eje_dei, fuente)
       values (t, act, 'tokens', 10.50, 'desarrollo', 'prueba'),
              (t, act, 'horas_humanas', 4.25, 'desarrollo', 'prueba');
  select costo_acumulado into costo from erp.act_activo where id = act;
  if costo <> 14.75 then raise exception '(i) costo_acumulado % (esperado 14.75)', costo; end if;

  begin
    update erp.act_activo set defensibilidad_estado = 'ratificada' where id = act;
    raise exception '(i) NO rechazó ratificar sin ratificador';
  exception when check_violation then rechazos := rechazos + 1; end;
  begin
    update erp.act_activo set estatus_contable = 'capitalizado', fecha_alta_contable = current_date
     where id = act;
    raise exception '(i) NO rechazó capitalizar sin vida útil';
  exception when check_violation then rechazos := rechazos + 1; end;
  if rechazos <> 2 then raise exception '(i) rechazos: % de 2', rechazos; end if;
end $$;
\echo 'OK (i) act: costo_acumulado lo mantiene el trigger (14.75); ratificar y capitalizar exigen rastro'

-- ── (j) folios humanos: secuenciales y por tenant ──────────────────
do $$
declare
  a uuid := current_setting('pruebas.tenant_a')::uuid;
  b uuid := current_setting('pruebas.tenant_b')::uuid;
  f1 text; f2 text; fb text;
begin
  f1 := erp.siguiente_folio(a, 'REP');
  f2 := erp.siguiente_folio(a, 'REP');
  if not (f1 = 'REP-0001' and f2 = 'REP-0002') then
    raise exception '(j) folios de A no secuenciales: %, %', f1, f2;
  end if;
  perform set_config('app.cliente_id', b::text, true);
  fb := erp.siguiente_folio(b, 'REP');
  if fb <> 'REP-0001' then raise exception '(j) el contador de B no es propio: %', fb; end if;
  perform set_config('app.cliente_id', a::text, true);
end $$;
\echo 'OK (j) folios: REP-0001, REP-0002 en A; B empieza en REP-0001'

-- ── (d) aislamiento por tenant: B no ve ni toca lo de A ────────────
do $$
declare
  a uuid := current_setting('pruebas.tenant_a')::uuid;
  b uuid := current_setting('pruebas.tenant_b')::uuid;
  n int; rechazos int := 0;
begin
  perform set_config('app.cliente_id', b::text, true);
  select count(*) into n from erp.cob_cliente;
  if n <> 0 then raise exception '(d) B ve % clientes de A', n; end if;
  update erp.cob_cliente set nombre = 'secuestrado' where cliente_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '(d) B modificó % filas de A', n; end if;
  begin
    insert into erp.cob_cliente (cliente_id, nombre) values (a, 'intruso');
    raise exception '(d) B PUDO escribir en el tenant de A';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  insert into erp.cob_cliente (cliente_id, nombre) values (b, 'Cliente de B');

  perform set_config('app.cliente_id', a::text, true);
  select count(*) into n from erp.cob_cliente where cliente_id = b;
  if n <> 0 then raise exception '(d) A ve % clientes de B', n; end if;
  if rechazos <> 1 then raise exception '(d) rechazos: % de 1', rechazos; end if;
end $$;
\echo 'OK (d) aislamiento: B no ve, no modifica ni escribe filas de A; A no ve las de B'

-- ── (g) cerrado por defecto: sin tenant en sesión no hay filas ─────
do $$
declare n int; rechazos int := 0;
begin
  perform set_config('app.cliente_id', '', true);
  select count(*) into n from erp.cob_cliente;
  if n <> 0 then raise exception '(g) sin tenant se ven % filas', n; end if;
  begin
    insert into erp.cob_cliente (cliente_id, nombre) values (gen_random_uuid(), 'sin tenant');
    raise exception '(g) se PUDO escribir sin tenant en sesión';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  if rechazos <> 1 then raise exception '(g) rechazos: % de 1', rechazos; end if;
end $$;
\echo 'OK (g) sin app.cliente_id: cero filas y ninguna escritura'

-- ── (c) el lector no escribe (rol_swm) ─────────────────────────────
reset role;
set local role rol_swm;
select set_config('app.cliente_id', :'tenant', true) \g /dev/null
do $$
declare n int; rechazos int := 0;
begin
  select count(*) into n from erp.cob_cliente;
  if n < 1 then raise exception '(c) el lector no ve las filas de su tenant'; end if;
  begin
    insert into erp.cob_cliente (cliente_id, nombre)
         values (current_setting('app.cliente_id')::uuid, 'lector');
    raise exception '(c) rol_swm PUDO insertar';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  begin
    update erp.cob_cliente set nombre = nombre;
    raise exception '(c) rol_swm PUDO actualizar';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  begin
    delete from erp.cob_cliente;
    raise exception '(c) rol_swm PUDO borrar';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  begin
    perform erp.siguiente_folio(current_setting('app.cliente_id')::uuid, 'PED');
    raise exception '(c) rol_swm PUDO asignar un folio';
  exception when insufficient_privilege then rechazos := rechazos + 1; end;
  if rechazos <> 4 then raise exception '(c) rechazos: % de 4', rechazos; end if;
end $$;
\echo 'OK (c) rol_swm lee su tenant y no puede insertar, actualizar, borrar ni asignar folios'

rollback;
\echo 'TODAS EN VERDE: (a) (b) (c) (d) (e) (f) (g) (h) (i) (j) — transacción deshecha, cero filas escritas'
