/**
 * La ranura de conversación de la mesa del experto (goal «capa Arbrain», punto 9 del HECHO), EJECUTADA: la conversación
 * real de la capa (`tools/capa`: el enrutador sin LLM, el «¿lo hago?» y su memoria), con la composición y el enchufe
 * reales de Soporte SAP, contra la ruta real de la mesa, con identidades de Access firmadas y el almacén en disco. Sin
 * modelo y sin red: cada respuesta sale de la mesa de quien habla.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lee } from './_ayuda.ts'
import { DIR, EXPERTO, OTRO, GET, POST, importa, pide } from './_mesa.mts'

const capa = await importa('tools/capa/dist/index.js')
const conv = await importa('src/features/soporte-sap/mesa/services/conversacion.ts')
const mesaConv = await importa('src/features/soporte-sap/mesa/services/conversacion-mesa.ts')
const { AlmacenCapaDeLaMesa, ES_PRIMER_ARRANQUE } = await importa('src/features/soporte-sap/mesa/services/almacen-capa.ts')

type Mensaje = { id: string; de: string; texto: string; estado?: string; intencion?: string }
type Conversacion = { envia(t: string): Promise<Mensaje>; contesta(id: string, si: boolean): Promise<Mensaje>; enrutador: { resuelve(t: string): { intencion: { id: string } | null } }; mensajes(): Mensaje[] }
type Almacen = { lee(c: string): Promise<string | null>; escribe(c: string, v: string): Promise<void>; claves(p: string): Promise<string[]>; datos?: Map<string, string> }

const COMPOSICION = JSON.parse(lee('productos/composiciones/soporte-sap.json'))
const ENCHUFE = JSON.parse(lee('src/features/soporte-sap/enchufe.json'))
const compuesto = capa.compone(COMPOSICION, [ENCHUFE])
assert.ok(compuesto.ok, `la composición de la mesa compone con su enchufe: ${JSON.stringify(compuesto.problemas ?? [])}`)
const PRODUCTO = compuesto.producto

/** El canal de la conversación con la ruta de Next llamada directamente, con el JWT de quien habla. */
function canalDe(token: string) {
  return mesaConv.canalHttp('/api/mesa/soporte-sap', async (url: string, init?: RequestInit) => {
    const consulta = new URL(url, 'http://mesa').search
    return init?.method === 'POST' ? POST(pide('POST', consulta, token, JSON.parse(String(init.body)))) : GET(pide('GET', consulta, token))
  })
}

function conversacionDe(token: string) {
  const navegador: Almacen = new capa.AlmacenEnMemoria()
  const almacen = new AlmacenCapaDeLaMesa(navegador)
  const memoria = capa.creaMemoria({ almacen, producto: 'soporte-sap', inquilino: 'mesa', permisos: PRODUCTO.permisos })
  const corridos: string[] = []
  const c: Conversacion = capa.creaConversacion({ intenciones: PRODUCTO.intenciones, manejadores: mesaConv.manejadoresDeLaMesa(canalDe(token), (x: { id: string }) => corridos.push(x.id)), memoria, nivel: 'lo-importante' })
  return { c, almacen, navegador, memoria, corridos }
}

/** Lo que dice el experto; si el asistente pregunta «¿lo hago?», contesta que sí, como el clic en «Sí». */
async function dice(c: Conversacion, texto: string): Promise<Mensaje> {
  const m = await c.envia(texto)
  return m.estado === 'pregunta' ? c.contesta(m.id, true) : m
}
const casosGuardados = (): string[] => { try { return readdirSync(join(DIR, 'mesa', 'casos')).sort() } catch { return [] } }
const guardado = (archivo: string) => JSON.parse(readFileSync(join(DIR, 'mesa', 'casos', archivo), 'utf8'))
const todoElAlmacen = (): string => {
  const lista = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? lista(join(d, e.name)) : [join(d, e.name)]))
  return lista(DIR).map((f) => readFileSync(f, 'utf8')).join('\n')
}

