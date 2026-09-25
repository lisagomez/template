CREATE SCHEMA erp;
CREATE FUNCTION erp.act_actualiza_costo() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update erp.act_activo
     set costo_acumulado = (
           select coalesce(sum(monto), 0)
             from erp.act_costo
            where activo_id = new.activo_id),
         updated_at = now()
   where id = new.activo_id;
  return new;
end;
$$;
CREATE FUNCTION erp.cfd_timbre_transicion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    return new;
  end if;
  if old.estado = new.estado then
    return new;
  end if;
  if not (
       (old.estado = 'borrador'              and new.estado in ('enviado_sin_respuesta','timbrado','cancelado'))
    or (old.estado = 'enviado_sin_respuesta' and new.estado in ('timbrado','cancelado'))
    or (old.estado = 'timbrado'              and new.estado = 'cancelado')
  ) then
    raise exception 'transición de timbre inválida: % → %', old.estado, new.estado
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
CREATE FUNCTION erp.fac_verificar_cuadre() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_subtotal   numeric(14,2);
  v_traslados  numeric(14,2);
  v_retenidos  numeric(14,2);
  v_conceptos  int;
begin
  -- solo exigimos cuadre al EMITIR (borrador puede estar incompleto)
  if new.estado <> 'emitida' then
    return new;
  end if;
  select coalesce(sum(c.importe),0), count(*)
    into v_subtotal, v_conceptos
    from erp.fac_concepto c
   where c.fac_factura_id = new.id;
  if v_conceptos = 0 then
    raise exception 'fac_factura % no puede emitirse sin conceptos', new.folio
      using errcode = 'check_violation';
  end if;
  select
    coalesce(sum(i.importe) filter (where i.naturaleza = 'traslado'), 0),
    coalesce(sum(i.importe) filter (where i.naturaleza = 'retencion'), 0)
    into v_traslados, v_retenidos
    from erp.fac_impuesto i
    join erp.fac_concepto c on c.id = i.fac_concepto_id
   where c.fac_factura_id = new.id;
  if new.subtotal <> v_subtotal
     or new.impuestos_trasladados <> v_traslados
     or new.impuestos_retenidos  <> v_retenidos then
    raise exception
      'descuadre cabecera↔detalle en %: subtotal % vs %, traslados % vs %, retenciones % vs %',
      new.folio, new.subtotal, v_subtotal, new.impuestos_trasladados, v_traslados,
      new.impuestos_retenidos, v_retenidos
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
CREATE FUNCTION erp.siguiente_folio(p_cliente_id uuid, p_prefijo text) RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  v_num bigint;
begin
  if p_prefijo not in
       ('PED','FAC','CFD','COB','REP','ACT','HAL','POL','DOC','PRO','CAS','DIF','NOM','COT','PRM') then
    raise exception 'prefijo de folio inválido: %', p_prefijo using errcode = 'check_violation';
  end if;
  insert into erp.sis_folio (cliente_id, prefijo, ultimo)
       values (p_cliente_id, p_prefijo, 1)
  on conflict (cliente_id, prefijo)
       do update set ultimo = erp.sis_folio.ultimo + 1
    returning ultimo into v_num;
  return p_prefijo || '-' || lpad(v_num::text, 4, '0');
