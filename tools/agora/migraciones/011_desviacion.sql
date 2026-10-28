-- =============================================================================
-- Ágora · 011 · la desviación contra el presupuesto: cuando lo comprometido más lo ejercido de una categoría pasa
-- el presupuesto del mes por más del umbral de la organización, alerta en el hilo de la categoría y en «Espera tu
-- clic» de Finanzas. Una alerta por categoría y mes (idempotente). La pone la base, no la pantalla. Idempotente.
-- =============================================================================
set check_function_bodies = off;

create or replace function agora_priv.revisa_desviacion(cat uuid, per text) returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
  umbral numeric;
  usado numeric;
  pct numeric;
  canal uuid;
  n int;
  texto text;
begin
  select * into v from agora.v_centro_periodo x where x.categoria_id = cat and x.periodo = per;
  if not found or v.presupuesto_mxn <= 0 then return; end if;
  select c.desviacion_umbral_pct into umbral from agora.org_config c where c.org_id = v.org_id;
  usado := v.comprometido_mxn + v.ejercido_mxn;
  pct := round(100 * (usado - v.presupuesto_mxn) / v.presupuesto_mxn, 1);
  if pct <= coalesce(umbral, 10) then return; end if;
  texto := (select n.nombre from agora.nodo n where n.id = cat) || ' (' || per || '): comprometido más ejercido ' || to_char(usado, 'FM$999,999,990.00')
           || ' contra un presupuesto de ' || to_char(v.presupuesto_mxn, 'FM$999,999,990.00') || ' (+' || pct || ' %, umbral ' || coalesce(umbral, 10) || ' %).';
  insert into agora.aviso (org_id, clave, tipo, para_rol, nodo_id, texto) values (v.org_id, 'desviacion:' || cat || ':' || per, 'presupuesto_desviacion', 'finanzas', cat, 'Desviación: ' || texto)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;
  select c.id into canal from agora.canal c where c.categoria_id = cat;
  if canal is not null then
    insert into agora.mensaje (org_id, canal_id, autor_tipo, cuerpo, clave) values (v.org_id, canal, 'sistema', 'Desviación de presupuesto: ' || texto, 'aviso:desviacion:' || cat || ':' || per)
    on conflict do nothing;
  end if;
end $$;

create or replace function agora_priv.desviacion_tras() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform agora_priv.revisa_desviacion(new.categoria_id, new.periodo);
  return null;
end $$;
drop trigger if exists tg_desviacion_costo on agora.costo;
create trigger tg_desviacion_costo after insert or update on agora.costo for each row execute function agora_priv.desviacion_tras();
drop trigger if exists tg_desviacion_gasto on agora.gasto_modelo;
create trigger tg_desviacion_gasto after insert on agora.gasto_modelo for each row execute function agora_priv.desviacion_tras();
drop trigger if exists tg_desviacion_compromiso on agora.compromiso;
create trigger tg_desviacion_compromiso after insert or update on agora.compromiso for each row execute function agora_priv.desviacion_tras();

revoke execute on function agora_priv.revisa_desviacion(uuid, text), agora_priv.desviacion_tras() from public, authenticated, agora_agente, agora_puerta;

/** El cupo de una categoría en un mes, para el supervisor financiero (persona de la organización o agente con alcance):
 *  el presupuesto, el disponible y lo que el ítem ya tenía comprometido (que se libera si su monto cambia). */
create or replace function agora.cupo_de_categoria(cat uuid, per text, it uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o uuid := (select n.org_id from agora.nodo n where n.id = cat);
  v record;
begin
  if o is null or not (agora_priv.es_de_org(o) or agora_priv.agente_alcanza(agora_priv.agente_de_tarea(), cat)) then return null; end if;
  select * into v from agora.v_centro_periodo x where x.categoria_id = cat and x.periodo = per;
  return jsonb_build_object('presupuesto', case when found then v.presupuesto_mxn end, 'disponible', case when found then v.disponible_mxn else 0 end,
    'vigente_item', (select coalesce(sum(k.vigente_mxn), 0) from agora.v_compromiso_saldo k where k.item_id = it and k.estado = 'vigente' and k.periodo = per));
end $$;
revoke execute on function agora.cupo_de_categoria(uuid, text, uuid) from public;
grant execute on function agora.cupo_de_categoria(uuid, text, uuid) to authenticated, agora_agente;
