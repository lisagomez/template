-- ═══════════════════════════════════════════════════════════════════
-- ERP · Migración 003 — FOLIOS humanos (con prueba de carrera)
-- ═══════════════════════════════════════════════════════════════════
-- Folios humanos por tenant y prefijo: PED-, FAC-, CFD-, COB-, REP-.
-- La asignación DEBE ser segura ante concurrencia: dos emisiones simultáneas
-- obtienen folios distintos y secuenciales. Lo logramos
-- con un UPDATE ... RETURNING atómico que bloquea la fila del contador.
--
-- Idempotente. STAGING primero.
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- SISTEMA · sis_folio — contador por (tenant, prefijo)
-- ============================================================
create table if not exists erp.sis_folio (
  cliente_id  uuid   not null,
  -- Lista CERRADA de prefijos ("el sistema no inventa"): los de la cadena
  -- (PED FAC CFD COB REP) y los de módulos que pueden instalarse después, que se
  -- incluyen desde ya para no reeditar esta migración.
  prefijo     text   not null check (prefijo in
    ('PED','FAC','CFD','COB','REP','ACT','HAL','POL','DOC','PRO','CAS','DIF','NOM','COT','PRM')),
  ultimo      bigint not null default 0 check (ultimo >= 0),
  primary key (cliente_id, prefijo)
);
comment on table erp.sis_folio is 'Contador de folios humanos por tenant y prefijo. Se incrementa vía erp.siguiente_folio().';

-- ============================================================
-- FUNCIÓN · siguiente_folio — asignación atómica y secuencial
-- El INSERT ... ON CONFLICT DO UPDATE ... RETURNING toma un lock de fila:
-- concurrentes se serializan → nunca dos veces el mismo número, nunca huecos
-- por carrera. Devuelve el folio humano formateado (p. ej. FAC-0873).
-- ============================================================
create or replace function erp.siguiente_folio(p_cliente_id uuid, p_prefijo text)
returns text
language plpgsql
as $$
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
comment on function erp.siguiente_folio(uuid, text) is
  'Asigna el siguiente folio humano de forma atómica y secuencial (segura ante concurrencia).';