end;
$$;
COMMENT ON FUNCTION erp.siguiente_folio(p_cliente_id uuid, p_prefijo text) IS 'Asigna el siguiente folio humano de forma atómica y secuencial (segura ante concurrencia).';
CREATE TABLE erp.act_activo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    folio text NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    descripcion text,
    ubicacion text NOT NULL,
    hash_vigente text,
    version_vigente text,
    responsable text DEFAULT 'dep-fin'::text NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL,
    eje_dei text NOT NULL,
    defensibilidad text DEFAULT 'reemplazable'::text NOT NULL,
    defensibilidad_estado text DEFAULT 'propuesta'::text NOT NULL,
    ratificado_por text,
    ratificado_at timestamp with time zone,
    ref_catalogo text,
    origen_task_id text,
    origen_encargo_id uuid,
    costo_acumulado numeric(14,2) DEFAULT 0 NOT NULL,
    estatus_contable text DEFAULT 'pendiente'::text NOT NULL,
    fecha_alta_contable date,
    vida_util_meses integer,
    metodo_amortizacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT act_activo_amortizacion_check CHECK (((estatus_contable <> 'capitalizado'::text) OR ((vida_util_meses IS NOT NULL) AND (metodo_amortizacion IS NOT NULL)))),
    CONSTRAINT act_activo_contable_check CHECK (((estatus_contable = 'pendiente'::text) OR (fecha_alta_contable IS NOT NULL))),
    CONSTRAINT act_activo_costo_acumulado_check CHECK ((costo_acumulado >= (0)::numeric)),
    CONSTRAINT act_activo_defensibilidad_check CHECK ((defensibilidad = ANY (ARRAY['defendible'::text, 'reemplazable'::text]))),
    CONSTRAINT act_activo_defensibilidad_estado_check CHECK ((defensibilidad_estado = ANY (ARRAY['propuesta'::text, 'ratificada'::text]))),
    CONSTRAINT act_activo_eje_dei_check CHECK ((eje_dei = ANY (ARRAY['investigacion'::text, 'desarrollo'::text]))),
    CONSTRAINT act_activo_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'baja'::text]))),
    CONSTRAINT act_activo_estatus_contable_check CHECK ((estatus_contable = ANY (ARRAY['pendiente'::text, 'capitalizado'::text, 'gasto'::text]))),
    CONSTRAINT act_activo_ratificacion_check CHECK (((defensibilidad_estado = 'propuesta'::text) OR ((ratificado_por IS NOT NULL) AND (ratificado_at IS NOT NULL)))),
    CONSTRAINT act_activo_tipo_check CHECK ((tipo = ANY (ARRAY['software'::text, 'config_agentica'::text, 'datos'::text, 'documento'::text, 'infraestructura'::text, 'licencia_suscripcion'::text]))),
    CONSTRAINT act_activo_vida_util_meses_check CHECK ((vida_util_meses > 0))
);
ALTER TABLE ONLY erp.act_activo FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.act_activo IS 'Catálogo de activos digitales (ERP-4B). Clasificación en dos ejes (§1.7); defensibilidad ratificada solo por humano (D-10); alta contable solo con política auditada (D-07).';
CREATE TABLE erp.act_costo (
    id bigint NOT NULL,
    cliente_id uuid NOT NULL,
    activo_id uuid NOT NULL,
    componente text NOT NULL,
    monto numeric(14,2) NOT NULL,
    moneda text DEFAULT 'USD'::text NOT NULL,
    eje_dei text NOT NULL,
    origen_task_id text,
    origen_encargo_id uuid,
    tokens_in bigint,
    tokens_out bigint,
    fuente text NOT NULL,
    periodo date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT act_costo_componente_check CHECK ((componente = ANY (ARRAY['tokens'::text, 'horas_humanas'::text, 'infraestructura'::text]))),
    CONSTRAINT act_costo_eje_dei_check CHECK ((eje_dei = ANY (ARRAY['investigacion'::text, 'desarrollo'::text]))),
    CONSTRAINT act_costo_moneda_check CHECK ((moneda = 'USD'::text)),
    CONSTRAINT act_costo_monto_check CHECK ((monto >= (0)::numeric)),
    CONSTRAINT act_costo_tokens_in_check CHECK ((tokens_in >= 0)),
    CONSTRAINT act_costo_tokens_out_check CHECK ((tokens_out >= 0))
);
ALTER TABLE ONLY erp.act_costo FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.act_costo IS 'Ledger append-only de costo por activo: tokens (token_usage.task_id), horas humanas declaradas, infra prorrateada. fuente obligatoria; eje_dei heredado del origen.';
ALTER TABLE erp.act_costo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME erp.act_costo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE erp.act_proteccion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    activo_id uuid NOT NULL,
    mecanismo text NOT NULL,
    estatus text DEFAULT 'iniciado'::text NOT NULL,
    folio_registro text,
    vencimiento date,
    medidas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT act_proteccion_estatus_check CHECK ((estatus = ANY (ARRAY['iniciado'::text, 'vigente'::text, 'vencido'::text, 'descartado'::text]))),
    CONSTRAINT act_proteccion_mecanismo_check CHECK ((mecanismo = ANY (ARRAY['secreto_industrial'::text, 'derecho_autor'::text, 'marca'::text, 'contrato_cesion'::text])))
);
ALTER TABLE ONLY erp.act_proteccion FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.act_proteccion IS 'Expediente de protección por activo defendible: mecanismo, estatus, folio, vencimiento y medidas demostrables (ERP-4B paso 6).';
CREATE TABLE erp.act_version (
    id bigint NOT NULL,
    cliente_id uuid NOT NULL,
    activo_id uuid NOT NULL,
    version text NOT NULL,
    hash text,
    origen text NOT NULL,
    origen_task_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY erp.act_version FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.act_version IS 'Historial append-only de versiones por activo: hash, fecha y origen (ERP-4B paso 1).';
ALTER TABLE erp.act_version ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME erp.act_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE erp.cfd_folio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    serie text NOT NULL,
    folio_num bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cfd_folio_folio_num_check CHECK ((folio_num > 0))
);
ALTER TABLE ONLY erp.cfd_folio FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cfd_folio IS 'Numeración fiscal (serie + consecutivo) del CFDI, distinta del folio humano.';
CREATE TABLE erp.cfd_timbre (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    tipo text NOT NULL,
    documento_tipo text NOT NULL,
    documento_id uuid NOT NULL,
    cfd_folio_id uuid,
    estado text DEFAULT 'borrador'::text NOT NULL,
    uuid_fiscal uuid,
    sello_cfd text,
    sello_sat text,
    fecha_timbrado timestamp with time zone,
    motivo_cancelacion text,
    llave_idempotencia text,
    xml text,
    pac_respuesta jsonb,
    es_simulado boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cfd_timbre_documento_tipo_check CHECK ((documento_tipo = ANY (ARRAY['factura'::text, 'cobro'::text]))),
    CONSTRAINT cfd_timbre_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'enviado_sin_respuesta'::text, 'timbrado'::text, 'cancelado'::text]))),
    CONSTRAINT cfd_timbre_tipo_check CHECK ((tipo = ANY (ARRAY['ingreso'::text, 'pago'::text, 'nota_credito'::text])))
);
ALTER TABLE ONLY erp.cfd_timbre FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cfd_timbre IS 'Acto de timbrado CFDI. estado admite el INTERMEDIO (timeout PAC); tipo ingreso/pago[REP]/nota_credito. Idempotente por llave.';
CREATE TABLE erp.cob_cliente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre text NOT NULL,
    rfc text,
    regimen_fiscal text,
    uso_cfdi text,
    limite_credito numeric(14,2) DEFAULT 0 NOT NULL,
    bloqueado boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cob_cliente_limite_credito_check CHECK ((limite_credito >= (0)::numeric))
);
ALTER TABLE ONLY erp.cob_cliente FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cob_cliente IS 'Cliente comercial del tenant (deudor). cliente_id es el TENANT; este es su cliente final.';
CREATE TABLE erp.cob_cobro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    folio text NOT NULL,
    cob_cliente_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    monto numeric(14,2) NOT NULL,
    forma_pago text NOT NULL,
    moneda text DEFAULT 'MXN'::text NOT NULL,
    estado text DEFAULT 'registrado'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cob_cobro_estado_check CHECK ((estado = ANY (ARRAY['registrado'::text, 'aplicado'::text, 'cancelado'::text]))),
    CONSTRAINT cob_cobro_monto_check CHECK ((monto > (0)::numeric))
);
ALTER TABLE ONLY erp.cob_cobro FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cob_cobro IS 'Cobro como entidad propia (el REP se timbra sobre cobros). Qué abona: cob_cobro_aplicacion.';
CREATE TABLE erp.cob_cobro_aplicacion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    cob_cobro_id uuid NOT NULL,
    fac_factura_id uuid NOT NULL,
    importe numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cob_cobro_aplicacion_importe_check CHECK ((importe > (0)::numeric))
);
ALTER TABLE ONLY erp.cob_cobro_aplicacion FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cob_cobro_aplicacion IS 'Aplicación cobro→factura (importe abonado). Base del cálculo de REP.';
CREATE TABLE erp.cob_saldo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    cob_cliente_id uuid NOT NULL,
    saldo numeric(14,2) DEFAULT 0 NOT NULL,
    actualizado_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY erp.cob_saldo FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.cob_saldo IS 'Saldo corriente por cliente comercial (mantenido por el CLI cob).';