const FIORI = 'prueba este caso: la app de Fiori abre en blanco tras el transporte'
const LARGO = 'Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a todos los usuarios de la planta, y en el navegador no sale ningún mensaje.'

test('mesa · conversación: el enrutador de la capa (sin LLM) reconoce las tres intenciones, y nada de la memoria genérica', () => {
  const { c } = conversacionDe(EXPERTO)
  const id = (t: string) => c.enrutador.resuelve(t).intencion?.id ?? null
  assert.equal(id('prueba este caso'), 'soporte-sap.prueba-caso')
  assert.equal(id(FIORI), 'soporte-sap.prueba-caso', 'un caso corto detrás del pedido')
  assert.equal(id('vuelve a correr el último caso'), 'soporte-sap.prueba-caso')
  assert.equal(id('¿por qué dijiste no lo sé en el paso 3?'), 'soporte-sap.explica-paso')
  assert.equal(id('¿qué te faltó en el paso 3?'), 'soporte-sap.explica-paso')
  assert.equal(id('muéstrame lo que te enseñé'), 'soporte-sap.ensenado')
  assert.equal(id('¿qué te he enseñado?'), 'soporte-sap.ensenado')
  assert.equal(id('abre la mesa del experto'), 'soporte-sap.abre-mesa', 'las de antes siguen donde estaban')
  assert.equal(id('recuerda que los viernes cerramos a las dos'), null, 'la mesa no ofrece el «recuerda que…» de la capa: su memoria es su almacén')
  const deLaConversacion = Object.values(mesaConv.INTENCIONES_DE_LA_CONVERSACION).sort()
  assert.deepEqual(Object.keys(mesaConv.manejadoresDeLaMesa(canalDe(EXPERTO))).sort(), deLaConversacion, 'un manejador por intención, ni uno más')
  for (const i of ENCHUFE.intenciones.filter((x: { id: string }) => deLaConversacion.includes(x.id))) {
    assert.equal(i.irreversible, false, `${i.id}: nada de la conversación es irreversible`)
    assert.ok(!capa.pareceIrreversible(`${i.id} ${i.queHace}`), `${i.id} no suena a irreversible`)
  }
})

test('mesa · «prueba este caso: …» corre el caso escrito por el agente sin modelo, pregunta antes y lo guarda en SU almacén', async () => {
  const { c, corridos } = conversacionDe(EXPERTO)
  const antes = casosGuardados()
  const pregunta = await c.envia(FIORI)
  assert.equal(pregunta.estado, 'pregunta', 'correr un caso escribe en la mesa: con «lo importante», pregunta antes')
  assert.deepEqual(casosGuardados(), antes, 'sin el sí, no corre nada')
  const r = await c.contesta(pregunta.id, true)
  assert.equal(r.estado, 'hecho', r.texto)
  assert.match(r.texto, /Corrí tu caso \(S\/4HANA · Fiori\) con el agente de la mesa, sin modelo/)
  assert.match(r.texto, /Resultado: no lo sé/)
  assert.match(r.texto, /¿por qué dijiste no lo sé en el paso 3\?/, 'en el caso de Fiori, el «no lo sé» es el paso 3, como en la mesa')
  const nuevos = casosGuardados().filter((x) => !antes.includes(x))
  assert.equal(nuevos.length, 1)
  const caso = guardado(nuevos[0]!)
  assert.equal(caso.entrada.sintoma, 'la app de Fiori abre en blanco tras el transporte', 'se corre lo que escribió, sin el pedido')
  assert.equal(caso.entrada.modulo, 'Fiori')
  assert.equal(caso.resultado.tipo, 'sin_solucion')
  assert.equal(caso.pasos[2].etapa, 'busca')
  assert.deepEqual(corridos, [caso.id], 'la mesa (el lienzo) se entera del caso que corrió la conversación')
})

