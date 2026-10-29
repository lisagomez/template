-- =============================================================================
-- Ágora · 006 · el paquete para Contabilidad: catálogo de cuentas mapeado a código agrupador SAT, plantillas
-- de asiento (CONFIGURACIÓN de la organización que revisa el contador, no código) y la póliza PROPUESTA con
-- el contrato de ERP-5B (`erp/ERP-MAESTRO.md` §5B.3: ctb_poliza + ctb_movimiento). Idempotente.
--
-- La partida doble es ESTRUCTURAL (D-17): una póliza descuadrada no puede existir. La proponga quien la
-- proponga, al terminar la transacción la base cuenta cargos y abonos y, si no cuadran, no hay póliza.
-- Ágora PROPONE; un humano de Contabilidad la acepta o la devuelve con motivo, y la asienta en su sistema.
-- Ágora no asienta, no cierra la contabilidad y no presenta nada ante el SAT.
-- =============================================================================
set check_function_bodies = off;

-- El catálogo de la organización. El código agrupador va SIEMPRE (Anexo 24 de la RMF); la versión del anexo
-- con que se mapeó también, porque cambia y hay que verificarla antes de producción.
create table if not exists agora.cuenta (
  org_id            uuid not null references agora.org (id) on delete cascade,
  codigo            text not null check (codigo ~ '^[0-9]{3}(-[0-9]{3}){0,3}$'),
  nombre            text not null,
  naturaleza        text not null check (naturaleza in ('deudora', 'acreedora')),
  codigo_agrupador  text not null check (codigo_agrupador ~ '^[1-8][0-9]{2}(\.[0-9]{2})?$'),
  anexo             text not null,
  primary key (org_id, codigo)
);

-- La plantilla de asiento: qué cuenta se carga y cuál se abona para cada origen del costo. `categoria_slug`
-- nulo = la de toda la organización para ese origen.
create table if not exists agora.plantilla_asiento (
  org_id         uuid not null references agora.org (id) on delete cascade,
  origen         text not null check (origen in ('cfdi', 'comprobante', 'gasto_modelo')),
  categoria_slug text,
  cuenta_cargo   text not null,
  cuenta_abono   text not null,
  revisada_por   text not null,
  foreign key (org_id, cuenta_cargo) references agora.cuenta (org_id, codigo),
  foreign key (org_id, cuenta_abono) references agora.cuenta (org_id, codigo)
);
create unique index if not exists ux_plantilla on agora.plantilla_asiento (org_id, origen, coalesce(categoria_slug, '*'));

create table if not exists agora.poliza (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references agora.org (id) on delete cascade,
  periodo     text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tipo        text not null check (tipo in ('ingreso', 'egreso', 'diario')),
  folio       text not null,
  concepto    text not null,
  origen      text not null default 'automatica' check (origen in ('automatica', 'manual')),
  estado      text not null default 'propuesta' check (estado in ('propuesta', 'aceptada', 'devuelta')),
  sha256      text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  sin_costear int not null default 0 check (sin_costear >= 0),
  generada_en timestamptz not null default now(),
  unique (org_id, folio)
);

create table if not exists agora.poliza_movimiento (
  id               bigserial primary key,
  poliza_id        uuid not null references agora.poliza (id) on delete cascade,
  org_id           uuid not null references agora.org (id) on delete cascade,
  orden            int not null,
  cuenta           text not null,
  codigo_agrupador text not null,
  naturaleza       text not null check (naturaleza in ('cargo', 'abono')),
  importe          numeric(14,2) not null check (importe > 0),
  uuid_cfdi        uuid,
  rfc_tercero      text,
  documento        text not null,
  categoria_id     uuid references agora.nodo (id),
  concepto         text not null,
  foreign key (org_id, cuenta) references agora.cuenta (org_id, codigo),
  unique (poliza_id, orden)
);

/** El movimiento lleva el código agrupador de SU cuenta: no se escribe a mano. */
create or replace function agora_priv.movimiento_coherente() returns trigger language plpgsql set search_path = '' as $$
begin
  select c.codigo_agrupador into new.codigo_agrupador from agora.cuenta c where c.org_id = new.org_id and c.codigo = new.cuenta;
  if new.codigo_agrupador is null then raise exception 'la cuenta % no está en el catálogo con su código agrupador', new.cuenta using errcode = 'AG400'; end if;
  if not exists (select 1 from agora.poliza p where p.id = new.poliza_id and p.org_id = new.org_id and p.estado = 'propuesta') then
    raise exception 'un movimiento va en una póliza propuesta de su organización' using errcode = 'AG409';
  end if;
  return new;
