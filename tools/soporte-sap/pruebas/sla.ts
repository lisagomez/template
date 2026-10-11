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
  relojSla, contratoDeLaboratorio, contratoN1N2DeLaboratorio, nuevaVersion, vigenteEn, generaCorpus, respuestaDelLaboratorio, type EventoSla, type Corte,
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
  assert.match(reloj, /Un incumplimiento que \*\*ya ocurrió\*\* con la prioridad\s+anterior se queda/, 'R3-02: bajar la prioridad no lo borra')
  assert.match(escala, /cuando \*\*la consultora\*\* lo escala, a su nombre[^\n]*Un agente no escala/, 'DP-3')
  assert.match(transparencia, /\*\*agregados de operación\*\*/, 'lo que ve el laboratorio además de lo escalado')
  assert.doesNotMatch(transparencia, /revisa una persona/, 'la cuarentena no la revisa nadie: es definitiva (D14)')
  assert.match(reloj, /\(\*\*modo despacho\*\*\)[\s\S]*la medición \*\*no es evidencia independiente\*\*/, 'el root ajeno: el SLA de ese modo no se ofrece como evidencia')
})

test('R3-02 · bajar la prioridad después de vencer la meta no borra el incumplimiento', () => {
  const k = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
  const base = [ev('RECIBIDA', '2026-09-21', '10:00'), ev('PRIMERA_RESPUESTA', '2026-09-21', '11:40')]
  const sinCambio = relojSla(base, 'P1', k, mx('2026-09-30', '23:00'))
  assert.equal(sinCambio.cumpleRespuesta, false, 'una P1 respondida a los 100 min incumple')
  const bajada = relojSla([...base, { ...ev('CAMBIO_PRIORIDAD', '2026-09-21', '12:00'), prioridad: 'P3' as const }], 'P1', k, mx('2026-09-30', '23:00'))
  assert.deepEqual([bajada.prioridad, bajada.cumpleRespuesta, bajada.incumplidaAntesDelCambio], ['P3', false, true], 'bajarla a P3 después no lo borra')
  const aTiempo = relojSla([ev('RECIBIDA', '2026-09-21', '10:00'), ev('PRIMERA_RESPUESTA', '2026-09-21', '10:30'), { ...ev('CAMBIO_PRIORIDAD', '2026-09-21', '12:00'), prioridad: 'P3' as const }], 'P1', k, mx('2026-09-30', '23:00'))
  assert.equal(aTiempo.incumplidaAntesDelCambio, false, 'control: respondida a tiempo, el cambio no inventa un incumplimiento')
})

test('el tramo en curso se ve aunque dure cero: el corte en el mismo instante que la respuesta del cliente', () => {
  const k = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
  const corte = mx('2026-09-21', '11:30')
  const r = relojSla([ev('RECIBIDA', '2026-09-21', '10:00'), ev('ESPERA_CLIENTE', '2026-09-21', '11:00'), ev('RESPUESTA_CLIENTE', '2026-09-21', '11:30')], 'P3', k, corte)
  assert.deepEqual(r.tramos.map((x) => `${x.estado}:${x.porque}`), ['corre:RECIBIDA', 'pausa:ESPERA_CLIENTE', 'corre:RESPUESTA_CLIENTE'])
})

test('D1 · el contrato dice qué es el núcleo común: generalizado, del superadministrador, con el sí de las dos partes, y qué pasa al revocar', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d1 = p.slice(p.indexOf('## 12. Conocimiento común'), p.indexOf('## 13.'))
  assert.match(d1, /sube \*\*generalizado\*\*/, 'generalizado')
  assert.match(d1, /lo \*\*consintieron las dos partes\*\*: la consultora en su contrato N1–N2 y su cliente en el suyo N2–N3/, 'las dos partes')
  assert.match(d1, /para la versión vigente de su contrato/, 'DP-3')
  assert.match(d1, /Revocar frena lo que todavía no ha subido; lo que\s+ya subió, generalizado, \*\*se queda\*\*/, 'DP-1')
  assert.match(d1, /no dice de qué consultora ni de qué cliente vino/, 'el origen no viaja')
})