CREATE TABLE erp.fac_concepto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fac_factura_id uuid NOT NULL,
    descripcion text NOT NULL,
    clave_prod_serv text,
    clave_unidad text,
    cantidad numeric(14,4) NOT NULL,
    valor_unitario numeric(14,4) NOT NULL,
    importe numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fac_concepto_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT fac_concepto_importe_calc_chk CHECK ((importe = round((cantidad * valor_unitario), 2))),
    CONSTRAINT fac_concepto_importe_check CHECK ((importe >= (0)::numeric)),
    CONSTRAINT fac_concepto_valor_unitario_check CHECK ((valor_unitario >= (0)::numeric))
);
ALTER TABLE ONLY erp.fac_concepto FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.fac_concepto IS 'Concepto facturable genérico (no asume retail). Detalle de fac_factura.';
CREATE TABLE erp.fac_factura (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    folio text NOT NULL,
    cob_cliente_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    metodo_pago text NOT NULL,
    forma_pago text NOT NULL,
    moneda text DEFAULT 'MXN'::text NOT NULL,
    tipo_cambio numeric(14,6) DEFAULT 1 NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    impuestos_trasladados numeric(14,2) DEFAULT 0 NOT NULL,
    impuestos_retenidos numeric(14,2) DEFAULT 0 NOT NULL,
    total numeric(14,2) DEFAULT 0 NOT NULL,
    estado text DEFAULT 'borrador'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fac_factura_cuadre_check CHECK ((total = ((subtotal + impuestos_trasladados) - impuestos_retenidos))),
    CONSTRAINT fac_factura_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'emitida'::text, 'cancelada'::text]))),
    CONSTRAINT fac_factura_impuestos_retenidos_check CHECK ((impuestos_retenidos >= (0)::numeric)),
    CONSTRAINT fac_factura_impuestos_trasladados_check CHECK ((impuestos_trasladados >= (0)::numeric)),
    CONSTRAINT fac_factura_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['PUE'::text, 'PPD'::text]))),
    CONSTRAINT fac_factura_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT fac_factura_tipo_cambio_check CHECK ((tipo_cambio > (0)::numeric)),
    CONSTRAINT fac_factura_total_check CHECK ((total >= (0)::numeric))
);
ALTER TABLE ONLY erp.fac_factura FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.fac_factura IS 'Cabecera de factura. metodo_pago PUE/PPD (D-01). Cuadre de cabecera por CHECK; cuadre con detalle por trigger.';
CREATE TABLE erp.fac_impuesto (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fac_concepto_id uuid NOT NULL,
    tipo text NOT NULL,
    naturaleza text NOT NULL,
    tasa numeric(9,6) NOT NULL,
    base numeric(14,2) NOT NULL,
    importe numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fac_impuesto_base_check CHECK ((base >= (0)::numeric)),
    CONSTRAINT fac_impuesto_importe_calc_chk CHECK ((importe = round((base * tasa), 2))),
    CONSTRAINT fac_impuesto_importe_check CHECK ((importe >= (0)::numeric)),
    CONSTRAINT fac_impuesto_naturaleza_check CHECK ((naturaleza = ANY (ARRAY['traslado'::text, 'retencion'::text]))),
    CONSTRAINT fac_impuesto_tasa_check CHECK ((tasa >= (0)::numeric)),
    CONSTRAINT fac_impuesto_tipo_check CHECK ((tipo = ANY (ARRAY['IVA'::text, 'ISR'::text, 'IEPS'::text])))
);
ALTER TABLE ONLY erp.fac_impuesto FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.fac_impuesto IS 'Impuesto por concepto (CFDI 4.0): tipo/naturaleza/tasa/base/importe. Detalle de fac_concepto.';
CREATE TABLE erp.inv_articulo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    sku text NOT NULL,
    nombre text NOT NULL,
    clave_prod_serv text,
    clave_unidad text,
    existencia numeric(14,4) DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY erp.inv_articulo FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.inv_articulo IS 'Artículo de inventario (retail). Puede facturarse vía fac_concepto genérico.';
