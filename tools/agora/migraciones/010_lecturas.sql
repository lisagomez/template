-- =============================================================================
-- Ágora · 010 · lecturas para las pantallas, todas `security invoker` salvo las que leen un dato agregado que la
-- persona tiene derecho a ver (el uso de los topes de un agente de SU organización). Idempotente.
-- =============================================================================
set check_function_bodies = off;

/** El uso de los tres topes de un agente, para quien es de su organización, para el propio agente, o para el vigía
 *  de su organización (que avisa al 80 %). coalesce: sin agente en la sesión la comparación da null, y «not null» no rechaza. */
create or replace function agora.topes_de(aid uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a agora.agente;
begin
  select * into a from agora.agente where id = aid;
  if not found or not (agora_priv.es_de_org(a.org_id) or coalesce(agora_priv.agente_de_tarea() = a.id, false)
      or coalesce(agora_priv.soy_vigia() and agora_priv.org_de_agente() = a.org_id, false)) then return null; end if;
  return jsonb_build_object(
    'mensajes', jsonb_build_object('uso', agora_priv.uso_mensajes_hora(a.id), 'tope', a.tope_mensajes_hora, 'reintenta_en', agora_priv.reintenta_en(a.id, 'mensajes')),
    'propuestas', jsonb_build_object('uso', agora_priv.uso_propuestas_dia(a.id), 'tope', a.tope_propuestas_dia, 'reintenta_en', agora_priv.reintenta_en(a.id, 'propuestas')),
    'gasto', jsonb_build_object('uso', agora_priv.uso_gasto_mes(a.id), 'tope', a.tope_gasto_mes_mxn, 'reintenta_en', agora_priv.reintenta_en(a.id, 'gasto'),
                                'sin_costo', (select count(*) from agora.gasto_modelo g where g.agente_id = a.id and g.costo_mxn is null and g.periodo = agora_priv.periodo_de_registro(a.org_id, now()))),
    'org', jsonb_build_object('uso', agora_priv.gasto_org_mes(a.org_id), 'tope', (select c.tope_gasto_org_mxn from agora.org_config c where c.org_id = a.org_id)));
end $$;

/** ¿Puedo decidir esta propuesta? (la matriz, la segregación y el estado; la base lo vuelve a comprobar al insertar). */
create or replace function agora.puedo_decidir(pid uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p agora.propuesta;
  rol text;
  seg boolean;
  r agora.matriz_regla;
begin
  select * into p from agora.propuesta where id = pid;
  if not found or not agora_priv.ve_nodo(p.org_id, p.categoria_id) then return null; end if;
  r := agora_priv.regla_de(p);
  select c.segregacion into seg from agora.org_config c where c.org_id = p.org_id;
  if p.estado <> 'pendiente' then return jsonb_build_object('puede', false, 'motivo', 'la propuesta está ' || p.estado, 'firmas', r.firmas); end if;
  if coalesce(seg, true) and agora_priv.uid() in (p.solicitada_por, p.autor_persona) then
    return jsonb_build_object('puede', false, 'motivo', 'la pediste tú: la aprueba otra persona (segregación de funciones)', 'firmas', r.firmas);
  end if;
  if exists (select 1 from agora.aprobacion a where a.propuesta_id = p.id and a.decidida_por = agora_priv.uid()) then
    return jsonb_build_object('puede', false, 'motivo', 'ya la firmaste; falta otra firma', 'firmas', r.firmas);
  end if;
  rol := agora_priv.ranura_para(p, agora_priv.uid());
  if rol is null then
    return jsonb_build_object('puede', false, 'motivo', case when r.id is null then 'la matriz no tiene regla para esto: nadie la aprueba'
      else 'la matriz pide ' || (select string_agg(x, ' o ') from jsonb_array_elements_text(r.firmas -> 0) x) || ' para esto' end, 'firmas', r.firmas);
  end if;
  return jsonb_build_object('puede', true, 'rol', rol, 'firmas', r.firmas);
end $$;

revoke execute on function agora.topes_de(uuid), agora.puedo_decidir(uuid) from public;
grant execute on function agora.topes_de(uuid), agora.puedo_decidir(uuid) to authenticated;
grant execute on function agora.topes_de(uuid) to agora_agente;