end $$;
drop trigger if exists tg_movimiento_coherente on agora.poliza_movimiento;
create trigger tg_movimiento_coherente before insert on agora.poliza_movimiento for each row execute function agora_priv.movimiento_coherente();
drop trigger if exists tg_movimiento_inmutable on agora.poliza_movimiento;
create trigger tg_movimiento_inmutable before update or delete on agora.poliza_movimiento for each row
  when (not agora_priv.confiable() or pg_trigger_depth() = 0) execute function agora_priv.solo_agregar();

/** D-17: al terminar la transacción, cada póliza tocada cuadra (cargos = abonos) y tiene al menos dos movimientos. */
create or replace function agora_priv.partida_doble() returns trigger language plpgsql set search_path = '' as $$
declare
  pid uuid;
  cargos numeric;
  abonos numeric;
  n int;
begin
  if tg_table_name = 'poliza' then pid := new.id;
  elsif tg_op = 'DELETE' then pid := old.poliza_id;
  else pid := new.poliza_id;
  end if;
  if not exists (select 1 from agora.poliza where id = pid) then return null; end if;
  select coalesce(sum(importe) filter (where naturaleza = 'cargo'), 0), coalesce(sum(importe) filter (where naturaleza = 'abono'), 0), count(*)
    into cargos, abonos, n from agora.poliza_movimiento where poliza_id = pid;
  if n < 2 then raise exception 'una póliza lleva al menos un cargo y un abono' using errcode = 'AG422'; end if;
  if cargos <> abonos then
    raise exception 'póliza descuadrada: cargos % ≠ abonos %', cargos, abonos using errcode = 'AG422';
  end if;
  return null;
end $$;
drop trigger if exists tg_partida_doble_mov on agora.poliza_movimiento;
create constraint trigger tg_partida_doble_mov after insert or update or delete on agora.poliza_movimiento
  deferrable initially deferred for each row execute function agora_priv.partida_doble();
drop trigger if exists tg_partida_doble_pol on agora.poliza;
create constraint trigger tg_partida_doble_pol after insert on agora.poliza
  deferrable initially deferred for each row execute function agora_priv.partida_doble();

-- Lo de una póliza solo cambia su estado, y solo por la decisión de Contabilidad (abajo).
create or replace function agora_priv.poliza_inmutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'una póliza no se borra' using errcode = 'AG403'; end if;
  if (new.org_id, new.periodo, new.tipo, new.folio, new.concepto, new.sin_costear) is distinct from (old.org_id, old.periodo, old.tipo, old.folio, old.concepto, old.sin_costear)
     or (old.sha256 is not null and new.sha256 is distinct from old.sha256) then
    raise exception 'una póliza no se edita: se devuelve y se propone otra' using errcode = 'AG403';
  end if;
  if not agora_priv.confiable() then raise exception 'el estado de una póliza lo decide Contabilidad' using errcode = 'AG403'; end if;
  return new;
end $$;
drop trigger if exists tg_poliza_inmutable on agora.poliza;
create trigger tg_poliza_inmutable before update or delete on agora.poliza for each row execute function agora_priv.poliza_inmutable();

-- --- El export en el contrato de ERP-5B ----------------------------------------------------------------------
create or replace function agora.exporta_poliza(pid uuid) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'contrato', 'ERP-5B.3',
    'poliza', jsonb_build_object('folio', p.folio, 'tipo', p.tipo, 'periodo', p.periodo, 'origen', p.origen, 'concepto', p.concepto,
                                 'documentos', coalesce((select jsonb_agg(distinct m.uuid_cfdi) from agora.poliza_movimiento m where m.poliza_id = p.id and m.uuid_cfdi is not null), '[]'::jsonb)),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('orden', m.orden, 'cuenta', m.cuenta, 'codigo_agrupador', m.codigo_agrupador, 'naturaleza', m.naturaleza,
                                                                 'importe', m.importe, 'uuid_cfdi', m.uuid_cfdi, 'rfc', m.rfc_tercero, 'documento', m.documento, 'concepto', m.concepto)
                                       order by m.orden) from agora.poliza_movimiento m where m.poliza_id = p.id), '[]'::jsonb),
    'cuadre', (select jsonb_build_object('cargos', coalesce(sum(m.importe) filter (where m.naturaleza = 'cargo'), 0), 'abonos', coalesce(sum(m.importe) filter (where m.naturaleza = 'abono'), 0))
                 from agora.poliza_movimiento m where m.poliza_id = p.id),
    'sin_costear', p.sin_costear,
    'anexo', (select min(c.anexo) from agora.cuenta c where c.org_id = p.org_id))
  from agora.poliza p where p.id = pid
$$;

/** La huella que firma Contabilidad: sha256 del texto del export tal como lo emite la base. */
create or replace function agora.huella_poliza(pid uuid) returns text language sql stable security invoker set search_path = '' as $$
  select encode(sha256(convert_to(agora.exporta_poliza(pid)::text, 'UTF8')), 'hex')
$$;