CREATE TABLE erp.inv_precio (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    inv_articulo_id uuid NOT NULL,
    precio numeric(14,4) NOT NULL,
    moneda text DEFAULT 'MXN'::text NOT NULL,
    vigencia_desde date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inv_precio_precio_check CHECK ((precio >= (0)::numeric))
);
ALTER TABLE ONLY erp.inv_precio FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.inv_precio IS 'Precio por artículo con vigencia. El efectivo es el más reciente <= fecha.';
CREATE TABLE erp.ped_partida (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ped_pedido_id uuid NOT NULL,
    inv_articulo_id uuid NOT NULL,
    cantidad numeric(14,4) NOT NULL,
    precio_unitario numeric(14,4) NOT NULL,
    importe numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ped_partida_cantidad_check CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT ped_partida_importe_calc_chk CHECK ((importe = round((cantidad * precio_unitario), 2))),
    CONSTRAINT ped_partida_importe_check CHECK ((importe >= (0)::numeric)),
    CONSTRAINT ped_partida_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric))
);
ALTER TABLE ONLY erp.ped_partida FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.ped_partida IS 'Renglón de pedido: enlace retail artículo→línea (el núcleo permanece genérico).';
CREATE TABLE erp.ped_pedido (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    folio text NOT NULL,
    cob_cliente_id uuid NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    estado text DEFAULT 'borrador'::text NOT NULL,
    subtotal numeric(14,2) DEFAULT 0 NOT NULL,
    total numeric(14,2) DEFAULT 0 NOT NULL,
    fac_factura_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ped_pedido_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'confirmado'::text, 'facturado'::text, 'cancelado'::text]))),
    CONSTRAINT ped_pedido_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT ped_pedido_total_check CHECK ((total >= (0)::numeric))
);
ALTER TABLE ONLY erp.ped_pedido FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.ped_pedido IS 'Pedido (retail): paso previo a fac_factura. Al facturar apunta a la factura del núcleo.';
CREATE TABLE erp.sis_agente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    agente text NOT NULL,
    departamento text NOT NULL,
    proposito text NOT NULL,
    clis_permitidos jsonb DEFAULT '[]'::jsonb NOT NULL,
    verbos_permitidos jsonb DEFAULT '{}'::jsonb NOT NULL,
    rol_postgres text,
    modelo text,
    agents_md_hash text,
    aprobadores jsonb DEFAULT '[]'::jsonb NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sis_agente_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'suspendido'::text, 'baja'::text]))),
    CONSTRAINT sis_agente_version_check CHECK ((version > 0))
);
ALTER TABLE ONLY erp.sis_agente FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.sis_agente IS 'Tarjeta de agente (agent card A2A): lo que cada agente DEBE poder hacer. La auditoría la compara contra la realidad.';
CREATE TABLE erp.sis_agente_version (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    sis_agente_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    agents_md_hash text,
    motivo text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sis_agente_version_version_check CHECK ((version > 0))
);
ALTER TABLE ONLY erp.sis_agente_version FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.sis_agente_version IS 'Historial de versiones de la tarjeta de agente. Cambiar una tarjeta exige aprobación humana (D-14).';
CREATE TABLE erp.sis_bitacora (
    id bigint NOT NULL,
    cliente_id uuid NOT NULL,
    traza_id uuid NOT NULL,
    actor text NOT NULL,
    actor_tipo text NOT NULL,
    modulo text NOT NULL,
    verbo text NOT NULL,
    entidad_tipo text,
    entidad_id text,
    payload jsonb,
    resultado text NOT NULL,
    aprobado_por text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sis_bitacora_actor_tipo_check CHECK ((actor_tipo = ANY (ARRAY['agente'::text, 'humano'::text, 'sistema'::text]))),
    CONSTRAINT sis_bitacora_resultado_check CHECK ((resultado = ANY (ARRAY['ok'::text, 'rechazo'::text, 'error'::text])))
);
ALTER TABLE ONLY erp.sis_bitacora FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.sis_bitacora IS 'Bitácora de auditoría append-only: cada verbo, cada actor, cada escritura, su aprobador y su traza_id (obligatorio).';
ALTER TABLE erp.sis_bitacora ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME erp.sis_bitacora_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE erp.sis_encargo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    encargo text NOT NULL,
    estado text DEFAULT 'recibido'::text NOT NULL,
    eje_dei text DEFAULT 'operacion'::text NOT NULL,
    traza_id uuid DEFAULT gen_random_uuid() NOT NULL,
    paso_actual text,
    agente_asignado text,
    slack_hilo_ref text,
    dry_run_hash text,
    aprobacion_vence_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sis_encargo_eje_dei_check CHECK ((eje_dei = ANY (ARRAY['investigacion'::text, 'desarrollo'::text, 'operacion'::text]))),
    CONSTRAINT sis_encargo_estado_check CHECK ((estado = ANY (ARRAY['recibido'::text, 'en_proceso'::text, 'espera_aprobacion'::text, 'completado'::text, 'fallido'::text, 'cancelado'::text])))
);
ALTER TABLE ONLY erp.sis_encargo FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.sis_encargo IS 'Cola persistente del orquestador. El estado del encargo vive en BD, no en el contenedor (retoma tras reinicio). Origen del eje D+I y del traza_id.';
CREATE TABLE erp.sis_folio (
    cliente_id uuid NOT NULL,
    prefijo text NOT NULL,
    ultimo bigint DEFAULT 0 NOT NULL,
    CONSTRAINT sis_folio_prefijo_check CHECK ((prefijo = ANY (ARRAY['PED'::text, 'FAC'::text, 'CFD'::text, 'COB'::text, 'REP'::text, 'ACT'::text, 'HAL'::text, 'POL'::text, 'DOC'::text, 'PRO'::text, 'CAS'::text, 'DIF'::text, 'NOM'::text, 'COT'::text, 'PRM'::text]))),
    CONSTRAINT sis_folio_ultimo_check CHECK ((ultimo >= 0))
);
ALTER TABLE ONLY erp.sis_folio FORCE ROW LEVEL SECURITY;
COMMENT ON TABLE erp.sis_folio IS 'Contador de folios humanos por tenant y prefijo. Se incrementa vía erp.siguiente_folio().';
ALTER TABLE ONLY erp.act_activo
    ADD CONSTRAINT act_activo_cliente_id_folio_key UNIQUE (cliente_id, folio);
