/**
 * La siembra del laboratorio: datos FICTICIOS, por las MISMAS puertas que usa Ágora. La estructura (organización,
 * personas, agentes, presupuestos, el catálogo y el tipo de cambio) la escribe el servicio, que es el job declarado
 * de la siembra (C7). Lo que tiene dinero NO: cada monto es una propuesta del coordinador que una persona con el rol
 * de la matriz aprueba y que `aplica_propuesta` convierte en compromiso. Así la siembra prueba las reglas en vez
 * de saltárselas.
 */
import { como } from '../base/como.js'
import type { Base, Sesion } from '../base/tipos.js'
import { propone, decide, aplica } from '../propuesta.js'
import { firmaTarea } from '../tarea.js'
import { huellaDeLlave } from '../llaves.js'
import { uid } from './ids.js'
import {
  AGENTES, ANEXO, BAJIO, COLUMNAS, COSTOS_SEPTIEMBRE, CUENTAS, FUENTE_TC, GOLFO, ITEMS, MATRIZ, NODOS, ORGS, PERSONAS, PLANTILLAS, PRESUPUESTOS, TIPOS_DE_CAMBIO,
  agente, item, nodo, persona,
} from './datos.js'
import { socio, tarjetaDe } from './socios.js'

export interface OpcionesSiembra { secreto: string; conHistoria?: boolean }

const responsableDe = (r: string | null) => {
  if (!r) return { p: null, a: null }
  return AGENTES.some((a) => a.clave === r) ? { p: null, a: agente(r) } : { p: persona(r), a: null }
}