test('mesa · «¿por qué dijiste no lo sé en el paso 3?» lo explica desde la traza de la última corrida: qué faltaba', async () => {
  const { c } = conversacionDe(EXPERTO)
  await dice(c, FIORI)
  const r = await dice(c, '¿por qué dijiste no lo sé en el paso 3?')
  assert.equal(r.intencion, 'soporte-sap.explica-paso')
  assert.match(r.texto, /En el paso 3 \(«Busca en lo que sabe»\) de tu última corrida \(S\/4HANA · Fiori, del .+\), la traza dice: «No lo sé: no tiene una regla para este caso»/)
  assert.match(r.texto, /Qué faltaba: la regla\. Ninguna regla de lo que sé aplica a tu caso/)
  assert.match(r.texto, /Lo que sí tenía \(paso «Entiende el caso»\): módulo Fiori|Lo que sí tenía \(paso «Entiende el caso»\): sin módulo/)
  assert.match(r.texto, /enséñamelo en el caso/)
  const otro = await dice(c, 'explícame el paso 1')
  assert.match(otro.texto, /En el paso 1 .* no dije «no lo sé»\. La traza dice: «Incidencia inc-\d+/)
  assert.match(otro.texto, /El «no lo sé» fue en el paso 3 \(«Busca en lo que sabe»\)\. Qué faltaba: la regla/)
  assert.match((await dice(c, 'qué te faltó en el paso 40')).texto, /tiene \d+ pasos:\n1\. Recibe tu caso/, 'un paso que no existe: dice cuáles hay')
})

test('mesa · «muéstrame lo que te enseñé» lista lo de SU mesa: lo enseñado en sus casos, sus soluciones y sus validaciones', async () => {
  const { c } = conversacionDe(EXPERTO)
  await dice(c, FIORI)
  const ultimo = (await (await GET(pide('GET', '', EXPERTO))).json()).casos[0]
  const ensenanza = 'Hay que limpiar la caché del launchpad con /UI2/INVALIDATE_GLOBAL_CACHES y volver a entrar a la app'
  const e = await POST(pide('POST', '', EXPERTO, { tipo: 'ensena', caso: ultimo.id, texto: ensenanza }))
  assert.equal(e.status, 200)
  await POST(pide('POST', '', EXPERTO, { tipo: 'veredicto', caso: ultimo.id, valor: 'parcial', solucion: 'Invalidar la caché global del launchpad y recargar el catálogo de apps' }))
  await POST(pide('POST', '', EXPERTO, { tipo: 'valida_candidato', candidato: await candidatoMiro(), valoracion: 'corrige', correccion: 'MIRO es de MM: la verificación de facturas vive en MM y contabiliza en FI' }))
  const r = await dice(c, 'muéstrame lo que te enseñé')
  assert.equal(r.intencion, 'soporte-sap.ensenado')
  assert.match(r.texto, /En tus casos \(\d+\):\n• «Hay que limpiar la caché del launchpad/)
  assert.match(r.texto, /Quedó como propuesta de regla para el laboratorio/)
  assert.match(r.texto, /En tus veredictos, la solución correcta \(\d+\):\n• «Invalidar la caché global/)
  assert.match(r.texto, /Lo que validaste del conocimiento \(1\):\n• MIRO \(.+\): lo corregiste: «MIRO es de MM/)
  assert.match(r.texto, /Todo es propuesta: el laboratorio lo firma fuera de la mesa/)
})

/** El id del candidato de MIRO en el catálogo fijado (sin inventarlo). */
async function candidatoMiro(): Promise<string> {
  const v = await (await GET(pide('GET', '?vista=candidatos', EXPERTO))).json()
  return v.candidatos.find((x: { clave: string; tipo: string }) => x.tipo === 'tcode' && x.clave === 'MIRO').id as string
}

