/**
 * Fase 6 · calendario y vigía. Un reintento no duplica eventos (idempotencia por clave en la base Y en la pluma del
 * calendario); los recordatorios se programan una vez por versión de la fecha y se cancelan al cerrar; el vigía
 * propone reprogramar lo atrasado, avisa al 80 % del gasto (también a Finanzas) y SUSPENDE por deriva de tarjeta.
 */
import { assert, cuenta, rechaza, agente, nodo, item, GOLFO, SECRETO, type Comprobacion, type Ctx, type Sabotaje } from './_marco.ts'
import { correVigia, huellaDeTarjeta, firmaTarjeta } from '../dist/index.js'
import { calendarioDeLaboratorio, descargaDeLaboratorio, socio, tarjetaDe } from '../dist/laboratorio/index.js'

const descargaDe = descargaDeLaboratorio
const vigia = (c: Ctx, cal = calendarioDeLaboratorio(), descarga = descargaDe()) => ({ cal, corre: () => correVigia({ base: c.base, secreto: SECRETO, org: GOLFO, calendario: cal.puerto, descarga }) })

export const VIGIA: Comprobacion[] = [
  {
    fase: 'vigia', nombre: 'un reintento no duplica eventos: ni en la base ni en el calendario', tipo: 'conducta',
    async corre(c) {
      const v = vigia(c)
      const r1 = await v.corre()
      const eventos = await cuenta(c.base, 'select 1 from agora.item_evento')
      const enCalendario = await v.cal.eventos()
      assert.ok(r1.eventos.nuevos > 0, 'el vigía no calendarizó nada')
      assert.equal(enCalendario, eventos, 'la base y el calendario no tienen los mismos eventos')
      const r2 = await v.corre()
      assert.equal(r2.eventos.nuevos, 0, 'la segunda vuelta creó eventos')
      assert.equal(await cuenta(c.base, 'select 1 from agora.item_evento'), eventos)
      assert.equal(await v.cal.eventos(), enCalendario, 'el calendario duplicó eventos')
      // Dos vigías a la vez (los dos leyeron «no existe» antes de escribir): la llave única de la base decide, no la lectura.
      const doble = await c.comoAgente('vigia', async (s) => [
        (await s.consulta<{ r: { nuevo: boolean } }>('select agora.vigia_evento($1, 99, $2) r', [item('it-1'), 'ref-a']))[0]!.r.nuevo,
        (await s.consulta<{ r: { nuevo: boolean } }>('select agora.vigia_evento($1, 99, $2) r', [item('it-1'), 'ref-b']))[0]!.r.nuevo,
      ])
      assert.deepEqual(doble, [true, false], 'la misma clave se anotó dos veces')
      assert.equal(await cuenta(c.base, `select 1 from agora.item_evento where clave = $1`, [`item:${item('it-1')}:fecha:v99`]), 1)
      // El reintento del calendario mismo (la base no alcanzó a anotarlo): la pluma, idempotente por clave, no crea otro.
      await v.cal.puerto.crea({ clave: 'item:x:fecha:v1', titulo: 'x', dia: '2026-11-20' })
      await v.cal.puerto.crea({ clave: 'item:x:fecha:v1', titulo: 'x', dia: '2026-11-20' })
      assert.equal(await v.cal.eventos(), enCalendario + 1)
    },
  },
  {
    fase: 'vigia', nombre: 'mover la fecha cambia de versión: un evento nuevo y los recordatorios viejos se cancelan', tipo: 'conducta',
    async corre(c) {
      const v = vigia(c)
      await v.corre()
      const antes = await cuenta(c.base, `select 1 from agora.recordatorio where item_id = $1 and estado = 'programado'`, [item('it-2')])
      assert.ok(antes > 0)
      await c.comoPersona('daniel', (s) => s.consulta(`update agora.item set fin = '2026-11-27' where id = $1`, [item('it-2')]))
      assert.equal(await cuenta(c.base, `select 1 from agora.recordatorio where item_id = $1 and estado = 'programado'`, [item('it-2')]), 0, 'quedaron recordatorios de la fecha vieja')
      await v.corre()
      assert.equal(await cuenta(c.base, `select 1 from agora.item_evento where item_id = $1`, [item('it-2')]), 2, 'la fecha nueva no tiene su evento (o la vieja se borró)')
      assert.ok(await cuenta(c.base, `select 1 from agora.recordatorio where item_id = $1 and estado = 'programado' and clave like '%:v2:%'`, [item('it-2')]) > 0)
    },
  },
  {
    fase: 'vigia', nombre: 'lo atrasado: aviso en el hilo y una propuesta de reprogramar (una por versión de la fecha)', tipo: 'conducta',
    async corre(c) {
      const v = vigia(c)
      const r = await v.corre()
      assert.ok(r.propuestas >= 1, 'no propuso reprogramar el contrato de bodega atrasado')
      const [p] = await c.base.consulta<{ estado: string; autor_agente: string; clase: string }>(`select estado, autor_agente, clase from agora.propuesta where clave like 'vigia:atrasado:%' and payload_canon like '%' || $1 || '%'`, [item('it-8')])
      assert.deepEqual(p, { estado: 'pendiente', autor_agente: agente('vigia'), clase: 'reprogramar' })
      const r2 = await v.corre()
      assert.equal(r2.propuestas, 0, 'repitió la propuesta')
    },
  },
  {
    fase: 'vigia', nombre: 'el vigía avisa al 80 % del gasto de un agente, también a Finanzas', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('paula', (s) => s.consulta(`select agora.baja_tope($1, 'gasto', 250)`, [agente('medios-norte')]))
      await vigia(c).corre()
      assert.equal(await cuenta(c.base, `select 1 from agora.aviso where agente_id = $1 and tipo in ('tope_80', 'tope_100') and para_rol = 'finanzas'`, [agente('medios-norte')]), 1)
      assert.equal(await cuenta(c.base, `select 1 from agora.aviso where agente_id = $1 and tipo in ('tope_80', 'tope_100') and para_rol = 'propietario'`, [agente('medios-norte')]), 1)
    },
  },
  {
    fase: 'vigia', nombre: 'el vigía SUSPENDE al socio cuya tarjeta cambió de huella (y avisa a la Propietaria)', tipo: 'conducta',
    async corre(c) {
      const s = socio('medios-norte')
      const cambiada = firmaTarjeta(tarjetaDe(s.agente, { skills: [{ id: 'mover_dinero', name: 'mover dinero', description: 'nueva', tags: [] }] }), s.par)
      assert.notEqual(huellaDeTarjeta(cambiada), s.huella)
      const r = await vigia(c, calendarioDeLaboratorio(), descargaDe({ 'medios-norte': cambiada })).corre()
      assert.deepEqual(r.suspendidos, [{ agente: 'Medios Norte', motivo: 'deriva_tarjeta' }])
      const [a] = await c.base.consulta<{ estado: string }>('select estado from agora.agente where id = $1', [agente('medios-norte')])
      assert.equal(a!.estado, 'suspendido')
      assert.equal(await cuenta(c.base, `select 1 from agora.revocacion where agente_id = $1 and accion = 'suspender' and quien_agente = $2`, [agente('medios-norte'), agente('vigia')]), 1)
      assert.equal(await cuenta(c.base, `select 1 from agora.aviso where agente_id = $1 and tipo = 'deriva_tarjeta'`, [agente('medios-norte')]), 1)
    },
  },
  {
    fase: 'vigia', nombre: 'solo el vigía suspende por su cuenta, y solo por deriva, firma o inyección', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`select agora.suspende_por_vigia($1, 'deriva_tarjeta')`, [agente('medios-norte')])), 'solo el vigía')
      await rechaza(c.comoAgente('vigia', (s) => s.consulta(`select agora.suspende_por_vigia($1, 'me cae mal')`, [agente('medios-norte')])), 'solo por deriva')
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`select agora.vigia_evento($1, 1, 'x')`, [item('it-1')])), 'solo el vigía')
    },
  },
  {
    fase: 'vigia', nombre: 'el calendario de cierre: el mes vencido y abierto avisa a Finanzas (una vez)', tipo: 'conducta',
    async corre(c) {
      await vigia(c).corre()
      await vigia(c).corre()
      assert.equal(await cuenta(c.base, `select 1 from agora.aviso where tipo = 'cierre_proximo' and clave = 'cierre:2026-09' and para_rol = 'finanzas'`), 1)
    },
  },
]

