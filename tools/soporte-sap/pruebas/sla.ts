/**
 * El reloj de SLA en sus bordes (fuera de horario, feriado, espera del cliente, resolver en pausa,
 * reapertura, cambio de prioridad, plazo vencido sin responder) y los contratos como datos versionados:
 * metas citadas o en blanco, N1–N2 que solo compromete lo que controla, plantilla sin cifras ni texto
 * legal, y el cumplimiento de un periodo sintético recalculado desde los eventos igual al de la capa
 * semántica.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import {
  relojSla, contratoDeLaboratorio, contratoN1N2DeLaboratorio, nuevaVersion, vigenteEn, generaCorpus, type EventoSla, type Corte,
} from '../dist/index.js'
import { baseSoporte, como, ORG, USR } from './_base.ts'
import { HERRAMIENTA } from './_ayuda.ts'

const K = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
/** Hora de la Ciudad de México (UTC−6) a ISO UTC. */
const mx = (fecha: string, hora: string) => new Date(Date.parse(`${fecha}T${hora}:00-06:00`)).toISOString()
const ev = (tipo: EventoSla['tipo'], fecha: string, hora: string, prioridad?: EventoSla['prioridad']): EventoSla => ({ tipo, fecha: mx(fecha, hora), ...(prioridad ? { prioridad } : {}) })

test('fuera de horario: lo recibido un viernes en la noche empieza a contar el lunes al abrir', () => {
  const r = relojSla([ev('RECIBIDA', '2026-09-18', '20:00'), ev('PRIMERA_RESPUESTA', '2026-09-21', '09:30')], 'P2', K, mx('2026-09-30', '23:00'))
  assert.equal(r.respuestaMin, 30)
  assert.equal(r.cumpleRespuesta, true)
})

test('un P1 cuenta en continuo (24×7): sábado de madrugada también corre', () => {
  const a = relojSla([ev('RECIBIDA', '2026-09-19', '03:00'), ev('PRIMERA_RESPUESTA', '2026-09-19', '03:45')], 'P1', K, mx('2026-09-30', '23:00'))
  const b = relojSla([ev('RECIBIDA', '2026-09-19', '03:00'), ev('PRIMERA_RESPUESTA', '2026-09-19', '04:30')], 'P1', K, mx('2026-09-30', '23:00'))
  assert.deepEqual([a.respuestaMin, a.cumpleRespuesta, b.respuestaMin, b.cumpleRespuesta], [45, true, 90, false])
})

test('un feriado (16 de septiembre) no cuenta', () => {
  const r = relojSla([ev('RECIBIDA', '2026-09-15', '17:00'), ev('PRIMERA_RESPUESTA', '2026-09-17', '09:30')], 'P2', K, mx('2026-09-30', '23:00'))
  assert.equal(r.respuestaMin, 90)
})

test('la espera del cliente pausa la resolución, y los tramos lo muestran', () => {
  const r = relojSla([ev('RECIBIDA', '2026-09-21', '10:00'), ev('PRIMERA_RESPUESTA', '2026-09-21', '10:15'), ev('ESPERA_CLIENTE', '2026-09-21', '11:00'),
    ev('RESPUESTA_CLIENTE', '2026-09-21', '15:00'), ev('RESUELTA', '2026-09-21', '16:00')], 'P3', K, mx('2026-09-30', '23:00'))
  assert.deepEqual([r.resolucionMin, r.pausadoMin, r.estado], [120, 240, 'resuelta'])
  assert.deepEqual(r.tramos.map((x) => `${x.estado}:${x.minutos}:${x.porque}`), ['corre:60:RECIBIDA', 'pausa:240:ESPERA_CLIENTE', 'corre:60:RESPUESTA_CLIENTE'])
})

test('resolver mientras se espera al cliente detiene el reloj (no queda abierta para siempre)', () => {
  const r = relojSla([ev('RECIBIDA', '2026-09-21', '10:00'), ev('ESPERA_CLIENTE', '2026-09-21', '11:00'), ev('RESUELTA', '2026-09-22', '10:00')], 'P3', K, mx('2026-09-30', '23:00'))
  assert.deepEqual([r.estado, r.resolucionMin, r.pausadoMin], ['resuelta', 60, 480], 'lunes 11:00–18:00 (420) + martes 09:00–10:00 (60)')
})

test('una reapertura reanuda desde la reapertura; lo de en medio no cuenta y queda como tramo detenido', () => {
  const r = relojSla([ev('RECIBIDA', '2026-09-21', '10:00'), ev('RESUELTA', '2026-09-21', '12:00'), ev('REABIERTA', '2026-09-22', '10:00'),
    ev('RESUELTA', '2026-09-22', '11:00')], 'P3', K, mx('2026-09-30', '23:00'))
  assert.deepEqual([r.resolucionMin, r.reabierta], [180, true])
  assert.deepEqual(r.tramos.map((x) => x.estado), ['corre', 'detenido', 'corre'])
})