test('mesa · «vuelve a correr el último caso» corre el último de la mesa; un caso largo se prueba escribiéndolo antes del pedido', async () => {
  const { c } = conversacionDe(EXPERTO)
  const ultimo = (await (await GET(pide('GET', '', EXPERTO))).json()).casos[0]
  const antes = casosGuardados()
  const r = await dice(c, 'vuelve a correr el último caso')
  assert.match(r.texto, /^Volví a correr tu último caso de la mesa/)
  const nuevo = guardado(casosGuardados().filter((x) => !antes.includes(x))[0]!)
  assert.deepEqual(nuevo.entrada, ultimo.entrada, 'la misma entrada, otra corrida')
  // El enrutador mide el parecido con los ejemplos: un caso largo detrás del pedido ya no lo reconoce. Se escribe antes.
  assert.equal(c.enrutador.resuelve(`prueba este caso: ${LARGO}`).intencion, null, 'la limitación, medida: con un caso largo detrás, no hay intención')
  const noLoEntendio = await c.envia(LARGO)
  assert.equal(noLoEntendio.estado, 'no-se')
  const antesDelLargo = casosGuardados()
  const corrido = await dice(c, 'prueba este caso')
  assert.match(corrido.texto, /^Corrí tu caso \(S\/4HANA · Fiori\)/)
  assert.equal(guardado(casosGuardados().filter((x) => !antesDelLargo.includes(x))[0]!).entrada.sintoma, LARGO, 'corrió el caso que escribió justo antes')
})

test('mesa · un caso con forma de dato personal no se corre ni se guarda, y la respuesta no repite el dato', async () => {
  const { c } = conversacionDe(EXPERTO)
  const antes = casosGuardados()
  const r = await dice(c, 'prueba este caso: lo reportó juan.perez@empresa.com y la MIGO no contabiliza')
  assert.equal(r.estado, 'error')
  assert.match(r.texto, /forma de dato personal/)
  assert.ok(!r.texto.includes('juan.perez'), 'el motivo no repite el dato')
  assert.deepEqual(casosGuardados(), antes, 'no se guardó nada')
  assert.ok(!todoElAlmacen().includes('juan.perez'), 'en el almacén no está')
})

test('mesa · «borra mi último caso» no corre nada: el enrutador lo acerca a «prueba este caso», y borrar es del laboratorio', async () => {
  const { c } = conversacionDe(EXPERTO)
  await dice(c, FIORI)
  assert.equal(c.enrutador.resuelve('borra mi último caso').intencion?.id, 'soporte-sap.prueba-caso', 'la limitación, medida: el enrutador lo confunde')
  const antes = casosGuardados()
  const r = await dice(c, 'borra mi último caso')
  assert.equal(r.texto, conv.NO_BORRO)
  assert.deepEqual(casosGuardados(), antes, 'ni lo borró ni lo volvió a correr')
  assert.equal(conv.pideBorrar('prueba este caso: al quitar el bloqueo, la MIGO da M7 053'), false, 'solo se mira el disparo, no el caso')
  assert.equal(conv.pideBorrar('elimina este caso'), true)
})

test('mesa · cada quien ve SU mesa: otro experto no ve lo que enseñó ni las corridas del primero', async () => {
  await dice(conversacionDe(EXPERTO).c, FIORI) // el primero corre un caso aquí mismo: la prueba no depende de las de antes
  const { c } = conversacionDe(OTRO)
  assert.match((await dice(c, 'muéstrame lo que te enseñé')).texto, /^Todavía no me has enseñado nada en la mesa/)
  assert.match((await dice(c, '¿por qué dijiste no lo sé en el paso 3?')).texto, /^Todavía no has corrido ningún caso/)
  assert.match((await dice(c, 'prueba este caso')).texto, /^Todavía no hay casos en tu mesa/, 'sin caso escrito y sin casos, no corre el de otro')
})