export const SABOTAJES_VIGIA: Sabotaje[] = [
  { fase: 'vigia', nombre: 'V1 · el evento sin llave única (cada vuelta crea otro)', sql: `alter table agora.item_evento drop constraint item_evento_clave_key;
      create or replace function agora.vigia_evento(it uuid, version int, ref text) returns jsonb language plpgsql security definer set search_path = '' as $$
      begin insert into agora.item_evento (org_id, item_id, version_fecha, clave, evento_ref) select i.org_id, it, version, 'item:' || it || ':fecha:v' || version, ref from agora.item i where i.id = it; return '{"nuevo": true}'::jsonb; end $$;`, caza: /reintento no duplica/ },
  { fase: 'vigia', nombre: 'V2 · los recordatorios viejos no se cancelan', sql: `drop trigger tg_cierra_ciclo_fecha on agora.item;`, caza: /cambia de versión/ },
  { fase: 'vigia', nombre: 'V3 · el vigía no puede suspender', sql: `create or replace function agora.suspende_por_vigia(aid uuid, motivo text) returns jsonb language sql security definer set search_path = '' as $$ select '{"ok": true}'::jsonb $$;`, caza: /SUSPENDE/ },
  { fase: 'vigia', nombre: 'V4 · cualquier agente suspende y calendariza', sql: `create or replace function agora_priv.soy_vigia() returns boolean language sql stable as $$ select true $$;
      create or replace function agora.suspende_por_vigia(aid uuid, motivo text) returns jsonb language plpgsql security definer set search_path = '' as $$ begin update agora.agente set estado = 'suspendido' where id = aid; return '{"ok": true}'::jsonb; end $$;`, caza: /solo el vigía/ },
  { fase: 'vigia', nombre: 'V5 · los avisos se repiten (sin llave)', sql: `alter table agora.aviso drop constraint aviso_org_id_clave_key;`, caza: /una vez|80 %/ },
]