test('D6 · el contrato dice que el producto no se conecta al SAP del cliente ni guarda sus credenciales, y quién aplica la solución', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d6 = p.slice(p.indexOf('## 13. Soluciones en el SAP del cliente'), p.indexOf('## 14.'))
  assert.match(d6, /El producto \*\*no se conecta a ningún SAP\*\* del cliente ni guarda sus credenciales/, 'sin conector')
  assert.match(d6, /se aplica a un \*\*SAP simulado\*\*: el antes y el después que se muestran son los de ese simulador/, 'el antes y el después son del simulador')
  assert.match(d6, /lo hace \*\*una persona\*\*, de la consultora o del propio cliente, con \*\*su\s+propio acceso\*\* y bajo el \*\*control de cambios del cliente\*\*, fuera del producto/, 'quién la aplica')
  assert.match(d6, /El laboratorio no aplica soluciones en el SAP de ningún\s+cliente/, 'el laboratorio, tampoco (D3)')
  assert.match(d6, /No se comparten contraseñas ni otras credenciales de SAP por el producto/, 'las credenciales no pasan por el producto')
})

test('D7 · el contrato dice que el texto del cliente no va a un proveedor externo de modelos, y qué puede ir', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d7 = p.slice(p.indexOf('## 11. Datos personales y transparencia'), p.indexOf('## 12.'))
  assert.match(d7, /El texto de sus incidencias, del chat y de sus documentos \*\*no se envía a ningún proveedor externo de modelos de\s+IA\*\*/, 'lo crudo no sale')
  assert.match(d7, /Si un modelo lo procesa, corre en un servidor de quien opera el servicio/, 'autohospedado')
  assert.match(d7, /solo puede ir\s+lo ya anonimizado o generalizado, con un contrato que le prohíbe conservarlo o entrenar con él/, 'lo anonimizado, con contrato')
})

test('D8 · el contrato dice cuándo se borran los originales, qué pasa al salir y en cuánto llega el borrado a los respaldos', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d8 = p.slice(p.indexOf('## 14. Retención y salida de los datos'), p.indexOf('## 15.'))
  assert.match(d8, /\*\*\[POR DECIDIR: N\] días después de la última resolución\*\*/, 'N lo decide el laboratorio (DP-4)')
  assert.match(d8, /Mientras haya una impugnación abierta, no se borran/, 'DP-3')
  assert.match(d8, /La salida la registra \*\*una persona\*\* del cliente o de su consultora[\s\S]*un agente no la registra/, 'DP-2')
  assert.match(d8, /lo del cliente \*\*no cambia más\*\*/, 'el congelamiento')
  assert.match(d8, /\*\*export firmado\*\* de lo suyo, que es el último/, 'el export')
  assert.match(d8, /Terminada la gracia se borra todo lo del cliente, el export incluido/, 'tras la gracia')
  assert.match(d8, /el borrado llega a todas las copias \*\*en un máximo de 12 meses\*\*/, 'DP-1: el plazo máximo en los respaldos')
  assert.match(d8, /no entran al archivo legal de varios años/, 'DP-1: fuera del archivo anual')
  assert.match(d8, /\*\*Una restauración nunca devuelve lo borrado\*\*/, 'la lista de bajas')
  assert.match(d8, /Mientras el contrato no diga N, no se borra\s+ningún original[\s\S]*Mientras el\s+contrato no diga la gracia, no se borra nada/, 'sin plazos, nada se borra')
})