test('cambio de prioridad: la meta nueva desde la recepción (por defecto) o desde el cambio (si se pacta)', () => {
  const eventos = [ev('RECIBIDA', '2026-09-21', '10:00'), ev('CAMBIO_PRIORIDAD', '2026-09-21', '12:00', 'P1'), ev('PRIMERA_RESPUESTA', '2026-09-21', '12:30')]
  const recepcion = relojSla(eventos, 'P3', K, mx('2026-09-30', '23:00'))
  const cambio = relojSla(eventos, 'P3', { ...K, cambioDePrioridad: 'desde_el_cambio' }, mx('2026-09-30', '23:00'))
  assert.deepEqual([recepcion.prioridad, recepcion.respuestaMin, recepcion.cumpleRespuesta], ['P1', 150, false])
  assert.deepEqual([cambio.respuestaMin, cambio.cumpleRespuesta], [30, true])
})

test('sin responder: dentro del plazo no hay veredicto; pasado el plazo, ya incumplió', () => {
  const recibida = [ev('RECIBIDA', '2026-09-19', '03:00')]
  assert.equal(relojSla(recibida, 'P1', K, mx('2026-09-19', '03:30')).cumpleRespuesta, null)
  assert.equal(relojSla(recibida, 'P1', K, mx('2026-09-19', '05:00')).cumpleRespuesta, false)
  assert.equal(relojSla(recibida, 'P3', K, mx('2026-09-25', '05:00')).cumpleRespuesta, null, 'sin meta no hay incumplimiento')
})

test('la alerta interna de un reloj abierto: en plazo, escala al 80 % de la meta, vencida', () => {
  const recibida = [ev('RECIBIDA', '2026-09-19', '03:00')]
  assert.deepEqual(['03:30', '03:50', '04:10'].map((h) => relojSla(recibida, 'P1', K, mx('2026-09-19', h)).alertaRespuesta), ['en_plazo', 'escala', 'vencida'])
  assert.equal(relojSla([...recibida, ev('PRIMERA_RESPUESTA', '2026-09-19', '03:50')], 'P1', K, mx('2026-09-19', '04:10')).alertaRespuesta, null, 'ya respondida, no hay alerta')
})

test('los contratos: metas citadas o en blanco; créditos, exclusiones y disponibilidad por decidir; el N1–N2 solo compromete lo que controla', () => {
  for (const [p, m] of Object.entries(K.metas)) {
    if (m.respuestaMin !== null) assert.match(m.fuente, /SAP Enterprise Support Schedule.*§2\.1\.1/, p)
    else assert.match(m.fuente, /sin referencia pública|por decidir/, p)
    assert.equal(m.resolucionMin, null, `${p}: el laboratorio no fija resolución`)
  }
  assert.match(K.categorizacion, /agente categoriza/)
  const n1 = contratoN1N2DeLaboratorio('andina', '2026-04-01')
  assert.equal(n1.cliente, null)
  assert.ok(Object.values(n1.metas).every((m) => m.respuestaMin === null && m.resolucionMin === null))
  for (const c of [K, n1]) {
    assert.equal(c.creditos.valor, null); assert.equal(c.exclusiones.valor, null); assert.equal(c.disponibilidad.valor, null)
    assert.match(c.disponibilidad.quienDecide, /GATE 3/)
  }
})

test('versiones: la incidencia se mide con el contrato que regía al recibirla', () => {
  const v2 = nuevaVersion(K, { cambioDePrioridad: 'desde_el_cambio', notas: [...K.notas, 'v2: la meta nueva cuenta desde el cambio'] }, '2026-08-01')
  assert.equal(v2.version, 2)
  assert.equal(vigenteEn([K, v2], mx('2026-07-15', '10:00'))?.version, 1)
  assert.equal(vigenteEn([K, v2], mx('2026-08-15', '10:00'))?.version, 2)
  assert.equal(vigenteEn([K, v2], mx('2026-03-15', '10:00')), null)
  assert.throws(() => nuevaVersion(v2, {}, '2026-07-01'), /DESPUÉS/)
})