ALTER TABLE ONLY erp.act_activo
    ADD CONSTRAINT act_activo_cliente_id_ref_catalogo_key UNIQUE (cliente_id, ref_catalogo);
ALTER TABLE ONLY erp.act_activo
    ADD CONSTRAINT act_activo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.act_costo
    ADD CONSTRAINT act_costo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.act_proteccion
    ADD CONSTRAINT act_proteccion_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.act_version
    ADD CONSTRAINT act_version_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cfd_folio
    ADD CONSTRAINT cfd_folio_cliente_id_serie_folio_num_key UNIQUE (cliente_id, serie, folio_num);
ALTER TABLE ONLY erp.cfd_folio
    ADD CONSTRAINT cfd_folio_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cfd_timbre
    ADD CONSTRAINT cfd_timbre_cliente_id_llave_idempotencia_key UNIQUE (cliente_id, llave_idempotencia);
ALTER TABLE ONLY erp.cfd_timbre
    ADD CONSTRAINT cfd_timbre_cliente_id_uuid_fiscal_key UNIQUE (cliente_id, uuid_fiscal);
ALTER TABLE ONLY erp.cfd_timbre
    ADD CONSTRAINT cfd_timbre_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cob_cliente
    ADD CONSTRAINT cob_cliente_cliente_id_rfc_key UNIQUE (cliente_id, rfc);
ALTER TABLE ONLY erp.cob_cliente
    ADD CONSTRAINT cob_cliente_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cob_cobro_aplicacion
    ADD CONSTRAINT cob_cobro_aplicacion_cob_cobro_id_fac_factura_id_key UNIQUE (cob_cobro_id, fac_factura_id);
ALTER TABLE ONLY erp.cob_cobro_aplicacion
    ADD CONSTRAINT cob_cobro_aplicacion_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cob_cobro
    ADD CONSTRAINT cob_cobro_cliente_id_folio_key UNIQUE (cliente_id, folio);
ALTER TABLE ONLY erp.cob_cobro
    ADD CONSTRAINT cob_cobro_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.cob_saldo
    ADD CONSTRAINT cob_saldo_cliente_id_cob_cliente_id_key UNIQUE (cliente_id, cob_cliente_id);
ALTER TABLE ONLY erp.cob_saldo
    ADD CONSTRAINT cob_saldo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.fac_concepto
    ADD CONSTRAINT fac_concepto_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.fac_factura
    ADD CONSTRAINT fac_factura_cliente_id_folio_key UNIQUE (cliente_id, folio);
ALTER TABLE ONLY erp.fac_factura
    ADD CONSTRAINT fac_factura_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.fac_impuesto
    ADD CONSTRAINT fac_impuesto_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.inv_articulo
    ADD CONSTRAINT inv_articulo_cliente_id_sku_key UNIQUE (cliente_id, sku);
ALTER TABLE ONLY erp.inv_articulo
    ADD CONSTRAINT inv_articulo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.inv_precio
    ADD CONSTRAINT inv_precio_cliente_id_inv_articulo_id_vigencia_desde_key UNIQUE (cliente_id, inv_articulo_id, vigencia_desde);
ALTER TABLE ONLY erp.inv_precio
    ADD CONSTRAINT inv_precio_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.ped_partida
    ADD CONSTRAINT ped_partida_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.ped_pedido
    ADD CONSTRAINT ped_pedido_cliente_id_folio_key UNIQUE (cliente_id, folio);