test('mesa · lo que escribe el experto no se guarda en su navegador: solo el estado de la guía, sin texto', async () => {
  const { c, almacen, navegador, memoria } = conversacionDe(EXPERTO)
  await dice(c, FIORI)
  await dice(c, '¿por qué dijiste no lo sé en el paso 3?')
  await memoria.recuerda('capa', 'primer-arranque', { version: 1, terminado: true, paso: 4, nivel: 'solo-irreversible', voz: false, texto: 'la app de Fiori abre en blanco' })
  const enElNavegador = await navegador.claves('')
  assert.deepEqual(enElNavegador, ['capa/soporte-sap/mesa/capa/primer-arranque'], 'en el navegador solo la guía')
  assert.ok(ES_PRIMER_ARRANQUE.test(enElNavegador[0]!))
  assert.deepEqual(JSON.parse((await navegador.lee(enElNavegador[0]!))!), { version: 1, terminado: true, paso: 4, nivel: 'solo-irreversible', voz: false }, 'se reescribe con sus campos: el texto no pasa')
  const hilo = JSON.parse((await almacen.pestana.lee('capa/soporte-sap/mesa/capa/conversacion'))!)
  assert.ok(hilo.some((m: Mensaje) => m.texto === FIORI), 'la conversación está en la pestaña')
  for (const k of enElNavegador) assert.ok(!(await navegador.lee(k))!.includes('Fiori'), 'nada de lo que dijo')
  assert.ok(!todoElAlmacen().includes('por qué dijiste'), 'la conversación no llega al almacén de la mesa: solo los casos que corrió')
})

test('mesa · la conversación no abre superficie: solo pide a la API de la mesa, por las rutas que la puerta del Worker ya deja pasar', async () => {
  const puerta = await importa('scripts/laboratorio-alojado/puerta.ts')
  const pedidas: string[] = []
  const canal = mesaConv.canalHttp(undefined, async (url: string, init?: RequestInit) => {
    pedidas.push(`${init?.method ?? 'GET'} ${url}`)
    const consulta = new URL(url, 'http://mesa').search
    return init?.method === 'POST' ? POST(pide('POST', consulta, EXPERTO, JSON.parse(String(init.body)))) : GET(pide('GET', consulta, EXPERTO))
  })
  const m = mesaConv.manejadoresDeLaMesa(canal)
  const memoria = capa.creaMemoria({ almacen: new capa.AlmacenEnMemoria(), producto: 'soporte-sap', inquilino: 'mesa', permisos: {} })
  for (const [intencion, texto] of [['soporte-sap.prueba-caso', FIORI], ['soporte-sap.explica-paso', 'por qué dijiste no lo sé en el paso 3'], ['soporte-sap.ensenado', 'muéstrame lo que te enseñé']]) {
    await m[intencion]({ texto, intencion: PRODUCTO.intenciones.find((i: { id: string }) => i.id === intencion), memoria })
  }
  assert.deepEqual([...new Set(pedidas)].sort(), ['GET /api/mesa/soporte-sap', 'GET /api/mesa/soporte-sap?vista=candidatos', 'POST /api/mesa/soporte-sap'])
  for (const p of pedidas) assert.ok(puerta.RUTAS_DE_LA_MESA.test(new URL(p.split(' ')[1]!, 'http://mesa').pathname), `${p}: la puerta del Worker la deja pasar`)
})

test('mesa · la mesa no lleva voz: no declara motor y guarda datos sensibles, así que la ranura no se llena, tampoco con la nube', () => {
  assert.equal(PRODUCTO.voz.visible, false, PRODUCTO.voz.motivo)
  assert.deepEqual(PRODUCTO.voz.sale, [], 'nada de la voz sale de la máquina')
  assert.equal(COMPOSICION.datosSensibles, true, 'la mesa guarda lo que escribe el experto: datos sensibles de terceros')
  const conNube = capa.decideRanuraVoz({ stt: 'groq', tts: 'elevenlabs', vad: 'silero', nube: ['groq', 'elevenlabs'] }, { datosSensibles: COMPOSICION.datosSensibles })
  assert.equal(conNube.visible, false, 'aunque alguien le encendiera la nube, con datos sensibles no cuenta')
  assert.deepEqual(conNube.sale, [])
})