test('los contratos viven como datos versionados en ss_contrato_sla, y cada quien lee los suyos', async () => {
  const db = await baseSoporte()
  const v1 = contratoDeLaboratorio(ORG.CA, ORG.A1, '2026-10-01')
  const v2 = nuevaVersion(v1, { cambioDePrioridad: 'desde_el_cambio' }, '2026-11-01')
  for (const c of [v1, v2]) {
    await db.query(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde) values ($1, $2, $3, $4, $5, $6, $7)`,
      [`${c.id}-x`, c.version, c.nivel, c.consultora, c.cliente, JSON.stringify(c), c.vigenteDesde])
  }
  const delCliente = await como<{ id: string; version: number }>(db, USR.ua1, `select id, version from ss_contrato_sla where id like 'sla-%-x' order by version`)
  assert.deepEqual(delCliente.map((r) => r.version), [1, 2])
  assert.deepEqual(await como(db, USR.ub1, `select id from ss_contrato_sla where id like 'sla-%-x'`), [])
  const leido = await como<{ contenido: { metas: { P1: { respuestaMin: number } } } }>(db, USR.ca, `select contenido from ss_contrato_sla where id like 'sla-%-x' and version = 2`)
  assert.equal(leido[0]?.contenido.metas.P1.respuestaMin, 60)
})

test('la plantilla del contrato lleva las cifras y el texto legal EN BLANCO', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  for (const sec of ['Metas por prioridad', 'Créditos', 'Exclusiones', 'Disponibilidad', 'Firmas']) assert.match(p, new RegExp(`## .*${sec}`), sec)
  assert.ok((p.match(/\[POR DECIDIR/g) ?? []).length >= 8, 'cada cifra y cada cláusula legal es un hueco')
  assert.doesNotMatch(p, /\$\s?\d|\d+(\.\d+)?\s?%|MXN\s?\d/, 'ni un monto ni un porcentaje comprometido')
})

test('el cumplimiento de un periodo, recalculado desde los EVENTOS con el reloj, es el de la capa semántica', () => {
  const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
  const corte: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
  for (const [cliente, periodo] of [['alimentos-del-bajio', '2026-09'], ['bebidas-del-sur', '2026-08'], ['aceros-del-norte', '2026-05']] as const) {
    const medidas = corpus.incidencias.filter((i) => i.cliente === cliente && i.creada.startsWith(periodo))
      .map((i) => relojSla(i.eventos, i.prioridad, contratoDeLaboratorio(i.consultora, i.cliente, '2026-04-01'), corpus.corte).cumpleRespuesta)
      .filter((x) => x !== null)
    const desdeEventos = medidas.length ? medidas.filter((x) => x).length / medidas.length : null
    const enCorte = corte.filas.find((f) => f.metrica === 'cumplimiento_sla_respuesta' && f.alcance === 'cliente' && f.cliente === cliente && f.periodo === periodo)?.valor ?? null
    assert.equal(enCorte === null ? null : Number(enCorte.toFixed(6)), desdeEventos === null ? null : Number(desdeEventos.toFixed(6)), `${cliente} ${periodo}`)
  }
})

test('el contrato le dice al cliente que un agente categoriza y qué ve el laboratorio; el aviso de privacidad queda por decidir (AISIA, opacidad)', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const transparencia = p.slice(p.indexOf('## 11. Datos personales y transparencia'), p.indexOf('## 12.'))
  assert.match(transparencia, /un agente\s+categoriza las incidencias/)
  assert.match(transparencia, /el laboratorio ve \*\*lo que la consultora le\s+escala\*\*/)
  assert.match(transparencia, /acceso motivado que otorga la consultora/)
  assert.match(transparencia, /\[POR DECIDIR: aviso de privacidad/, 'el aviso de privacidad es redacción legal pendiente, no un agente')
})

test('el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const reloj = p.slice(p.indexOf('## 5. Cómo se mide'), p.indexOf('## 6.')), escala = p.slice(p.indexOf('## 6.'), p.indexOf('## 7.'))
  const transparencia = p.slice(p.indexOf('## 11.'), p.indexOf('## 12.'))
  assert.match(reloj, /La \*\*primera respuesta\*\* es un mensaje de una \*\*persona\*\*[\s\S]*Una acción automática[^\n]*no cuenta/, 'DP-4')
  assert.match(reloj, /su respuesta la registra \*\*él mismo\*\*/, 'el cliente reanuda la pausa')
  assert.match(escala, /cuando \*\*la consultora\*\* lo escala, a su nombre[^\n]*Un agente no escala/, 'DP-3')
  assert.match(transparencia, /\*\*agregados de operación\*\*/, 'lo que ve el laboratorio además de lo escalado')
  assert.doesNotMatch(transparencia, /revisa una persona/, 'la cuarentena no la revisa nadie hasta D14 (DP-7)')
  assert.match(reloj, /\(\*\*modo despacho\*\*\)[\s\S]*la medición \*\*no es evidencia independiente\*\*/, 'el root ajeno: el SLA de ese modo no se ofrece como evidencia')
})