ALTER TABLE ONLY erp.ped_pedido
    ADD CONSTRAINT ped_pedido_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.sis_agente
    ADD CONSTRAINT sis_agente_cliente_id_agente_key UNIQUE (cliente_id, agente);
ALTER TABLE ONLY erp.sis_agente
    ADD CONSTRAINT sis_agente_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.sis_agente_version
    ADD CONSTRAINT sis_agente_version_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.sis_agente_version
    ADD CONSTRAINT sis_agente_version_sis_agente_id_version_key UNIQUE (sis_agente_id, version);
ALTER TABLE ONLY erp.sis_bitacora
    ADD CONSTRAINT sis_bitacora_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.sis_encargo
    ADD CONSTRAINT sis_encargo_pkey PRIMARY KEY (id);
ALTER TABLE ONLY erp.sis_folio
    ADD CONSTRAINT sis_folio_pkey PRIMARY KEY (cliente_id, prefijo);
CREATE INDEX act_activo_cliente_idx ON erp.act_activo USING btree (cliente_id, estado);
CREATE INDEX act_activo_contable_idx ON erp.act_activo USING btree (cliente_id, estatus_contable);
CREATE INDEX act_activo_task_idx ON erp.act_activo USING btree (origen_task_id);
CREATE INDEX act_costo_activo_idx ON erp.act_costo USING btree (activo_id, created_at);
CREATE INDEX act_costo_task_idx ON erp.act_costo USING btree (origen_task_id);
CREATE INDEX act_proteccion_activo_idx ON erp.act_proteccion USING btree (activo_id);
CREATE INDEX act_proteccion_vence_idx ON erp.act_proteccion USING btree (vencimiento) WHERE (vencimiento IS NOT NULL);
CREATE INDEX act_version_activo_idx ON erp.act_version USING btree (activo_id, created_at);
CREATE INDEX cfd_timbre_documento_idx ON erp.cfd_timbre USING btree (documento_tipo, documento_id);
CREATE INDEX cfd_timbre_estado_idx ON erp.cfd_timbre USING btree (cliente_id, estado);
CREATE INDEX cob_cobro_aplic_factura_idx ON erp.cob_cobro_aplicacion USING btree (fac_factura_id);
CREATE INDEX cob_cobro_cliente_idx ON erp.cob_cobro USING btree (cliente_id, fecha);
CREATE INDEX cob_cobro_cob_cliente_idx ON erp.cob_cobro USING btree (cob_cliente_id);
CREATE INDEX fac_concepto_factura_idx ON erp.fac_concepto USING btree (fac_factura_id);
CREATE INDEX fac_factura_cliente_idx ON erp.fac_factura USING btree (cliente_id, fecha);
CREATE INDEX fac_factura_cob_cliente_idx ON erp.fac_factura USING btree (cob_cliente_id);
CREATE INDEX fac_impuesto_concepto_idx ON erp.fac_impuesto USING btree (fac_concepto_id);
CREATE INDEX inv_articulo_cliente_idx ON erp.inv_articulo USING btree (cliente_id);
CREATE INDEX inv_precio_articulo_idx ON erp.inv_precio USING btree (inv_articulo_id, vigencia_desde DESC);
CREATE INDEX ped_partida_articulo_idx ON erp.ped_partida USING btree (inv_articulo_id);
CREATE INDEX ped_partida_pedido_idx ON erp.ped_partida USING btree (ped_pedido_id);
CREATE INDEX ped_pedido_cliente_idx ON erp.ped_pedido USING btree (cliente_id, fecha);
CREATE INDEX ped_pedido_cob_cliente_idx ON erp.ped_pedido USING btree (cob_cliente_id);
CREATE INDEX sis_agente_depto_idx ON erp.sis_agente USING btree (cliente_id, departamento);
CREATE INDEX sis_agente_version_idx ON erp.sis_agente_version USING btree (sis_agente_id, version DESC);
CREATE INDEX sis_bitacora_cliente_idx ON erp.sis_bitacora USING btree (cliente_id, created_at);
CREATE INDEX sis_bitacora_entidad_idx ON erp.sis_bitacora USING btree (entidad_tipo, entidad_id);
CREATE INDEX sis_bitacora_traza_idx ON erp.sis_bitacora USING btree (traza_id);
CREATE INDEX sis_encargo_estado_idx ON erp.sis_encargo USING btree (cliente_id, estado);
CREATE INDEX sis_encargo_traza_idx ON erp.sis_encargo USING btree (traza_id);
CREATE TRIGGER act_costo_acumula AFTER INSERT ON erp.act_costo FOR EACH ROW EXECUTE FUNCTION erp.act_actualiza_costo();
CREATE TRIGGER cfd_timbre_transicion_trg BEFORE INSERT OR UPDATE ON erp.cfd_timbre FOR EACH ROW EXECUTE FUNCTION erp.cfd_timbre_transicion();
CREATE TRIGGER fac_factura_cuadre_trg BEFORE INSERT OR UPDATE ON erp.fac_factura FOR EACH ROW EXECUTE FUNCTION erp.fac_verificar_cuadre();
ALTER TABLE ONLY erp.act_costo
    ADD CONSTRAINT act_costo_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES erp.act_activo(id);