-- --- La decisión de Contabilidad ------------------------------------------------------------------------------
create table if not exists agora.poliza_decision (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references agora.org (id) on delete cascade,
  poliza_id    uuid not null references agora.poliza (id),
  decision     text not null check (decision in ('acepta', 'devuelve')),
  motivo       text,
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  decidida_por uuid not null,
  decidida_en  timestamptz not null default now(),
  -- La pone la base, no quien decide: aceptada con la segregación QUITADA. Solo de agregar, como la decisión.
  sin_segregacion boolean not null default false,
  unique (poliza_id, decidida_por),
  constraint motivo_al_devolver check (decision = 'acepta' or length(coalesce(motivo, '')) >= 5)
);
alter table agora.poliza_decision add column if not exists sin_segregacion boolean not null default false;

/**
 * Solo una persona con rol de Contabilidad decide, sobre la huella exacta de la póliza y mientras está propuesta.
 * Segregación de funciones: quien aprobó un gasto del periodo, o cerró el periodo, no acepta su póliza.
 */
create or replace function agora_priv.decision_poliza_valida() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p agora.poliza;
  seg boolean;
begin
  select * into p from agora.poliza where id = new.poliza_id for update;
  if not found or p.org_id <> new.org_id then raise exception 'la decisión no es de la organización de su póliza' using errcode = 'AG404'; end if;
  if p.estado <> 'propuesta' then raise exception 'la póliza ya se decidió (%)', p.estado using errcode = 'AG409'; end if;
  if new.sha256 <> agora.huella_poliza(p.id) then raise exception 'la huella no es la de la póliza propuesta' using errcode = 'AG409'; end if;
  if not ('contabilidad' = any (agora_priv.roles_de(new.decidida_por, p.org_id, null))) then
    raise exception 'solo Contabilidad acepta o devuelve una póliza' using errcode = 'AG403';
  end if;
  select c.segregacion into seg from agora.org_config c where c.org_id = p.org_id;
  if coalesce(seg, true) and (
       exists (select 1 from agora.compromiso k join agora.aprobacion a on a.propuesta_id = k.propuesta_id and a.decision = 'aprobar'
                where k.org_id = p.org_id and k.periodo = p.periodo and a.decidida_por = new.decidida_por)
    or exists (select 1 from agora.presupuesto x where x.org_id = p.org_id and x.periodo = p.periodo and x.aprobado_por = new.decidida_por)
    or exists (select 1 from agora.periodo x where x.org_id = p.org_id and x.periodo = p.periodo and x.cerrado_por = new.decidida_por)) then
    raise exception 'segregación de funciones: quien aprobó un gasto del periodo o lo cerró no acepta su póliza' using errcode = 'AG403';
  end if;
  new.sin_segregacion := new.decision = 'acepta' and not coalesce(seg, true);
  new.decidida_en := now();
  return new;
end $$;
drop trigger if exists tg_decision_poliza_valida on agora.poliza_decision;
create trigger tg_decision_poliza_valida before insert on agora.poliza_decision for each row execute function agora_priv.decision_poliza_valida();
drop trigger if exists tg_decision_poliza_solo_agregar on agora.poliza_decision;
create trigger tg_decision_poliza_solo_agregar before update or delete on agora.poliza_decision for each row
  when (not agora_priv.confiable()) execute function agora_priv.solo_agregar();

create or replace function agora_priv.decision_poliza_efecto() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update agora.poliza set estado = case when new.decision = 'acepta' then 'aceptada' else 'devuelta' end where id = new.poliza_id;
  return null;
end $$;
drop trigger if exists tg_decision_poliza_efecto on agora.poliza_decision;
create trigger tg_decision_poliza_efecto after insert on agora.poliza_decision for each row execute function agora_priv.decision_poliza_efecto();

-- La balanza de costos del periodo: por cuenta, cargos y abonos de las pólizas propuestas o aceptadas.
create or replace view agora.v_balanza_costos with (security_invoker = true) as
  select p.org_id, p.periodo, m.cuenta, c.nombre, c.codigo_agrupador, c.naturaleza,
         sum(m.importe) filter (where m.naturaleza = 'cargo')::numeric(14,2) as cargos,
         sum(m.importe) filter (where m.naturaleza = 'abono')::numeric(14,2) as abonos,
         (coalesce(sum(m.importe) filter (where m.naturaleza = 'cargo'), 0) - coalesce(sum(m.importe) filter (where m.naturaleza = 'abono'), 0))::numeric(14,2) as saldo_deudor
    from agora.poliza p join agora.poliza_movimiento m on m.poliza_id = p.id
    join agora.cuenta c on c.org_id = m.org_id and c.codigo = m.cuenta
   where p.estado <> 'devuelta'
   group by p.org_id, p.periodo, m.cuenta, c.nombre, c.codigo_agrupador, c.naturaleza;