async function estructura(s: Sesion, o: OpcionesSiembra) {
  await s.consulta(`insert into agora_priv.secreto (id, secreto) values (1, $1) on conflict (id) do update set secreto = excluded.secreto`, [o.secreto])
  for (const org of ORGS) {
    await s.consulta(`insert into agora.org (id, slug, nombre, ficticia) values ($1, $2, $3, true) on conflict do nothing`, [org.id, org.slug, org.nombre])
    await s.consulta(`insert into agora.org_config (org_id, umbral_monto_mxn, tope_gasto_org_mxn) values ($1, $2, $3) on conflict do nothing`, [org.id, org.umbral, org.topeOrg])
  }
  for (const n of NODOS) {
    await s.consulta(`insert into agora.nodo (id, org_id, padre_id, tipo, slug, nombre, inicio, fin, orden) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
      [nodo(n.clave), n.org, n.padre ? nodo(n.padre) : null, n.tipo, n.slug, n.nombre, n.inicio ?? null, n.fin ?? null, NODOS.indexOf(n)])
  }
  for (const p of PERSONAS) {
    await s.consulta(`insert into agora.persona (id, org_id, nombre, iniciales, titulo, correo) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
      [persona(p.clave), p.org, p.nombre, p.ini, p.titulo, `${p.clave}@${p.org === GOLFO ? 'golfo-norte' : 'bajio'}.example.mx`])
    for (const [rol, alcance] of p.roles) {
      await s.consulta(`insert into agora.membresia (org_id, persona_id, nodo_id, rol) values ($1, $2, $3, $4) on conflict do nothing`, [p.org, persona(p.clave), alcance ? nodo(alcance) : null, rol])
    }
  }
  for (const org of [GOLFO, BAJIO]) {
    for (const [clase, condicion, firmas] of MATRIZ) {
      await s.consulta(`insert into agora.matriz_regla (org_id, clase, condicion, firmas) values ($1, $2, $3, $4) on conflict do nothing`, [org, clase, condicion, JSON.stringify(firmas)])
    }
    for (const [clave, nombre, tipo, config] of COLUMNAS) {
      await s.consulta(`insert into agora.columna (org_id, clave, nombre, tipo, config, orden) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`, [org, clave, nombre, tipo, JSON.stringify(config), COLUMNAS.findIndex((c) => c[0] === clave)])
    }
    for (const [codigo, nombre, naturaleza, agrupador] of CUENTAS) {
      await s.consulta(`insert into agora.cuenta (org_id, codigo, nombre, naturaleza, codigo_agrupador, anexo) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`, [org, codigo, nombre, naturaleza, agrupador, ANEXO])
    }
    for (const [origen, cat, cargo, abono] of PLANTILLAS) {
      await s.consulta(`insert into agora.plantilla_asiento (org_id, origen, categoria_slug, cuenta_cargo, cuenta_abono, revisada_por) values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
        [org, origen, cat, cargo, abono, 'plantilla de ejemplo: la revisa el contador antes de usarla'])
    }
  }
  for (const [fecha, valor] of TIPOS_DE_CAMBIO) {
    await s.consulta(`insert into agora.tipo_cambio (fecha, moneda, valor_mxn, fuente, serie, fuente_url, publicado, nota) values ($1, 'USD', $2, $3, $4, $5, $1, $6) on conflict do nothing`,
      [fecha, valor, FUENTE_TC.fuente, FUENTE_TC.serie, FUENTE_TC.url, 'ficticio: no es el FIX real; el fixture declara su fuente para que la regla se pruebe'])
  }
  for (const a of AGENTES) {
    const externo = a.origen === 'externo' ? socio(a.clave) : null
    await s.consulta(`insert into agora.agente (id, org_id, slug, nombre, iniciales, origen, responsable, rol, descripcion, card_url, card_sha256, kid, llave_publica, llave_sha256,
        autonomia_max, estado, version, vence, sin_modelo, tope_mensajes_hora, tope_propuestas_dia, tope_gasto_mes_mxn)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) on conflict do nothing`,
      [agente(a.clave), a.org, a.clave, a.nombre, a.ini, a.origen, a.responsable, a.rol, a.descripcion, a.url ?? null, externo?.huella ?? null, a.kid ?? null,
        externo ? JSON.stringify(externo.par.publica) : null, externo ? huellaDeLlave(externo.par.publica) : null, a.autonomia, a.estado, a.version, a.vence,
        a.sinModelo ?? false, a.topes[0], a.topes[1], a.topes[2]])
    for (const [n, skills] of a.alcance) {
      await s.consulta(`insert into agora.agente_alcance (agente_id, org_id, nodo_id, skills) values ($1, $2, $3, $4) on conflict do nothing`, [agente(a.clave), a.org, nodo(n), skills])
    }
    const idcard = { agente: a.clave, origen: a.origen, responsable: a.responsable, rol: a.rol, card_url: a.url ?? null, card_sha256: externo?.huella ?? null, kid: a.kid ?? null,
      alcance: a.alcance, autonomia_max: a.autonomia, limites: a.topes, version: a.version, vence: a.vence, tarjeta: externo ? null : tarjetaDe(a) }
    await s.consulta(`insert into agora.agente_version (agente_id, org_id, version, idcard, idcard_sha256, motivo, quien) values ($1, $2, $3, $4::text::jsonb, encode(sha256(convert_to($4::text, 'UTF8')), 'hex'), $5, $6) on conflict do nothing`,
      [agente(a.clave), a.org, a.version, JSON.stringify(idcard), 'versión vigente del laboratorio (ficticia)', persona(a.firmas[0]!)])
    for (const f of a.firmas) {
      const rol = PERSONAS.find((p) => p.clave === f)!.roles.some(([r]) => r === 'propietario') ? 'propietario' : 'aprobador'
      await s.consulta(`insert into agora.agente_firma (agente_id, org_id, version, persona_id, rol_usado) values ($1, $2, $3, $4, $5) on conflict do nothing`, [agente(a.clave), a.org, a.version, persona(f), rol])
    }
  }
  for (const [cat, periodo, importe] of PRESUPUESTOS) {
    const org = NODOS.find((n) => n.clave === cat)!.org
    if (!(await s.consulta(`select 1 from agora.presupuesto where categoria_id = $1 and periodo = $2`, [nodo(cat), periodo])).length) {
      await s.consulta(`insert into agora.presupuesto (org_id, categoria_id, periodo, version, importe_mxn, motivo, quien, aprobado_por) values ($1, $2, $3, 1, $4, $5, $6, $7)`,
        [org, nodo(cat), periodo, importe, 'presupuesto inicial del laboratorio (ficticio)', persona(org === GOLFO ? 'paula' : 'carla'), persona(org === GOLFO ? 'mariana' : 'carla')])
    }
  }
  for (const it of ITEMS) {
    const org = NODOS.find((n) => n.clave === it.cat)!.org
    const r = responsableDe(it.resp)
    await s.consulta(`insert into agora.item (id, org_id, categoria_id, grupo, nombre, estado, responsable_persona, responsable_agente, prioridad, inicio, fin, progreso, etiquetas)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict do nothing`,
      [item(it.clave), org, nodo(it.cat), it.grupo ?? 'Plan', it.nombre, it.estado === 'done' ? 'doing' : it.estado, r.p, r.a, it.prio, it.ini, it.fin, it.estado === 'done' ? 90 : it.prog, it.tags])
  }
  for (const it of ITEMS.filter((x) => x.dep)) {
    const org = NODOS.find((n) => n.clave === it.cat)!.org
    await s.consulta(`insert into agora.dependencia (org_id, item_id, depende_de) values ($1, $2, $3) on conflict do nothing`, [org, item(it.clave), item(it.dep!)])
  }
}

/** Quién aprueba el monto de cada ítem en la siembra: la matriz (Finanzas sobre el umbral) y la segregación. */
function aprobadorDe(cat: string, monto: number, org: string): string {
  if (org === BAJIO) return 'carla'
  if (monto > 100000) return 'mariana'
  return ['pipeline', 'campanas'].includes(cat) ? 'daniel' : 'paula'
}
const solicitanteDe = (cat: string) => (['pipeline', 'campanas'].includes(cat) ? 'ana' : ['presupuesto', 'cierre'].includes(cat) ? 'luis' : 'jorge')

async function montos(base: Base, o: OpcionesSiembra) {
  for (const it of ITEMS.filter((x) => x.monto !== null)) {
    const org = NODOS.find((n) => n.clave === it.cat)!.org
    const coord = org === GOLFO ? 'coordinador' : 'bj-coordinador'
    const token = firmaTarea(o.secreto, { org, agente: agente(coord) })
    const clave = `siembra:monto:${it.clave}`
    const p = await como(base, { tipo: 'agente', token }, (s) => propone(s, {
      org, autorAgente: agente(coord), solicitadaPor: org === GOLFO ? persona(solicitanteDe(it.cat)) : persona('tomas'), clave,
      resumen: `Monto del plan para «${it.nombre}»: ${it.monto!.toLocaleString('es-MX')} MXN`,
      payload: { version: 1, clase: 'cambiar_monto', categoria: nodo(it.cat), cambios: [{ item: item(it.clave), campo: 'monto_mxn', antes: null, despues: it.monto! }] },
    }))
    const estado = (await base.consulta<{ estado: string }>('select estado from agora.propuesta where id = $1', [p.id]))[0]!.estado
    if (estado === 'pendiente') {
      const quien = persona(aprobadorDe(it.cat, it.monto!, org))
      await como(base, { tipo: 'persona', id: quien }, (s) => decide(s, { org, propuesta: p.id, sha256: p.sha256, persona: quien, decision: 'aprobar' }))
    }
    await como(base, { tipo: 'persona', id: persona(aprobadorDe(it.cat, it.monto!, org)) }, (s) => aplica(s, p.id))
  }
  // Los ítems de septiembre se cierran ahora que su monto está comprometido (y «Listo» exige dependencias cerradas).
  for (const it of ITEMS.filter((x) => x.estado === 'done')) {
    await base.consulta(`update agora.item set estado = 'done' where id = $1 and estado <> 'done'`, [item(it.clave)])
    // Al cerrar, la base pone la fecha real de HOY; lo sembrado se cerró antes: su día real ficticio.
    if (it.real) await base.consulta('update agora.item set fecha_real = $2 where id = $1', [item(it.clave), it.real])
  }
}

async function ejercidoDeSeptiembre(base: Base) {
  for (const c of COSTOS_SEPTIEMBRE) {
    const it = ITEMS.find((x) => x.clave === c.item)!
    const [k] = await base.consulta<{ id: string }>(`select id from agora.compromiso where item_id = $1 and estado = 'vigente'`, [item(it.clave)])
    const evidencia = c.tipo === 'cfdi' ? { uuid: uid(`cfdi:${c.clave}`), sha: null } : { uuid: null, sha: (await base.consulta<{ h: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') h`, [`comprobante:${c.clave}`]))[0]!.h }
    await como(base, { tipo: 'persona', id: persona('mariana') }, (s) => s.consulta(
      `insert into agora.costo (org_id, categoria_id, item_id, compromiso_id, periodo, importe_mxn, concepto, tipo, evidencia_uuid, evidencia_sha256, proveedor_rfc, proveedor, estado)
       values ($1, $2, $3, $4, '2026-09', $5, $6, $7, $8, $9, $10, $11, 'ejercido') on conflict do nothing`,
      [GOLFO, nodo(it.cat), item(it.clave), k?.id ?? null, c.importe, c.concepto, c.tipo, evidencia.uuid, evidencia.sha, c.rfc ?? null, c.proveedor]))
  }
}