ALTER TABLE ONLY erp.act_proteccion
    ADD CONSTRAINT act_proteccion_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES erp.act_activo(id);
ALTER TABLE ONLY erp.act_version
    ADD CONSTRAINT act_version_activo_id_fkey FOREIGN KEY (activo_id) REFERENCES erp.act_activo(id);
ALTER TABLE ONLY erp.cfd_timbre
    ADD CONSTRAINT cfd_timbre_cfd_folio_id_fkey FOREIGN KEY (cfd_folio_id) REFERENCES erp.cfd_folio(id);
ALTER TABLE ONLY erp.cob_cobro_aplicacion
    ADD CONSTRAINT cob_cobro_aplicacion_cob_cobro_id_fkey FOREIGN KEY (cob_cobro_id) REFERENCES erp.cob_cobro(id) ON DELETE CASCADE;
ALTER TABLE ONLY erp.cob_cobro_aplicacion
    ADD CONSTRAINT cob_cobro_aplicacion_fac_factura_id_fkey FOREIGN KEY (fac_factura_id) REFERENCES erp.fac_factura(id);
ALTER TABLE ONLY erp.cob_cobro
    ADD CONSTRAINT cob_cobro_cob_cliente_id_fkey FOREIGN KEY (cob_cliente_id) REFERENCES erp.cob_cliente(id);
ALTER TABLE ONLY erp.cob_saldo
    ADD CONSTRAINT cob_saldo_cob_cliente_id_fkey FOREIGN KEY (cob_cliente_id) REFERENCES erp.cob_cliente(id);
ALTER TABLE ONLY erp.fac_concepto
    ADD CONSTRAINT fac_concepto_fac_factura_id_fkey FOREIGN KEY (fac_factura_id) REFERENCES erp.fac_factura(id) ON DELETE CASCADE;
ALTER TABLE ONLY erp.fac_factura
    ADD CONSTRAINT fac_factura_cob_cliente_id_fkey FOREIGN KEY (cob_cliente_id) REFERENCES erp.cob_cliente(id);
ALTER TABLE ONLY erp.fac_impuesto
    ADD CONSTRAINT fac_impuesto_fac_concepto_id_fkey FOREIGN KEY (fac_concepto_id) REFERENCES erp.fac_concepto(id) ON DELETE CASCADE;
ALTER TABLE ONLY erp.inv_precio
    ADD CONSTRAINT inv_precio_inv_articulo_id_fkey FOREIGN KEY (inv_articulo_id) REFERENCES erp.inv_articulo(id) ON DELETE CASCADE;
ALTER TABLE ONLY erp.ped_partida
    ADD CONSTRAINT ped_partida_inv_articulo_id_fkey FOREIGN KEY (inv_articulo_id) REFERENCES erp.inv_articulo(id);
ALTER TABLE ONLY erp.ped_partida
    ADD CONSTRAINT ped_partida_ped_pedido_id_fkey FOREIGN KEY (ped_pedido_id) REFERENCES erp.ped_pedido(id) ON DELETE CASCADE;
ALTER TABLE ONLY erp.ped_pedido
    ADD CONSTRAINT ped_pedido_cob_cliente_id_fkey FOREIGN KEY (cob_cliente_id) REFERENCES erp.cob_cliente(id);
ALTER TABLE ONLY erp.ped_pedido
    ADD CONSTRAINT ped_pedido_fac_factura_id_fkey FOREIGN KEY (fac_factura_id) REFERENCES erp.fac_factura(id);
ALTER TABLE ONLY erp.sis_agente_version
    ADD CONSTRAINT sis_agente_version_sis_agente_id_fkey FOREIGN KEY (sis_agente_id) REFERENCES erp.sis_agente(id) ON DELETE CASCADE;
