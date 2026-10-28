-- =============================================================================
-- Ágora · 008 · lo que un agente puede escribir y cuándo: mensajes y propuestas SOLO dentro de su alcance, con
-- su idCard vivo y con cupo en sus topes (la base rechaza la inserción sin cupo: no hay carreras, el cupo se
-- toma bajo un candado por agente). Los avisos al 80 % los pone la base. Y las funciones de la Puerta. Idempotente.
-- =============================================================================
set check_function_bodies = off;

/** Un aviso por tope y por ventana (la clave lo hace idempotente), en el hilo de la categoría y en «Espera tu clic». */
create or replace function agora_priv.avisa_tope(a agora.agente, tipo text, uso numeric, tope numeric, ventana text, categoria uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  nivel text := case when uso >= tope then 'tope_100' else 'tope_80' end;
  clave text := nivel || ':' || a.id || ':' || tipo || ':' || ventana;
  etiqueta text := case tipo when 'mensajes' then 'mensajes por hora' when 'propuestas' then 'propuestas por día' else 'gasto de modelo del mes (MXN)' end;
  texto text;
  canal uuid;
  n int;
begin
  if tope <= 0 or uso < 0.8 * tope then return; end if;
  texto := a.nombre || ' lleva ' || round(uso, 2) || ' de ' || round(tope, 2) || ' ' || etiqueta || ' (' || round(100 * uso / tope) || ' %).'
           || case when nivel = 'tope_100' then ' Al 100 %: sigue solo con reglas hasta que se abra la ventana.' else '' end;
  insert into agora.aviso (org_id, clave, tipo, para_rol, agente_id, nodo_id, texto) values (a.org_id, clave, nivel, 'propietario', a.id, categoria, texto)
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if; -- ya avisado en esta ventana
  if tipo = 'gasto' then
    insert into agora.aviso (org_id, clave, tipo, para_rol, agente_id, nodo_id, texto) values (a.org_id, clave || ':finanzas', nivel, 'finanzas', a.id, categoria, texto)
    on conflict do nothing;
  end if;
  select c.id into canal from agora.canal c where c.categoria_id = categoria;
  if canal is not null then
    insert into agora.mensaje (org_id, canal_id, autor_tipo, cuerpo, clave) values (a.org_id, canal, 'sistema', 'Aviso de tope: ' || texto, 'aviso:' || clave)
    on conflict do nothing;
  end if;
end $$;

/** El mensaje de un agente: su idCard vivo, la categoría dentro de su alcance y cupo de mensajes en la hora. */
create or replace function agora_priv.mensaje_de_agente() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  cat uuid;
  uso int;
  zona text;
begin
  if new.autor_tipo <> 'agente' then return new; end if;
  select * into a from agora.agente where id = new.autor_agente;
  select c.categoria_id into cat from agora.canal c where c.id = new.canal_id;
  if not found or a.estado not in ('aprobado', 'prueba') or not agora_priv.agente_alcanza(a.id, cat) then
    raise exception 'no existe' using errcode = 'AG404'; -- lo ajeno y lo inexistente responden igual
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agora-cuota:' || a.id::text, 0));
  -- Lo que entra por la Puerta ya contó al ser admitido; lo demás cuenta aquí.
  if new.origen <> 'puerta' then
    uso := agora_priv.uso_mensajes_hora(a.id);
    if uso >= a.tope_mensajes_hora then
      raise exception 'tope de mensajes por hora' using errcode = 'AG429', detail = agora_priv.reintenta_en(a.id, 'mensajes')::text;
    end if;
    select c.zona into zona from agora.org_config c where c.org_id = a.org_id;
    perform agora_priv.avisa_tope(a, 'mensajes', uso + 1, a.tope_mensajes_hora, to_char(now() at time zone zona, 'YYYY-MM-DD"h"HH24'), cat);
  end if;
  return new;
end $$;
drop trigger if exists tg_mensaje_de_agente on agora.mensaje;
create trigger tg_mensaje_de_agente before insert on agora.mensaje for each row execute function agora_priv.mensaje_de_agente();

/** La propuesta de un agente: idCard vivo, categoría en su alcance, y cupo de propuestas del día. */
create or replace function agora_priv.propuesta_de_agente() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  a agora.agente;
  uso int;
  zona text;
begin
  if new.autor_agente is null then return new; end if;
  select * into a from agora.agente where id = new.autor_agente;
  if not found or a.estado not in ('aprobado', 'prueba') or not agora_priv.agente_alcanza(a.id, new.categoria_id) then
    raise exception 'no existe' using errcode = 'AG404';
  end if;
  if a.rol in ('supervisor', 'observador') then raise exception 'este agente no propone: % (solo valida o lee)', a.rol using errcode = 'AG403'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agora-cuota:' || a.id::text, 0));
  uso := agora_priv.uso_propuestas_dia(a.id);
  if uso >= a.tope_propuestas_dia then
    raise exception 'tope de propuestas por día' using errcode = 'AG429', detail = agora_priv.reintenta_en(a.id, 'propuestas')::text;
  end if;
  select c.zona into zona from agora.org_config c where c.org_id = a.org_id;
  perform agora_priv.avisa_tope(a, 'propuestas', uso + 1, a.tope_propuestas_dia, to_char(now() at time zone zona, 'YYYY-MM-DD'), new.categoria_id);
  return new;
end $$;
drop trigger if exists tg_propuesta_de_agente on agora.propuesta;
create trigger tg_propuesta_de_agente before insert on agora.propuesta for each row execute function agora_priv.propuesta_de_agente();

/** Al registrar un gasto de modelo, el aviso al 80 % (al agente que se cobra; también a Finanzas). */
create or replace function agora_priv.gasto_avisa() returns trigger language plpgsql security definer set search_path = '' as $$
declare a agora.agente;
begin
  select * into a from agora.agente where id = new.agente_id;
  perform agora_priv.avisa_tope(a, 'gasto', agora_priv.uso_gasto_mes(a.id), a.tope_gasto_mes_mxn, new.periodo, new.categoria_id);
  return null;
end $$;
drop trigger if exists tg_gasto_avisa on agora.gasto_modelo;
create trigger tg_gasto_avisa after insert on agora.gasto_modelo for each row execute function agora_priv.gasto_avisa();

-- --- La Puerta: lee el idCard SIN caché, toma el jti una vez y anota cada llamada --------------------------------
/** Lo que la Puerta necesita del idCard, leído en el momento. Nada de esto se guarda en memoria del proceso. */
create or replace function agora.puerta_lee(org_slug text, kid text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o uuid;
  a agora.agente;
begin
  if current_user not in ('agora_puerta') and not agora_priv.confiable() then raise exception 'solo la Puerta' using errcode = 'AG403'; end if;
  select x.id into o from agora.org x where x.slug = org_slug;
  if o is null then return null; end if;
  if exists (select 1 from agora.llave_revocada r where r.org_id = o and r.kid = puerta_lee.kid) then
    return jsonb_build_object('org', o, 'kid_revocado', true);
  end if;
  select * into a from agora.agente x where x.org_id = o and x.kid = puerta_lee.kid;
  if not found then return jsonb_build_object('org', o); end if;
  return jsonb_build_object('org', o, 'agente', a.id, 'slug', a.slug, 'nombre', a.nombre, 'origen', a.origen, 'estado', a.estado, 'vence', a.vence,
    'card_sha256', a.card_sha256, 'llave', a.llave_publica, 'llave_sha256', a.llave_sha256, 'rol', a.rol, 'autonomia_max', a.autonomia_max,
    'tope_mensajes_hora', a.tope_mensajes_hora, 'uso_mensajes_hora', agora_priv.uso_mensajes_hora(a.id),
    'tope_propuestas_dia', a.tope_propuestas_dia, 'uso_propuestas_dia', agora_priv.uso_propuestas_dia(a.id),
    'reintenta_mensajes', agora_priv.reintenta_en(a.id, 'mensajes'), 'reintenta_propuestas', agora_priv.reintenta_en(a.id, 'propuestas'),
    'alcance', coalesce((select jsonb_agg(jsonb_build_object('nodo', x.nodo_id, 'skills', x.skills)) from agora.agente_alcance x where x.agente_id = a.id), '[]'));
end $$;

/** El jti se toma UNA vez. Repetido: false (la Puerta rechaza y lo anota). */
create or replace function agora.puerta_toma_jti(aid uuid, jti text, vence timestamptz) returns boolean language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  if current_user not in ('agora_puerta') and not agora_priv.confiable() then raise exception 'solo la Puerta' using errcode = 'AG403'; end if;
  select a.org_id into o from agora.agente a where a.id = aid;
  if o is null then return false; end if;
  delete from agora.jti_visto where agente_id = aid and jti_visto.vence < now() - interval '1 day';
  insert into agora.jti_visto (org_id, agente_id, jti, vence) values (o, aid, jti, vence) on conflict do nothing;
  return found;
end $$;

/** Cada llamada queda anotada, admitida o rechazada, con su motivo. Admitir cuenta para el tope de mensajes. */
create or replace function agora.puerta_anota(org_id uuid, aid uuid, kid text, jti text, metodo text, resultado text, motivo text, http int, retry int)
returns bigint language plpgsql security definer set search_path = '' as $$
declare id bigint;
begin
  if current_user not in ('agora_puerta') and not agora_priv.confiable() then raise exception 'solo la Puerta' using errcode = 'AG403'; end if;
  insert into agora.a2a_llamada (org_id, agente_id, kid, jti, metodo, resultado, motivo, http, retry_after)
  values (puerta_anota.org_id, aid, kid, jti, metodo, resultado, motivo, http, retry) returning a2a_llamada.id into id;
  if resultado = 'admitida' and aid is not null then
    perform agora_priv.avisa_tope(a, 'mensajes', agora_priv.uso_mensajes_hora(a.id), a.tope_mensajes_hora,
                                  to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM-DD"h"HH24'),
                                  (select x.nodo_id from agora.agente_alcance x join agora.nodo n on n.id = x.nodo_id where x.agente_id = a.id and n.tipo = 'categoria' limit 1))
      from agora.agente a where a.id = aid;
  end if;
  return id;
end $$;
