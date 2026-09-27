/**
 * Recepcion con foto de la caducidad, de punta a punta en el nucleo: la revision abierta no
 * existe para el inventario (no se mueve, vende, transfiere ni surte), la confirma quien la
 * registro, lo leido contra lo confirmado queda en la cadena con la huella de la foto, y la
 * cadena y el anclaje siguen verificando. Mas: CORRECCION con foto, vinculo de un GTIN
 * desconocido, fotos del articulo y el formato aprendido.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  abreRevision, bloqueoPorRevision, CATEGORIAS_EJEMPLO, centralVacio, completaClave, confirmaRevision, corrige, descartaRevision, estadoVacio, esErrorLectura, expedienteDe,
  formatoDe, fotoVigente, huellaDeBytes, huellasReferidas, interpreta, medicionEnUso, metadatosDeJpeg, mueveConExpediente, parseaLectura, preparaAncla,
  proponCaducidad, proyecta, pruebaDeEvento, recibeAncla, registraFoto, registraLlave, rechazoDeImagen, revisionesAbiertas, salida, tipoDeImagen, transfiere,
  verificaCadena, verificaPruebaEvento, verificaSitio, vinculaGtin, type EstadoAlmacen, type Evento, type Paso,
} from '../dist/index.js'
import { fotosEnCarpeta } from '../dist/almacenes/fotos.js'
import { preparaImagenes, type FabricaImagen } from '../dist/imagenes.js'
import { motorPorProceso, validaSalida } from '../dist/motores/proceso.js'
import { firmaAncla, generaLlaves, idLlave, verificador } from '../dist/firma.js'

const HOY = '2026-09-27'
const t = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 27, h, m)).toISOString()
const SITIOS = [{ clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis' as const }, { clave: 'SUC-CENTRO', nombre: 'Sucursal Centro', tipo: 'sucursal' as const }]
const G_PIEZA = '07501031302741'
const G_CAJA = '17501031302748'
const QUIEN = 'op-0a1b2c3d'
const OTRO = 'op-99aa88bb'
const FOTO = `sha256:${'a'.repeat(64)}`
const RECORTE = `sha256:${'b'.repeat(64)}`
const base = (): EstadoAlmacen => ({
  ...estadoVacio({ sitios: SITIOS, categorias: CATEGORIAS_EJEMPLO }),
  articulos: {
    'REF-600': { sku: 'REF-600', descripcion: 'Refresco de cola 600 ml', categoria: 'bebidas', sitios: ['CEDIS-NTE', 'SUC-CENTRO'], marcaPropia: false, gtinUnidad: G_PIEZA, reglaUnidad: 'fabricante', gtinCaja: G_CAJA, reglaCaja: 'fabricante', unidadesPorCaja: 12, vidaUtilDias: 270, notas: [] },
    'DUL-001': { sku: 'DUL-001', descripcion: 'Gomitas 1 kg', categoria: 'general', sitios: ['CEDIS-NTE'], marcaPropia: false, gtinCaja: '04000000000013', reglaCaja: 'interno', unidadesPorCaja: 10, notas: [] },
  },
})
function ok<T>(p: Paso<T>): { estado: EstadoAlmacen; valor: T; eventos: readonly Evento[] } {
  assert.ok(p.resultado.ok, p.resultado.ok ? '' : p.resultado.motivo)
  return { estado: p.estado, valor: p.resultado.valor, eventos: p.resultado.eventos }
}
const propuesta = (texto: string) => proponCaducidad([{ motor: 'rapidocr-onnxruntime-1.4.4/ppocrv4', ms: 800, lineas: [{ texto }] }], { hoy: HOY, vidaUtilDias: 270 })
const abre = (e: EstadoAlmacen, texto = 'CAD 30/05/27 L4471', operador = QUIEN, folio = 'REV-0001', extra = {}) =>
  ok(abreRevision(e, { sitio: 'CEDIS-NTE', sku: 'REF-600', cajas: 20, codigo: { gtin: G_PIEZA, nivel: 'unidad', formato: 'ean-13' }, fotos: { completa: FOTO, recortes: [RECORTE] }, propuesta: propuesta(texto), ...extra }, t(10), folio, operador))
const lectura = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }

test('abrir la revision: EN_REVISION en la cadena con la foto y la propuesta, y CERO cajas en el inventario', () => {
  const r = abre(base())
  const ev = r.eventos[0]!
  assert.deepEqual([ev.tipo, ev.lote.lote, ev.lote.caducidad, ev.datos['cambios']], ['EN_REVISION', 'REV-0001', '', []])
  assert.deepEqual((ev.datos['fotos'] as { completa: string }).completa, FOTO)
  assert.deepEqual((ev.datos['propuesta'] as { fecha: string; lote: string }), { ...(ev.datos['propuesta'] as object), fecha: '2027-05-30', lote: 'L4471' })
  assert.equal(r.estado.existencias.length, 0, 'por confirmar no es inventario: no entra al FEFO ni al semaforo')
  assert.deepEqual(proyecta('CEDIS-NTE', r.estado.eventos!['CEDIS-NTE']!).renglones, [], 'la proyeccion tampoco la cuenta')
  assert.equal(revisionesAbiertas(r.estado).length, 1)
})

test('una revision abierta NO se mueve, vende ni transfiere: el servidor lo rechaza y dice por que', () => {
  const r = abre(base())
  const mover = mueveConExpediente(r.estado, { sitio: 'CEDIS-NTE', destino: 'piso', lectura: lectura(r.estado, G_PIEZA.slice(1)), veces: 1, operador: QUIEN }, t(11), 'm1', HOY)
  assert.ok(!mover.resultado.ok && /caducidad por confirmar: 20 caja\(s\) de «Refresco de cola 600 ml»/.test(mover.resultado.motivo), mover.resultado.ok ? '' : mover.resultado.motivo)
  const etiquetaCasa = mueveConExpediente(r.estado, { sitio: 'CEDIS-NTE', destino: 'piso', lectura: lectura(r.estado, `(01)${G_CAJA}(17)270530(10)L4471`), veces: 1, operador: QUIEN }, t(11), 'm2', HOY)
  assert.ok(!etiquetaCasa.resultado.ok && etiquetaCasa.resultado.motivo.startsWith('caducidad por confirmar'))
  const vende = salida(r.estado, { sitio: 'CEDIS-NTE', tipo: 'VENDIDO', lote: { gtin: G_CAJA, lote: 'L4471', caducidad: '2027-05-30' }, cajas: 1 }, HOY, t(11), QUIEN)
  assert.ok(!vende.resultado.ok && vende.resultado.motivo.startsWith('caducidad por confirmar'))
  const lleva = transfiere(r.estado, { origen: 'CEDIS-NTE', destino: 'SUC-CENTRO', lote: { gtin: G_CAJA, lote: 'L4471', caducidad: '2027-05-30' }, cajas: 1 }, HOY, t(11), 'tr1', QUIEN)
  assert.ok(!lleva.resultado.ok && lleva.resultado.motivo.startsWith('caducidad por confirmar'))
  assert.match(bloqueoPorRevision(r.estado, 'CEDIS-NTE', G_CAJA, t(12, 30))!, /\(hace 2 h\)/)
})

test('la confirma QUIEN LA REGISTRO; confirmada, entra con lo leido contra lo confirmado y la huella de la foto, y ya se mueve', () => {
  const r = abre(base())
  const rev = r.eventos[0]!.hash
  const ajeno = confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: rev, caducidad: '2027-05-30', lote: 'L4471' }, HOY, t(11), 'c0', OTRO)
  assert.ok(!ajeno.resultado.ok && /quien registró/.test(ajeno.resultado.motivo))
  const c = ok(confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: rev, caducidad: '2027-05-30', lote: 'L4471' }, HOY, t(11), 'c1', QUIEN))
  const recibido = c.eventos[0]!
  const l = recibido.datos['lectura'] as { fotos: { completa: string }; propuesta: { fecha: string }; confirmada: { caducidad: string }; corregida: { fecha: boolean; lote: boolean }; motor: string }
  assert.deepEqual([recibido.tipo, recibido.datos['revision'], l.fotos.completa, l.propuesta.fecha, l.confirmada.caducidad, l.corregida, l.motor], ['RECIBIDO', rev, FOTO, '2027-05-30', '2027-05-30', { fecha: false, lote: false }, 'rapidocr-onnxruntime-1.4.4/ppocrv4'])
  assert.deepEqual([c.estado.existencias[0]?.gtin, c.estado.existencias[0]?.lote, c.estado.existencias[0]?.caducidad, c.estado.existencias[0]?.cantidad], [G_CAJA, 'L4471', '2027-05-30', 20])
  assert.equal(revisionesAbiertas(c.estado).length, 0)
  assert.ok(verificaCadena('CEDIS-NTE', c.estado.eventos!['CEDIS-NTE']!).ok)
  assert.deepEqual(expedienteDe(c.estado.eventos!, recibido.lote).map((e) => e.tipo), ['EN_REVISION', 'RECIBIDO'], 'el expediente trae la revision por su enlace')
  const mueve = mueveConExpediente(c.estado, { sitio: 'CEDIS-NTE', destino: 'piso', lectura: lectura(c.estado, `(01)${G_CAJA}(17)270530(10)L4471`), veces: 2, operador: QUIEN }, t(12), 'm3', HOY)
  assert.ok(mueve.resultado.ok, mueve.resultado.ok ? '' : mueve.resultado.motivo)
})

test('CORREGIR: lo calcula el servidor (no el navegador) y el formato elegido se APRENDE para el articulo', () => {
  const r = abre(base(), 'CAD 241127 L0503')
  const p = r.eventos[0]!.datos['propuesta'] as { estado: string }
  assert.equal(p.estado, 'ambigua')
  const c = ok(confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: r.eventos[0]!.hash, caducidad: '2027-11-24', lote: 'L0503', formato: 'DDMMAA', tipo: 'caducidad' }, HOY, t(11), 'c2', QUIEN))
  assert.deepEqual((c.eventos[0]!.datos['lectura'] as { corregida: object }).corregida, { fecha: true, lote: false }, 'ambigua sin fecha propuesta: la fecha la puso la persona')
  assert.deepEqual([formatoDe(c.estado, 'REF-600')?.formato, formatoDe(c.estado, 'REF-600')?.evento], ['DDMMAA', c.eventos[0]!.hash])
  const segunda = proponCaducidad([{ motor: 'x-1', ms: 1, lineas: [{ texto: 'CAD 051227' }] }], { hoy: HOY, aprendido: formatoDe(c.estado, 'REF-600')! })
  assert.deepEqual([segunda.estado, segunda.fecha], ['propuesta', '2027-12-05'])
  const d = ok(confirmaRevision(abre(c.estado, 'CAD 30/05/27 L4471', QUIEN, 'REV-0002').estado, { sitio: 'CEDIS-NTE', revision: revisionesAbiertas(abre(c.estado, 'CAD 30/05/27 L4471', QUIEN, 'REV-0002').estado)[0]!.evento.hash, caducidad: '2027-05-31', lote: 'L4472' }, HOY, t(12), 'c3', QUIEN))
  assert.deepEqual((d.eventos[0]!.datos['lectura'] as { corregida: object }).corregida, { fecha: true, lote: true })
  assert.deepEqual(medicionEnUso(d.estado).map((x) => [x.formato, x.tal, x.corregidas]).sort(), [['DD/MM/AA', 0, 1], ['DDMMAA', 0, 1]])
})

test('la regla de recepcion se aplica sobre la fecha CONFIRMADA: vencida → RECHAZADO con devolucion, y la revision se cierra', () => {
  const r = abre(base(), 'CAD 20/09/26 L1')
  const c = ok(confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: r.eventos[0]!.hash, caducidad: '2026-09-20', lote: 'L1' }, HOY, t(11), 'c4', QUIEN))
  assert.deepEqual([c.eventos[0]!.tipo, c.eventos[0]!.datos['revision'], c.valor.rechazada?.regla], ['RECHAZADO', r.eventos[0]!.hash, 'vencido: no se recibe'])
  assert.equal(c.estado.existencias.length, 0)
  assert.equal(revisionesAbiertas(c.estado).length, 0)
})

test('tomar otra foto REEMPLAZA la toma anterior; descartar cierra con motivo; nada queda abierto de mas', () => {
  const r = abre(base())
  const otra = abre(r.estado, 'CAD 31/05/27 L4471', QUIEN, 'REV-0002', { reemplaza: r.eventos[0]!.hash })
  assert.deepEqual(revisionesAbiertas(otra.estado).map((x) => x.folio), ['REV-0002'])
  const ajena = abreRevision(otra.estado, { sitio: 'CEDIS-NTE', sku: 'REF-600', cajas: 1, codigo: { gtin: G_PIEZA, nivel: 'unidad' }, fotos: { completa: FOTO, recortes: [] }, propuesta: propuesta('x'), reemplaza: otra.eventos[0]!.hash }, t(11), 'REV-0003', OTRO)
  assert.ok(!ajena.resultado.ok)
  const d = ok(descartaRevision(otra.estado, { sitio: 'CEDIS-NTE', revision: otra.eventos[0]!.hash, motivo: 'era otro producto' }, t(12), OTRO))
  assert.deepEqual([d.eventos[0]!.tipo, d.eventos[0]!.datos['descartada'], revisionesAbiertas(d.estado).length], ['RECHAZADO', true, 0])
})

test('cadena Y ANCLAJE: la revision y su confirmacion se anclan, cada una prueba su inclusion, y alterar la propuesta se delata', () => {
  const r = abre(base())
  const c = ok(confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: r.eventos[0]!.hash, caducidad: '2027-05-30', lote: 'L4471' }, HOY, t(11), 'c5', QUIEN))
  const eventos = c.estado.eventos!['CEDIS-NTE']!
  const llaves = generaLlaves()
  const id = idLlave(llaves.publica)
  const verifica = verificador({ [id]: llaves.publica })
  const central0 = registraLlave(centralVacio(), 'CEDIS-NTE', { id, publica: llaves.publica, registrada: t(9) }, t(9))
  const r1 = recibeAncla(central0, firmaAncla(preparaAncla('CEDIS-NTE', eventos, [], HOY, t(23))!, llaves.privada), verifica, t(23))
  assert.ok(r1.ok, r1.motivo)
  const anclas = r1.central.anclas['CEDIS-NTE']!
  assert.equal(verificaSitio('CEDIS-NTE', eventos, anclas, id, verifica).ok, true)
  for (const e of eventos) assert.ok(verificaPruebaEvento(e, pruebaDeEvento(e, eventos, anclas)!), e.tipo)
  const manipulada = eventos.map((e) => (e.tipo === 'EN_REVISION' ? { ...e, datos: { ...e.datos, propuesta: { fecha: '2027-05-31' } } } : e))
  const inf = verificaSitio('CEDIS-NTE', manipulada, anclas, id, verifica)
  assert.equal(inf.ok, false, 'reescribir lo que propuso la maquina rompe el hash del evento')
  assert.equal(inf.cadena.rotura?.seq, 1)
})

test('CORRECCION con foto nueva: la evidencia va en la cadena y el expediente ensena las dos lecturas y las dos fotos', () => {
  const r = abre(base())
  const c = ok(confirmaRevision(r.estado, { sitio: 'CEDIS-NTE', revision: r.eventos[0]!.hash, caducidad: '2027-05-30', lote: 'L4471' }, HOY, t(11), 'c6', QUIEN))
  const nueva = `sha256:${'c'.repeat(64)}`
  const mala = corrige(c.estado, { sitio: 'CEDIS-NTE', corrige: c.eventos[0]!.hash, motivo: 'la fecha real es 03/05', caducidad: '2027-05-03', evidencia: { fotos: { completa: '../../etc/passwd', recortes: [] } } }, t(13), 'k0', QUIEN)
  assert.ok(!mala.resultado.ok)
  const k = ok(corrige(c.estado, { sitio: 'CEDIS-NTE', corrige: c.eventos[0]!.hash, motivo: 'la fecha real es 03/05 (se leyó un 3 como 30)', caducidad: '2027-05-03', evidencia: { fotos: { completa: nueva, recortes: [RECORTE] }, texto: 'CAD 03/05/27' } }, t(13), 'k1', QUIEN))
  const ev = k.eventos[0]!
  assert.deepEqual([ev.tipo, (ev.datos['evidencia'] as { fotos: { completa: string } }).fotos.completa, ev.datos['caducidadNueva']], ['CORRECCION', nueva, '2027-05-03'])
  const exp = expedienteDe(k.estado.eventos!, { gtin: G_CAJA, lote: 'L4471', caducidad: '2027-05-03' })
  assert.deepEqual(exp.map((e) => e.tipo), ['EN_REVISION', 'RECIBIDO', 'CORRECCION'])
  assert.ok(huellasReferidas(k.estado).has(FOTO) && huellasReferidas(k.estado).has(nueva))
  assert.ok(verificaCadena('CEDIS-NTE', k.estado.eventos!['CEDIS-NTE']!).ok)
})

test('GTIN desconocido: se vincula con traza (fabricante, sustituye al interno); el mismo GTIN a otro articulo es CONFLICTO', () => {
  const e = base()
  const nuevo = '17506475123614'
  const v = vinculaGtin(e, { sku: 'DUL-001', gtin: nuevo, nivel: 'caja' }, 'Rosa', t(10), 'v1')
  assert.ok(v.resultado.ok)
  const a = v.estado.asignaciones.at(-1)!
  assert.deepEqual([v.estado.articulos['DUL-001']?.gtinCaja, v.estado.articulos['DUL-001']?.reglaCaja, a.regla, a.anterior, a.importacion], [nuevo, 'fabricante', 'fabricante', '04000000000013', 'vinculo-v1'])
  const dos = vinculaGtin(v.estado, { sku: 'REF-600', gtin: nuevo, nivel: 'caja' }, 'Rosa', t(11), 'v2')
  assert.ok(!dos.resultado.ok && /ya es del artículo DUL-001/.test(dos.resultado.motivo))
  const fabricante = vinculaGtin(v.estado, { sku: 'REF-600', gtin: completaClave('1750000000002'), nivel: 'caja' }, 'Rosa', t(11), 'v3')
  assert.ok(!fabricante.resultado.ok && /decisión de catálogo/.test(fabricante.resultado.motivo), 'un GTIN de fabricante no se cambia desde el anden')
  const propio = vinculaGtin({ ...v.estado, articulos: { ...v.estado.articulos, 'DUL-001': { ...v.estado.articulos['DUL-001']!, marcaPropia: true } } }, { sku: 'DUL-001', gtin: completaClave('750987654321'), nivel: 'unidad' }, 'Rosa', t(11), 'v4')
  assert.ok(!propio.resultado.ok && /prefijo ajeno/.test(propio.resultado.motivo))
})

test('fotos del articulo: la vigente es la ultima, cambiarla no borra la anterior, y la de caducidad lleva su nota', () => {
  let e = base()
  const f1 = `sha256:${'1'.repeat(64)}`
  const f2 = `sha256:${'2'.repeat(64)}`
  for (const [huella, vista, nota] of [[f1, 'principal', undefined], [f2, 'principal', undefined], [f1, 'caducidad', 'cuello, por encima del líquido']] as const) {
    const r = registraFoto(e, { sku: 'REF-600', vista, huella, ...(nota ? { nota } : {}), operador: QUIEN, fecha: t(9) })
    assert.ok(r.resultado.ok)
    e = r.estado
  }
  assert.equal(fotoVigente(e, 'REF-600')?.huella, f2)
  assert.equal(fotoVigente(e, 'REF-600', 'caducidad')?.nota, 'cuello, por encima del líquido')
  assert.equal(e.fotos!.filter((f) => f.vista === 'principal').length, 2, 'la anterior sigue en el historial')
  const quita = registraFoto(e, { sku: 'REF-600', vista: 'principal', huella: '', retirada: true, operador: QUIEN, fecha: t(10) })
  assert.ok(quita.resultado.ok)
  assert.equal(fotoVigente(quita.estado, 'REF-600'), undefined)
  assert.ok(!registraFoto(e, { sku: 'NO-EXISTE', vista: 'principal', huella: f1, operador: QUIEN, fecha: t(9) }).resultado.ok)
})

const sharpInyectado = sharp as unknown as FabricaImagen

test('fotos: SVG, HTML y lo vacio se rechazan por sus bytes; EXIF y GPS salen al normalizar; la orientacion se aplica', async () => {
  assert.match(rechazoDeImagen(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'))!, /SVG/)
  assert.match(rechazoDeImagen(new TextEncoder().encode('<?xml version="1.0"?><svg/>'))!, /SVG/)
  assert.match(rechazoDeImagen(new TextEncoder().encode('<html><script>x</script></html>'))!, /no es una foto/)
  assert.match(rechazoDeImagen(new Uint8Array())!, /vacía/)
  const conGps = new Uint8Array(await sharp({ create: { width: 640, height: 480, channels: 3, background: '#b44' } }).jpeg()
    .withExifMerge({ IFD0: { Make: 'Telefono' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '19/1 25/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '99/1 8/1 0/1' } }).withMetadata({ orientation: 6 }).toBuffer())
  assert.deepEqual(metadatosDeJpeg(conGps), { exif: true, gps: true })
  const n = await preparaImagenes(sharpInyectado).normaliza(conGps)
  assert.deepEqual(metadatosDeJpeg(n.jpeg), { exif: false, gps: false })
  assert.deepEqual([n.ancho, n.alto, tipoDeImagen(n.miniatura)], [480, 640, 'jpeg'], 'orientacion 6 = girada: se endereza antes de quitar el EXIF')
  await assert.rejects(preparaImagenes(sharpInyectado).normaliza(new TextEncoder().encode('<svg/>')), /SVG/)
})

test('recorte de la guia: en pixeles, dentro de la foto, y ampliado si quedo bajo (el motor lee mal letras chicas)', async () => {
  const foto = new Uint8Array(await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#fff' } }).jpeg().toBuffer())
  const rec = await preparaImagenes(sharpInyectado).recorta(foto, { x: 0.1, y: 0.4, ancho: 0.8, alto: 0.1 }, { ancho: 1000, alto: 600 })
  const m = await sharp(rec).metadata()
  assert.deepEqual([m.format, m.width, m.height], ['png', 800 * 3, 60 * 3])
})

test('almacen de fotos en carpeta: idempotente por huella, verifica al leer, nunca sale de su carpeta, y poda lo que nadie usa', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fotos-'))
  const fotos = fotosEnCarpeta(dir)
  const jpg = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: '#0a0' } }).jpeg().toBuffer())
  const h = await fotos.guarda(jpg, 'jpeg')
  assert.equal(await fotos.guarda(jpg, 'jpeg'), h)
  assert.equal(h, huellaDeBytes(jpg))
  assert.deepEqual((await fotos.lee(h))?.tipo, 'jpeg')
  assert.equal(await fotos.lee('sha256:../../../etc/passwd'), undefined)
  await assert.rejects(fotos.guarda(jpg, 'png'))
  const vieja = new Date(Date.now() - 400 * 86_400_000)
  const sub = join(dir, h.slice(7, 9))
  await utimes(join(sub, (await readdir(sub))[0]!), vieja, vieja)
  assert.equal(await fotos.poda!(new Set([h]), new Date()), 0, 'la referida no se poda')
  assert.equal(await fotos.poda!(new Set(), new Date(Date.now() - 365 * 86_400_000)), 1)
})

test('motor por proceso: protocolo, salida validada, y un error nunca trae el texto de la foto', async () => {
  assert.deepEqual(validaSalida('{"lineas":[{"texto":"CAD 30/10/26","confianza":0.93,"caja":[1,2,3,4]}]}'), [{ texto: 'CAD 30/10/26', confianza: 0.93, caja: [1, 2, 3, 4] }])
  assert.throws(() => validaSalida('CAD 30/10/26 secreto'), (e: Error) => !e.message.includes('secreto'))
  const png = new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer())
  const eco = motorPorProceso({ comando: process.execPath, argumentos: ['-e', 'console.log(JSON.stringify({lineas:[{texto:"EXP 15.03.27",caja:[0,0,5,5]}]}))'], modelo: 'eco-1.0' })
  const r = await eco.lee(png)
  assert.deepEqual([r.motor, r.lineas[0]?.texto], ['eco-1.0', 'EXP 15.03.27'])
  const falla = motorPorProceso({ comando: process.execPath, argumentos: ['-e', 'console.log("CAD 30/10/26 secreto"); console.error("motor: ValueError"); process.exit(1)'], modelo: 'eco-1.0' })
  await assert.rejects(falla.lee(png), (e: Error) => e.message === 'motor: ValueError')
  await assert.rejects(eco.lee(new TextEncoder().encode('<svg/>')), /no es una imagen/)
  assert.throws(() => motorPorProceso({ comando: 'x', modelo: 'rapidocr:latest' }))
})