ALTER TABLE erp.act_activo ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.act_costo ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.act_proteccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.act_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cfd_folio ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cfd_timbre ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cob_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cob_cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cob_cobro_aplicacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.cob_saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.fac_concepto ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.fac_factura ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.fac_impuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.inv_articulo ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.inv_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.ped_partida ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.ped_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.sis_agente ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.sis_agente_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.sis_bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.sis_encargo ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp.sis_folio ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislamiento ON erp.act_activo USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.act_costo USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.act_proteccion USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.act_version USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cfd_folio USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cfd_timbre USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cob_cliente USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cob_cobro USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cob_cobro_aplicacion USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.cob_saldo USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.fac_concepto USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.fac_factura USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.fac_impuesto USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.inv_articulo USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.inv_precio USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.ped_partida USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.ped_pedido USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.sis_agente USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.sis_agente_version USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.sis_bitacora USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.sis_encargo USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
CREATE POLICY tenant_aislamiento ON erp.sis_folio USING ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid)) WITH CHECK ((cliente_id = (NULLIF(current_setting('app.cliente_id'::text, true), ''::text))::uuid));
GRANT USAGE ON SCHEMA erp TO rol_exe_fin;
GRANT USAGE ON SCHEMA erp TO rol_swm;
GRANT USAGE ON SCHEMA erp TO rol_admin;
GRANT ALL ON FUNCTION erp.act_actualiza_costo() TO rol_admin;
GRANT ALL ON FUNCTION erp.cfd_timbre_transicion() TO rol_admin;
GRANT ALL ON FUNCTION erp.fac_verificar_cuadre() TO rol_admin;
GRANT ALL ON FUNCTION erp.siguiente_folio(p_cliente_id uuid, p_prefijo text) TO rol_admin;
GRANT ALL ON FUNCTION erp.siguiente_folio(p_cliente_id uuid, p_prefijo text) TO rol_exe_fin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.act_activo TO rol_exe_fin;
GRANT SELECT ON TABLE erp.act_activo TO rol_swm;
GRANT ALL ON TABLE erp.act_activo TO rol_admin;
GRANT SELECT,INSERT ON TABLE erp.act_costo TO rol_exe_fin;
GRANT SELECT ON TABLE erp.act_costo TO rol_swm;
GRANT ALL ON TABLE erp.act_costo TO rol_admin;
GRANT SELECT,USAGE ON SEQUENCE erp.act_costo_id_seq TO rol_exe_fin;
GRANT ALL ON SEQUENCE erp.act_costo_id_seq TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.act_proteccion TO rol_exe_fin;
GRANT SELECT ON TABLE erp.act_proteccion TO rol_swm;
GRANT ALL ON TABLE erp.act_proteccion TO rol_admin;
GRANT SELECT,INSERT ON TABLE erp.act_version TO rol_exe_fin;
GRANT SELECT ON TABLE erp.act_version TO rol_swm;
GRANT ALL ON TABLE erp.act_version TO rol_admin;
GRANT SELECT,USAGE ON SEQUENCE erp.act_version_id_seq TO rol_exe_fin;
GRANT ALL ON SEQUENCE erp.act_version_id_seq TO rol_admin;
GRANT ALL ON TABLE erp.cfd_folio TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cfd_folio TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cfd_folio TO rol_swm;
GRANT ALL ON TABLE erp.cfd_timbre TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cfd_timbre TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cfd_timbre TO rol_swm;
GRANT ALL ON TABLE erp.cob_cliente TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cob_cliente TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cob_cliente TO rol_swm;
GRANT ALL ON TABLE erp.cob_cobro TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cob_cobro TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cob_cobro TO rol_swm;
GRANT ALL ON TABLE erp.cob_cobro_aplicacion TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cob_cobro_aplicacion TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cob_cobro_aplicacion TO rol_swm;
GRANT ALL ON TABLE erp.cob_saldo TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.cob_saldo TO rol_exe_fin;
GRANT SELECT ON TABLE erp.cob_saldo TO rol_swm;
GRANT ALL ON TABLE erp.fac_concepto TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.fac_concepto TO rol_exe_fin;
GRANT SELECT ON TABLE erp.fac_concepto TO rol_swm;
GRANT ALL ON TABLE erp.fac_factura TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.fac_factura TO rol_exe_fin;
GRANT SELECT ON TABLE erp.fac_factura TO rol_swm;
GRANT ALL ON TABLE erp.fac_impuesto TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.fac_impuesto TO rol_exe_fin;
GRANT SELECT ON TABLE erp.fac_impuesto TO rol_swm;
GRANT ALL ON TABLE erp.inv_articulo TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.inv_articulo TO rol_exe_fin;
GRANT SELECT ON TABLE erp.inv_articulo TO rol_swm;
GRANT ALL ON TABLE erp.inv_precio TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.inv_precio TO rol_exe_fin;
GRANT SELECT ON TABLE erp.inv_precio TO rol_swm;
GRANT ALL ON TABLE erp.ped_partida TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.ped_partida TO rol_exe_fin;
GRANT SELECT ON TABLE erp.ped_partida TO rol_swm;
GRANT ALL ON TABLE erp.ped_pedido TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.ped_pedido TO rol_exe_fin;
GRANT SELECT ON TABLE erp.ped_pedido TO rol_swm;
GRANT ALL ON TABLE erp.sis_agente TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.sis_agente TO rol_exe_fin;
GRANT SELECT ON TABLE erp.sis_agente TO rol_swm;
GRANT ALL ON TABLE erp.sis_agente_version TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.sis_agente_version TO rol_exe_fin;
GRANT SELECT ON TABLE erp.sis_agente_version TO rol_swm;
GRANT ALL ON TABLE erp.sis_bitacora TO rol_admin;
GRANT SELECT,INSERT ON TABLE erp.sis_bitacora TO rol_exe_fin;
GRANT SELECT ON TABLE erp.sis_bitacora TO rol_swm;
GRANT ALL ON SEQUENCE erp.sis_bitacora_id_seq TO rol_admin;
GRANT SELECT,USAGE ON SEQUENCE erp.sis_bitacora_id_seq TO rol_exe_fin;
GRANT ALL ON TABLE erp.sis_encargo TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.sis_encargo TO rol_exe_fin;
GRANT SELECT ON TABLE erp.sis_encargo TO rol_swm;
GRANT ALL ON TABLE erp.sis_folio TO rol_admin;
GRANT SELECT,INSERT,UPDATE ON TABLE erp.sis_folio TO rol_exe_fin;
GRANT SELECT ON TABLE erp.sis_folio TO rol_swm;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT SELECT,USAGE ON SEQUENCES TO rol_exe_fin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT ALL ON SEQUENCES TO rol_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT ALL ON FUNCTIONS TO rol_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT SELECT,INSERT,UPDATE ON TABLES TO rol_exe_fin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT SELECT ON TABLES TO rol_swm;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp GRANT ALL ON TABLES TO rol_admin;