test('mesa · conversación, unidades: qué caso trae el pedido, de qué paso pregunta y qué faltaba', () => {
  assert.deepEqual(conv.cuerpoDelPedido('prueba este caso'), { caso: null, ultimo: false })
  assert.deepEqual(conv.cuerpoDelPedido('Prueba este caso: la MIGO da el mensaje M7 053'), { caso: 'la MIGO da el mensaje M7 053', ultimo: false })
  assert.deepEqual(conv.cuerpoDelPedido('corre este caso, la VA01 no deja grabar el pedido'), { caso: 'la VA01 no deja grabar el pedido', ultimo: false })
  assert.deepEqual(conv.cuerpoDelPedido('vuelve a correr el último caso'), { caso: null, ultimo: true })
  const { entrada, supuestos } = conv.entradaDelTexto('La MIGO da el mensaje M7 053 en ECC, sociedad 1000, periodo 2026/10')
  assert.deepEqual({ ...entrada, sintoma: undefined }, { sistema: 'ECC', modulo: 'MM', transaccion: 'MIGO', mensaje: 'M7 053', sociedad: '1000', periodo: '2026/10', sintoma: undefined, intento: '', muestras: [] })
  assert.deepEqual(supuestos, [])
  assert.deepEqual(conv.entradaDelTexto('no carga nada desde ayer en la mañana').supuestos, ['el sistema es S/4HANA (no lo dijiste)', 'el módulo es «Otro» (no lo reconocí)'])
  assert.equal(conv.transaccionDelTexto('falla /UI2/INVALIDATE_GLOBAL_CACHES'), '/UI2/INVALIDATE_GLOBAL_CACHES')
  assert.equal(conv.mensajeDelTexto('el ticket es P2 123 y sale M7 053'), 'M7 053', 'una prioridad no es un mensaje')
  for (const [t, n] of [['¿por qué dijiste no lo sé en el paso 3?', 3], ['qué pasó en el tercer paso', 3], ['explícame el paso dos', 2], ['el 4.º paso', 4], ['por qué dijiste no lo sé', null]] as const) assert.equal(conv.pasoPedido(t), n, t)
  const base = { entrada: { sistema: 'S4HANA', modulo: 'MM', transaccion: 'MIGO', mensaje: '', sociedad: '', periodo: '', sintoma: 'x'.repeat(12), intento: '', muestras: [] }, creado: '2026-10-25T10:00:00.000Z', pasos: [{ etapa: 'recibe', titulo: 'Recibe tu caso', sale: 'Incidencia inc-001' }, { etapa: 'entiende', titulo: 'Entiende el caso', sale: 'módulo MM · prioridad P3' }, { etapa: 'busca', titulo: 'Busca en lo que sabe', sale: 'Encontró una regla, pero su grado no alcanza para aplicarla: X (R-1)' }], sandbox: null, planes: [] }
  const grado = { ...base, resultado: { tipo: 'grado_insuficiente', regla: 'R-1', titulo: 'X', resumen: null, cita: 'nota interna 1', url: null, grado: 'experimental', razon: 'X (nota interna 1)' } }
  assert.equal(conv.faltaEn(grado).falta, 'umbral')
  assert.match(conv.explicaPaso(grado, 3), /Qué faltaba: el umbral\. Encontré la regla «X» \(R-1\), con su fuente \(nota interna 1\), pero su grado es «experimental»/)
  const duda = { ...base, resultado: { tipo: 'sin_solucion', regla: null, titulo: null, resumen: null, cita: null, url: null, grado: null, razon: 'clasificacion dudosa: las palabras de la pregunta apuntan a a y el parser a b' } }
  assert.equal(conv.faltaEn(duda).falta, 'categoria')
  const sinFuente = { ...base, resultado: { tipo: 'solucion', regla: 'R-2', titulo: 'Y', resumen: null, cita: '', url: null, grado: 'validada', razon: '' } }
  assert.equal(conv.faltaEn(sinFuente).falta, 'fuente')
  assert.equal(conv.faltaEn({ ...base, resultado: { ...sinFuente.resultado, cita: 'nota 9' } }), null, 'con regla y fuente, no faltó nada')
})