/** El gasto de modelo ficticio de septiembre y octubre: USD por llamada; algunas sin datos de uso (costo null, no cero). */
async function gastoDeModelo(base: Base) {
  const llamadas: Array<[agente: string, ejecuta: string, cat: string, cuando: string, usd: number | null, tin: number | null, tout: number | null]> = []
  const dias = ['2026-09-03', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-29']
  for (const d of dias) {
    llamadas.push(['coordinador', 'coordinador', 'pipeline', `${d} 10:15:00-06`, 0.42, 18000, 2600])
    llamadas.push(['coordinador', 'coordinador', 'campanas', `${d} 12:40:00-06`, 0.31, 14000, 1900])
    llamadas.push(['analista', 'analista', 'presupuesto', `${d} 16:05:00-06`, 0.18, 9000, 1100])
  }
  llamadas.push(['medios-norte', 'coordinador', 'campanas', '2026-09-26 11:00:00-06', 0.22, 10500, 1400])
  llamadas.push(['coordinador', 'coordinador', 'logistica', '2026-09-30 09:00:00-06', null, null, null])
  const octubre = ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-27']
  for (const d of octubre) {
    llamadas.push(['coordinador', 'coordinador', 'pipeline', `${d} 09:30:00-06`, 3.55, 120000, 15000])
    llamadas.push(['coordinador', 'coordinador', 'logistica', `${d} 13:10:00-06`, 3.40, 115000, 14000])
    llamadas.push(['analista', 'analista', 'presupuesto', `${d} 17:20:00-06`, 1.32, 52000, 5800])
  }
  for (const d of ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']) llamadas.push(['medios-norte', 'coordinador', 'campanas', `${d} 11:30:00-06`, 2.70, 98000, 9000])
  llamadas.push(['fletes-golfo', 'coordinador', 'logistica', '2026-10-21 10:00:00-06', 0.95, 30000, 4000])
  llamadas.push(['coordinador', 'coordinador', 'campanas', '2026-10-15 15:00:00-06', null, null, null])
  llamadas.push(['analista', 'analista', 'presupuesto', '2026-10-22 18:00:00-06', null, null, null])
  for (const [a, e, cat, cuando, usd, tin, tout] of llamadas) {
    await base.consulta(`insert into agora.gasto_modelo (org_id, agente_id, ejecutado_por, categoria_id, proveedor, modelo, tokens_entrada, tokens_salida, costo_usd, cuando)
      select $1, $2, $3, $4, 'modelo determinista del laboratorio', 'agora-determinista-0.1', $5, $6, $7, $8::timestamptz
       where not exists (select 1 from agora.gasto_modelo g where g.agente_id = $2 and g.categoria_id = $4 and g.cuando = $8::timestamptz)`,
      [GOLFO, agente(a), agente(e), nodo(cat), tin, tout, usd, cuando])
  }
}

/** Conversación de ejemplo en los hilos: personas, agentes internos y un socio (entró por la Puerta: origen «puerta»). */
async function conversacion(base: Base) {
  const canal = async (cat: string) => (await base.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [nodo(cat)]))[0]!.id
  const hilo: Array<[cat: string, clave: string, tipo: 'humano' | 'agente' | 'sistema', quien: string | null, cuerpo: string, origen?: string, padre?: string]> = [
    ['campanas', 'm-1', 'humano', 'daniel', 'Arrancamos la pauta de radio el 20. Medios Norte, ¿nos mandas el reporte de ROAS de la primera semana?'],
    ['campanas', 'm-2', 'agente', 'medios-norte', 'Recibido. Propongo mover dos spots al horario de 7 a 9 por mejor alcance; lo dejo como propuesta para su aprobación.', 'puerta', 'm-1'],
    ['logistica', 'm-3', 'humano', 'jorge', 'Fletes del Golfo: necesitamos la ruta Apodaca–Escobedo con ventanas de entrega antes de las 10.'],
    ['logistica', 'm-4', 'agente', 'fletes-golfo', 'Envío la cotización con dos rutas alternativas; la propuesta queda en el hilo.', 'puerta', 'm-3'],
    ['pipeline', 'm-5', 'agente', 'coordinador', 'Desplegué el plan de visitas: 12 cadenas en 3 semanas. Las fechas dependen del mapeo de cuentas.'],
    ['presupuesto', 'm-6', 'humano', 'mariana', 'El presupuesto de apertura Q1 sale el 6 de noviembre. El analista prepara escenarios con las cifras del libro.'],
  ]
  for (const [cat, clave, tipo, quien, cuerpo, origen, padre] of hilo) {
    const c = await canal(cat)
    const padreId = padre ? (await base.consulta<{ id: string }>('select id from agora.mensaje where clave = $1', [`siembra:${padre}`]))[0]?.id ?? null : null
    await base.consulta(`insert into agora.mensaje (org_id, canal_id, hilo_id, autor_tipo, autor_persona, autor_agente, cuerpo, origen, clave) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
      [GOLFO, c, padreId, tipo, tipo === 'humano' ? persona(quien!) : null, tipo === 'agente' ? agente(quien!) : null, cuerpo, origen ?? 'sala', `siembra:${clave}`])
  }
}

/** Lo que espera un clic al abrir el laboratorio: propuestas de agentes por la puerta real (su sesión, su alcance, su cupo). */
async function pendientes(base: Base, o: OpcionesSiembra) {
  const canal = async (cat: string) => (await base.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [nodo(cat)]))[0]!.id
  const casos: Array<{ agente: string; cat: string; clave: string; resumen: string; cuerpo: string; origen: 'sala' | 'puerta'; nivel?: 'A1' | 'A2'; payload: Parameters<typeof propone>[1]['payload']; solicita?: string }> = [
    { agente: 'medios-norte', cat: 'campanas', clave: 'p-radio', origen: 'puerta', resumen: 'Ampliar la pauta de radio a 132 000 MXN (dos spots de 7 a 9)',
      cuerpo: 'Con el ROAS de la primera semana conviene ampliar la pauta: dos spots más en el horario de 7 a 9. Queda como propuesta.',
      payload: { version: 1, clase: 'cambiar_monto', categoria: nodo('campanas'), cambios: [{ item: item('it-5'), campo: 'monto_mxn', antes: 120000, despues: 132000 }] } },
    { agente: 'coordinador', cat: 'pipeline', clave: 'p-visitas', origen: 'sala', resumen: 'Mover las visitas a 12 cadenas al 27 de noviembre', solicita: 'ana',
      cuerpo: 'El mapeo de cuentas va al 55 %: propongo mover el cierre de las visitas una semana, al 27 de noviembre.',
      payload: { version: 1, clase: 'mover_fecha', categoria: nodo('pipeline'), cambios: [{ item: item('it-2'), campo: 'fin', antes: '2026-11-20', despues: '2026-11-27' }] } },
    { agente: 'fletes-golfo', cat: 'logistica', clave: 'p-ruta', origen: 'puerta', resumen: 'Cotización de la ruta Apodaca–Escobedo: 64 500 MXN con ventanas antes de las 10',
      cuerpo: 'Adjunto la cotización con ventanas de entrega antes de las 10: 64 500 MXN.',
      payload: { version: 1, clase: 'cambiar_monto', categoria: nodo('logistica'), cambios: [{ item: item('it-7'), campo: 'monto_mxn', antes: 60000, despues: 64500 }] } },
    { agente: 'analista', cat: 'presupuesto', clave: 'p-escenarios', origen: 'sala', resumen: 'Agregar «Comparativo de escenarios de apertura» al plan de presupuesto',
      cuerpo: 'Con las cifras del libro preparo un comparativo de tres escenarios; lo propongo como ítem del plan.',
      payload: { version: 1, clase: 'crear_item', categoria: nodo('presupuesto'), nuevos: [{ clave: 'escenarios', nombre: 'Comparativo de escenarios de apertura', inicio: '2026-11-09', fin: '2026-11-13', prioridad: 'media', depende_de: [item('it-12')] }] } },
    { agente: 'coordinador', cat: 'pipeline', clave: 'p-progreso', origen: 'sala', nivel: 'A2', resumen: 'Subir el progreso del mapeo de cuentas a 60 % (A2: se deshace con un clic 24 h)',
      cuerpo: 'Recalculé el avance del mapeo con las 24 cuentas ya visitadas: 60 %. Lo apliqué en A2; se deshace con un clic durante 24 horas.',
      payload: { version: 1, clase: 'editar', categoria: nodo('pipeline'), cambios: [{ item: item('it-1'), campo: 'progreso', antes: 55, despues: 60 }] } },
  ]
  for (const c of casos) {
    const token = firmaTarea(o.secreto, { org: GOLFO, agente: agente(c.agente) })
    const idCanal = await canal(c.cat) // fuera de la transacción: PGlite tiene una sola conexión
    const p = await como(base, { tipo: 'agente', token }, async (s) => {
      const prop = await propone(s, { org: GOLFO, autorAgente: agente(c.agente), solicitadaPor: c.solicita ? persona(c.solicita) : null, clave: `siembra:${c.clave}`, resumen: c.resumen, payload: c.payload, nivel: c.nivel ?? 'A1' })
      await s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_agente, cuerpo, origen, propuesta_id, clave) values ($1, $2, 'agente', $3, $4, $5, $6, $7) on conflict do nothing`,
        [GOLFO, idCanal, agente(c.agente), c.cuerpo, c.origen, prop.id, `siembra:msg:${c.clave}`])
      return prop
    })
    if (c.nivel === 'A2') await como(base, { tipo: 'agente', token }, (s) => aplica(s, p.id))
  }
}

/** Siembra SOLO con `AGORA_LABORATORIO=1` y sobre una base sin organizaciones reales (la guarda es de la base). */
export async function siembra(base: Base, o: OpcionesSiembra): Promise<void> {
  if (process.env.AGORA_LABORATORIO !== '1') throw new Error('la siembra ficticia corre solo en el laboratorio (AGORA_LABORATORIO=1)')
  await base.transaccion(async (s) => { await s.consulta('select agora_priv.guarda_siembra()'); await estructura(s, o) })
  await montos(base, o)
  await ejercidoDeSeptiembre(base)
  await gastoDeModelo(base)
  await conversacion(base)
  await pendientes(base, o)
}
