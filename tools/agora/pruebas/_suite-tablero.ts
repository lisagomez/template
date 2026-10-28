/**
 * Fase 3 · el tablero. Ningún agente edita directo: todo cambio de un agente es una propuesta con su sha256, y A2
 * (aplicar sin aprobación) solo toca lo reversible, sin dinero ni terceros, y se deshace con un clic 24 h. Las
 * reglas del tipo de campo (Listo con dependencias cerradas, sin ciclos, el colaborador solo lo suyo) son de la base.
 */
import { assert, cuenta, rechaza, agente, persona, nodo, item, GOLFO, SECRETO, type Comprobacion, type Sabotaje } from './_marco.ts'
import { aplica, propone, supervisa, editaItem, deshaz } from '../dist/index.js'

const A2 = (campo: string, antes: unknown, despues: unknown, it = 'it-1', cat = 'pipeline') =>
  ({ version: 1 as const, clase: 'editar' as const, categoria: nodo(cat), cambios: [{ item: item(it), campo, antes: antes as never, despues: despues as never }] })

export const TABLERO: Comprobacion[] = [
  {
    fase: 'tablero', nombre: 'un agente no actualiza un ítem directo (ni el coordinador A2)', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`update agora.item set progreso = 99 where id = $1`, [item('it-1')])), /prohibido|permission/)
      await rechaza(c.comoAgente('medios-norte', (s) => s.consulta(`update agora.item set estado = 'done' where id = $1`, [item('it-5')])), /prohibido|permission/)
    },
  },
  {
    fase: 'tablero', nombre: 'A2 no aplica dinero, fechas ni responsables: la base rechaza la propuesta en A2', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoAgente('coordinador', (s) => propone(s, { org: GOLFO, autorAgente: agente('coordinador'), nivel: 'A2', resumen: 'monto en A2',
        payload: { version: 1, clase: 'cambiar_monto', categoria: nodo('pipeline'), cambios: [{ item: item('it-1'), campo: 'monto_mxn', antes: 18000, despues: 19000 }] } })), 'A2 aplica solo lo reversible')
      await rechaza(c.comoAgente('coordinador', (s) => propone(s, { org: GOLFO, autorAgente: agente('coordinador'), nivel: 'A2', resumen: 'fecha en A2',
        payload: { version: 1, clase: 'mover_fecha', categoria: nodo('pipeline'), cambios: [{ item: item('it-2'), campo: 'fin', antes: '2026-11-20', despues: '2026-11-27' }] } })), 'A2 aplica solo lo reversible')
    },
  },
  {
    fase: 'tablero', nombre: 'un externo no propone en A2 (su techo es A1)', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoAgente('medios-norte', (s) => propone(s, { org: GOLFO, autorAgente: agente('medios-norte'), nivel: 'A2', resumen: 'A2 externo', payload: A2('progreso', 30, 40, 'it-5', 'campanas') })), /supera el techo/)
    },
  },
  {
    fase: 'tablero', nombre: 'una propuesta en A1 no se aplica sin su aprobación (aunque sea reversible)', tipo: 'conducta',
    async corre(c) {
      const p = await c.comoAgente('coordinador', (s) => propone(s, { org: GOLFO, autorAgente: agente('coordinador'), nivel: 'A1', resumen: 'prioridad en A1', payload: A2('prioridad', 'alta', 'media') }))
      await rechaza(c.comoAgente('coordinador', (s) => aplica(s, p.id)), 'sin su fila de aprobación')
      await rechaza(c.comoPersona('paula', (s) => aplica(s, p.id)), 'sin su fila de aprobación')
    },
  },
  {
    fase: 'tablero', nombre: 'A2 aplica lo reversible, queda en el historial con 24 h para deshacer, y una persona con rol lo deshace', tipo: 'conducta',
    async corre(c) {
      const p = await c.comoAgente('coordinador', (s) => propone(s, { org: GOLFO, autorAgente: agente('coordinador'), nivel: 'A2', resumen: 'prioridad A2', payload: A2('prioridad', 'alta', 'media') }))
      await c.comoAgente('coordinador', (s) => aplica(s, p.id))
      const [h] = await c.base.consulta<{ id: string; actor_tipo: string; actor_agente: string; propuesta_id: string; horas: number }>(
        `select id::text, actor_tipo, actor_agente, propuesta_id, extract(epoch from deshacer_hasta - now()) / 3600 horas from agora.item_historial where propuesta_id = $1`, [p.id])
      assert.ok(h, 'el cambio A2 no quedó en el historial')
      assert.equal(h.actor_tipo, 'agente'); assert.equal(h.actor_agente, agente('coordinador'))
      assert.ok(h.horas > 23 && h.horas <= 24, 'la ventana de deshacer no es de 24 h')
      await rechaza(c.comoPersona('ana', (s) => s.consulta('select agora.deshaz($1)', [Number(h.id)])), 'deshacer pide rol de edición')
      await c.comoPersona('daniel', (s) => s.consulta('select agora.deshaz($1)', [Number(h.id)]))
      const [i] = await c.base.consulta<{ prioridad: string }>('select prioridad from agora.item where id = $1', [item('it-1')])
      assert.equal(i!.prioridad, 'alta')
    },
  },
  {
    fase: 'tablero', nombre: '«Listo» exige las dependencias cerradas, y una dependencia no cierra un ciclo', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('daniel', (s) => s.consulta(`update agora.item set estado = 'done' where id = $1`, [item('it-2')])), 'dependencias cerradas')
      await rechaza(c.comoPersona('daniel', (s) => s.consulta(`insert into agora.dependencia (org_id, item_id, depende_de) values ($1, $2, $3)`, [GOLFO, item('it-1'), item('it-3')])), 'ciclo')
    },
  },
  {
    fase: 'tablero', nombre: 'la colaboradora cambia el progreso de lo suyo, y nada más', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('ana', (s) => s.consulta(`update agora.item set progreso = 70 where id = $1`, [item('it-1')]))
      await rechaza(c.comoPersona('ana', (s) => s.consulta(`update agora.item set fin = '2026-11-30' where id = $1`, [item('it-1')])), /tu rol no cambia ese campo|prohibido/)
      await rechaza(c.comoPersona('ana', (s) => s.consulta(`update agora.item set progreso = 50 where id = $1`, [item('it-2')])), /tu rol no cambia ese campo|prohibido/)
      await rechaza(c.comoPersona('roberto', (s) => s.consulta(`update agora.item set progreso = 50 where id = $1`, [item('it-1')])), /prohibido|row-level|0 filas/).catch(async () => {
        const [i] = await c.base.consulta<{ progreso: number }>('select progreso from agora.item where id = $1', [item('it-1')])
        assert.equal(i!.progreso, 70, 'el lector cambió un ítem')
      })
    },
  },
  {
    fase: 'tablero', nombre: 'un editor no asigna a un socio externo directo: eso pide aprobador (propuesta)', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('jorge', (s) => s.consulta(`update agora.item set responsable_agente = $1, responsable_persona = null where id = $2`, [agente('fletes-golfo'), item('it-9')])), 'asignar a un externo pide aprobador')
    },
  },
  {
    fase: 'tablero', nombre: 'el historial lo escribe la base: una persona que edita queda como autora, sin propuesta', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('jorge', (s) => s.consulta(`update agora.item set prioridad = 'baja' where id = $1`, [item('it-9')]))
      const [h] = await c.base.consulta<{ actor_tipo: string; actor_persona: string; propuesta_id: string | null }>(`select actor_tipo, actor_persona, propuesta_id from agora.item_historial where item_id = $1 order by id desc limit 1`, [item('it-9')])
      assert.deepEqual(h, { actor_tipo: 'humano', actor_persona: persona('jorge'), propuesta_id: null })
      await c.comoPersona('jorge', async (s) => {
        await s.consulta(`select set_config('agora.propuesta', $1, true), set_config('agora.autor_agente', $2, true)`, ['00000000-0000-4000-8000-000000000000', agente('coordinador')])
        await s.consulta(`update agora.item set prioridad = 'media' where id = $1`, [item('it-9')])
      })
      const [h2] = await c.base.consulta<{ actor_tipo: string; propuesta_id: string | null }>(`select actor_tipo, propuesta_id from agora.item_historial where item_id = $1 order by id desc limit 1`, [item('it-9')])
      assert.deepEqual(h2, { actor_tipo: 'humano', propuesta_id: null }, 'una persona se hizo pasar por lo aprobado')
    },
  },
  {
    fase: 'tablero', nombre: 'mover una fecha propone mover sus sucesores (y repetirlo no duplica la propuesta)', tipo: 'conducta',
    async corre(c) {
      const e = { base: c.base, secreto: SECRETO }
      const r1 = await editaItem(e, persona('daniel'), { item: item('it-1'), campo: 'fin', valor: '2026-11-06' })
      assert.equal(r1.sucesores?.length, 1, 'no propuso mover el sucesor')
      const [p] = await c.base.consulta<{ clase: string; autor_agente: string; estado: string }>(`select clase, autor_agente, estado from agora.propuesta where id = $1`, [r1.sucesores![0]])
      assert.deepEqual(p, { clase: 'reprogramar', autor_agente: agente('coordinador'), estado: 'pendiente' })
      const r2 = await editaItem(e, persona('daniel'), { item: item('it-1'), campo: 'fin', valor: '2026-11-06' })
      assert.equal(await cuenta(c.base, `select 1 from agora.propuesta where clave like 'sucesor:%'`), 1, `repetir duplicó la propuesta (${r2.sucesores?.length})`)
    },
  },
  {
    fase: 'tablero', nombre: 'el supervisor (sin modelo) frena fechas en fin de semana, inicio después del fin y datos sensibles', tipo: 'conducta',
    async corre(c) {
      const v1 = await c.comoAgente('coordinador', (s) => supervisa(s, { version: 1, clase: 'mover_fecha', categoria: nodo('pipeline'), cambios: [{ item: item('it-2'), campo: 'fin', antes: '2026-11-20', despues: '2026-11-21' }] }, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' } }))
      assert.match(v1.motivo ?? '', /fin de semana/)
      const v2 = await c.comoAgente('coordinador', (s) => supervisa(s, { version: 1, clase: 'mover_fecha', categoria: nodo('pipeline'), cambios: [{ item: item('it-2'), campo: 'inicio', antes: '2026-11-02', despues: '2026-11-25' }] }, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' } }))
      assert.match(v2.motivo ?? '', /inicio es después del fin/)
      const v3 = await c.comoAgente('coordinador', (s) => supervisa(s, { version: 1, clase: 'crear_item', categoria: nodo('pipeline'), nuevos: [{ clave: 'x', nombre: 'Llamar a contacto@cliente.example.mx al 81 1234 5678', inicio: '2026-11-02', fin: '2026-11-03' }] }, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' } }))
      assert.match(v3.motivo ?? '', /datos sensibles/)
    },
  },
]

export const SABOTAJES_TABLERO: Sabotaje[] = [
  { fase: 'tablero', nombre: 'T1 · el agente puede actualizar ítems', sql: `grant update on agora.item to agora_agente; create policy x on agora.item for update to agora_agente using (true);
      create or replace function agora_priv.item_guarda() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$;`, caza: /un agente no actualiza/ },
  { fase: 'tablero', nombre: 'T2 · A2 con dinero o fechas', sql: `create or replace function agora_priv.propuesta_coherente() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$;`, caza: /A2 no aplica dinero|techo es A1/ },
  { fase: 'tablero', nombre: 'T3 · cualquier propuesta pasa por A2', sql: `create or replace function agora_priv.es_a2_valida(p agora.propuesta) returns boolean language sql stable as $$ select true $$;`, caza: /A1 no se aplica sin su aprobación/ },
  { fase: 'tablero', nombre: 'T4 · dependencias con ciclos', sql: `alter table agora.dependencia disable trigger tg_dependencia_sin_ciclo;`, caza: /no cierra un ciclo/ },
  { fase: 'tablero', nombre: 'T5 · «Listo» sin mirar dependencias', sql: `create or replace function agora_priv.item_coherente() returns trigger language plpgsql set search_path = '' as $$ begin return new; end $$;`, caza: /dependencias cerradas/ },
  { fase: 'tablero', nombre: 'T6 · el colaborador cambia cualquier campo', sql: `create or replace function agora_priv.item_guarda() returns trigger language plpgsql set search_path = '' as $$ begin
      if current_user in ('agora_agente') then raise exception 'un agente no edita el tablero: propone' using errcode = 'AG403'; end if; return new; end $$;`, caza: /colaboradora cambia el progreso|asignar a un socio externo/ },
  { fase: 'tablero', nombre: 'T7 · la persona puede atribuir su cambio a una propuesta', sql: `create or replace function agora_priv.item_historia() returns trigger language plpgsql set search_path = '' as $$
      declare campo text; a jsonb := to_jsonb(old); d jsonb := to_jsonb(new); begin
      foreach campo in array array['prioridad', 'progreso', 'fin', 'estado'] loop
        if (a -> campo) is distinct from (d -> campo) then perform agora_priv.anota_historial(new.org_id, new.id, campo, a -> campo, d -> campo, 'humano', auth.uid(), null,
          nullif(current_setting('agora.propuesta', true), '')::uuid, null); end if; end loop; return new; end $$;`, caza: /el historial lo escribe la base|A2 aplica lo reversible/ },
  { fase: 'tablero', nombre: 'T8 · deshacer sin pedir rol de edición', sql: `create or replace function agora_priv.tiene_rol(o uuid, n uuid, roles text[]) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from agora.membresia m where m.persona_id = auth.uid() and m.org_id = o) $$;`, caza: /deshace|colaboradora|Listo/ },
]