test('D10 · el contrato dice dónde viven los datos: en Estados Unidos en el modo gestionado, y cómo quedarse en México', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d10 = p.slice(p.indexOf('## 11. Datos personales y transparencia'), p.indexOf('## 12.'))
  assert.match(d10, /la base y los archivos viven\s+en un proveedor de base de datos gestionada, \*\*en Estados Unidos\*\* \(Virginia\)/, 'dónde, en gestionado')
  assert.match(d10, /que los guarda por encargo de quien\s+opera el servicio/, 'quién los guarda')
  assert.match(d10, /se queden \*\*en México\*\*, el servicio\s+se opera en una máquina de su consultora \(modo despacho\)/, 'cómo quedarse en México')
  assert.match(d10, /\[POR DECIDIR: aviso de privacidad, responsable y encargado, transferencias — redacción legal\]/, 'la redacción legal de la transferencia sigue pendiente')
})

test('D12 · el contrato dice que las copias de respaldo salen cifradas a otro proveedor y que nadie las borra antes de su bloqueo', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d12 = p.slice(p.indexOf('## 11. Datos personales y transparencia'), p.indexOf('## 12.'))
  assert.match(d12, /Las \*\*copias de respaldo\*\* salen \*\*cifradas\*\* a otro proveedor, también en\s+Virginia, que no puede leerlas/, 'cifradas, en otro proveedor')
  assert.match(d12, /nadie las borra antes de que venza su bloqueo \(§14\)/, 'inmutables hasta su bloqueo')
})

test('D13 · la respuesta del laboratorio va de la escalada a su primera decisión en la sala; sin escalada no hay reloj', () => {
  const e = (tipo: string, hhmm: string) => ({ tipo, fecha: `2026-10-11T${hhmm}:00.000Z` })
  assert.equal(respuestaDelLaboratorio([e('RECIBIDA', '10:00'), e('PLAN_PREPARADO', '10:01')], '2026-10-11T12:00:00.000Z'), null, 'sin escalada, nada')
  const espera = respuestaDelLaboratorio([e('RECIBIDA', '10:00'), e('ESCALADA', '10:30')], '2026-10-11T11:15:00.000Z')
  assert.deepEqual(espera, { escaladaEn: '2026-10-11T10:30:00.000Z', respondidaEn: null, minutos: 45 }, 'sin respuesta, cuenta hasta ahora')
  const resp = respuestaDelLaboratorio([e('RECIBIDA', '10:00'), e('ESCALADA', '10:30'), e('NOTA', '10:40'), e('A_REVISION', '11:00'), e('APROBADA', '11:30')], '2026-10-11T12:00:00.000Z')
  assert.deepEqual([resp?.respondidaEn, resp?.minutos], ['2026-10-11T11:00:00.000Z', 30], 'la primera decisión, aunque sea pedir revisión; una nota no lo es')
  assert.match(contratoN1N2DeLaboratorio('andina', '2026-04-01').notas.join('\n'), /D13: se mide en la cadena/)
})

test('D13 · el contrato dice qué compromete el laboratorio: solo la respuesta a lo escalado, con su cifra hasta GATE 3', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d13 = p.slice(p.indexOf('## 6. Escalamiento'), p.indexOf('## 7.'))
  assert.match(d13, /solo su \*\*respuesta a lo que la consultora le escala\*\*/, 'qué')
  assert.match(d13, /hasta la \*\*primera decisión de una persona del laboratorio en la sala\*\*/, 'cómo se mide')
  assert.match(d13, /Un caso escalado sin plan en la sala no tiene ese\s+reloj/, 'la brecha, dicha')
  assert.match(d13, /\[POR\s+DECIDIR hasta GATE 3\]/, 'la cifra, en blanco')
})

test('D14 · el contrato le dice al cliente qué agregados ve el laboratorio (3 clientes o más) y que la cuarentena no la revisa nadie', () => {
  const p = readFileSync(join(HERRAMIENTA, 'contratos', 'plantilla-contrato-sla.md'), 'utf8')
  const d14 = p.slice(p.indexOf('## 11. Datos personales y transparencia'), p.indexOf('## 12.'))
  assert.match(d14, /solo de grupos de \*\*3 clientes o más\*\*: no ve el de un grupo más chico, ni uno\s+que lo dejaría despejar restando del total/)
  assert.match(d14, /La \*\*cuarentena\*\* no la revisa nadie, tampoco el laboratorio/)
})
