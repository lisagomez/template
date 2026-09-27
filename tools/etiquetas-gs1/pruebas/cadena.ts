/**
 * El nucleo criptografico contra sus vectores publicos (SHA-256 de NIST, RFC 8785, RFC 6962 /
 * transparency-dev), y la cadena, el anclaje y la firma contra las manipulaciones que tienen que
 * delatar. Los hashes se escriben con su prefijo `sha256:` como en la cadena.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  aHex, bytesDeHash, canonico, comoHash, deHex, genesis, hashDeEvento, nuevoEvento, preparaAncla, pruebaDeEvento, pruebaInclusion, raizMerkle, sha256, utf8,
  verificaCadena, verificaInclusion, verificaPruebaEvento, verificaSitio, recibeAncla, recibeTestigo, centralVacio, registraLlave, audita,
  type AnclaFirmada, type Borrador, type ClaveLote, type Evento,
} from '../dist/index.js'
import { firmaAncla, generaLlaves, idLlave, verificador } from '../dist/firma.js'

const h = (s: string) => comoHash(sha256(utf8(s)))

test('SHA-256: vectores de NIST (FIPS 180-4) y contra node:crypto', () => {
  assert.equal(h(''), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(h('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(h('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), 'sha256:248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  assert.equal(h('a'.repeat(1_000_000)), 'sha256:cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  for (let n = 0; n < 300; n += 7) {
    const b = randomBytes(n)
    assert.equal(aHex(sha256(b)), createHash('sha256').update(b).digest('hex'), `largo ${n}`)
  }
})

test('JCS: el ejemplo de RFC 8785 §3.2.2 y el orden de claves por UTF-16 (§3.2.3)', () => {
  const entrada = String.raw`{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001], "string": "\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/", "literals": [null, true, false]}`
  const esperado = String.raw`{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\u000f\nA'B\"\\\\\"/"}`
  assert.equal(canonico(JSON.parse(entrada)), esperado)
  const orden = canonico(JSON.parse(String.raw`{"\u20ac":"Euro","\r":"CR","\ufb33":"Hebrew","1":"One","\ud83d\ude00":"Emoji","\u0080":"Control","\u00f6":"ö"}`))
  assert.equal(orden, '{"\\r":"CR","1":"One","\u0080":"Control","\u00f6":"ö","\u20ac":"Euro","\ud83d\ude00":"Emoji","\ufb33":"Hebrew"}')
  assert.throws(() => canonico({ x: Number.NaN }))
})

// transparency-dev/merkle testonly: hojas y raices de RFC 6962 para arboles de 1 a 8 hojas.
const HOJAS = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'].map(deHex)
const RAICES = [
  'sha256:6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'sha256:fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'sha256:aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'sha256:d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  'sha256:4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  'sha256:76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'sha256:ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  'sha256:5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
]
const PRUEBAS: readonly { hoja: number; tamano: number; ruta: string[] }[] = [
  { hoja: 1, tamano: 8, ruta: ['sha256:96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7', 'sha256:5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e', 'sha256:6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4'] },
  { hoja: 6, tamano: 8, ruta: ['sha256:bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b', 'sha256:ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0', 'sha256:d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7'] },
  { hoja: 3, tamano: 3, ruta: ['sha256:fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125'] },
  { hoja: 2, tamano: 5, ruta: ['sha256:6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d', 'sha256:5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e', 'sha256:bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b'] },
]

test('Merkle RFC 6962: raices de 0 a 8 hojas y pruebas de inclusion publicadas', () => {
  assert.equal(comoHash(raizMerkle([])), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  RAICES.forEach((r, i) => assert.equal(comoHash(raizMerkle(HOJAS.slice(0, i + 1))), r, `${i + 1} hojas`))
  for (const p of PRUEBAS) {
    const hojas = HOJAS.slice(0, p.tamano)
    assert.deepEqual(pruebaInclusion(p.hoja - 1, hojas).map(comoHash), p.ruta, `hoja ${p.hoja} de ${p.tamano}`)
    assert.ok(verificaInclusion(HOJAS[p.hoja - 1]!, p.hoja - 1, p.tamano, p.ruta.map(bytesDeHash), bytesDeHash(RAICES[p.tamano - 1]!)))
  }
})

test('Merkle: toda hoja de todo arbol hasta 8 prueba su inclusion, y una ruta alterada no', () => {
  for (let n = 1; n <= 8; n++) {
    const hojas = HOJAS.slice(0, n)
    const raiz = raizMerkle(hojas)
    for (let m = 0; m < n; m++) {
      const ruta = pruebaInclusion(m, hojas)
      assert.ok(verificaInclusion(hojas[m]!, m, n, ruta, raiz), `${m}/${n}`)
      assert.equal(verificaInclusion(utf8('otra'), m, n, ruta, raiz), false)
      if (ruta.length) {
        const mala = ruta.map((x, i) => (i === 0 ? sha256(x) : x))
        assert.equal(verificaInclusion(hojas[m]!, m, n, mala, raiz), false)
      }
      if (n > 1) assert.equal(verificaInclusion(hojas[m]!, (m + 1) % n, n, ruta, raiz), false)
    }
  }
})

// ——— La cadena ———
const SITIO = 'SUC-PONIENTE'
const LOTE: ClaveLote = { gtin: '19521111000010', lote: 'L4471', caducidad: '2026-11-20' }
const OTRO: ClaveLote = { gtin: '19521111000027', lote: 'L0915', caducidad: '2027-01-10' }
const fecha = (d: number, hora: number) => new Date(Date.UTC(2026, 8, d, hora)).toISOString()

function cadenaDePrueba(n = 8): Evento[] {
  const tipos: Borrador['tipo'][] = ['RECIBIDO', 'UBICADO', 'MOVIDO', 'VENDIDO', 'RECIBIDO', 'MOVIDO', 'VENDIDO', 'MERMA']
  const c: Evento[] = []
  for (let i = 0; i < n; i++) {
    c.push(nuevoEvento(SITIO, c, { tipo: tipos[i % 8]!, lote: i % 4 === 3 ? OTRO : LOTE, datos: { cajas: i + 1, posicion: 'B-04-2' }, operador: 'op-1a2b3c4d', fecha: fecha(20 + Math.floor(i / 4), 10 + i) }))
  }
  return c
}

test('cadena: se encadena y verifica; cada evento enlaza con el anterior y con el anterior de su lote', () => {
  const c = cadenaDePrueba()
  assert.deepEqual(verificaCadena(SITIO, c), { ok: true, n: 8, cabeza: c[7]!.hash })
  assert.equal(c[0]!.anterior, genesis(SITIO))
  assert.equal(c[1]!.anteriorLote, c[0]!.hash)
  assert.equal(c[3]!.anteriorLote, null)
  assert.equal(c[4]!.anteriorLote, c[2]!.hash)
  assert.equal(c[7]!.anteriorLote, c[3]!.hash)
})

test('cadena: alterar la caducidad de un evento viejo rompe la verificacion EN ESA secuencia', () => {
  const c = cadenaDePrueba()
  const alterada = c.map((e) => (e.seq === 3 ? { ...e, lote: { ...e.lote, caducidad: '2027-02-20' } } : e))
  const v = verificaCadena(SITIO, alterada)
  assert.equal(v.ok, false)
  assert.deepEqual(!v.ok && { seq: v.rotura.seq, motivo: v.rotura.motivo }, { seq: 3, motivo: 'hash' })
  // Cambiar el operador o la fecha tambien: el hash cubre el registro COMPLETO.
  for (const cambio of [{ operador: 'op-ffffffff' }, { fecha: fecha(1, 1) }, { datos: { cajas: 99 } }]) {
    const v2 = verificaCadena(SITIO, c.map((e) => (e.seq === 5 ? { ...e, ...cambio } : e)))
    assert.equal(!v2.ok && v2.rotura.seq, 5)
  }
})

test('cadena: reordenar los campos del registro no cambia el hash (JCS)', () => {
  const e = cadenaDePrueba(1)[0]!
  const { hash, ...resto } = e
  const alReves = Object.fromEntries(Object.entries(resto).reverse()) as typeof resto
  const datosAlReves = { ...alReves, datos: Object.fromEntries(Object.entries(resto.datos).reverse()), lote: { caducidad: resto.lote.caducidad, lote: resto.lote.lote, gtin: resto.lote.gtin } }
  assert.equal(hashDeEvento(alReves), hash)
  assert.equal(hashDeEvento(datosAlReves), hash)
  assert.notEqual(JSON.stringify(datosAlReves), JSON.stringify(resto))
})

test('cadena: borrar un evento de en medio o reordenar la cadena se detecta', () => {
  const c = cadenaDePrueba()
  const sinCuarto = c.filter((e) => e.seq !== 4)
  const v = verificaCadena(SITIO, sinCuarto)
  assert.deepEqual(!v.ok && [v.rotura.seq, v.rotura.motivo], [5, 'secuencia'])
  const cambiados = [c[0]!, c[2]!, c[1]!, ...c.slice(3)]
  assert.equal(verificaCadena(SITIO, cambiados).ok, false)
})

// ——— Anclaje y firma ———
function anclado(c: Evento[], llaves = generaLlaves()) {
  const id = idLlave(llaves.publica)
  const verifica = verificador({ [id]: llaves.publica })
  let central = registraLlave(centralVacio(), SITIO, { id, publica: llaves.publica, registrada: fecha(1, 0) }, fecha(1, 0))
  const dia1 = c.filter((e) => e.fecha < fecha(21, 0))
  const a1 = preparaAncla(SITIO, dia1, [], '2026-09-20', fecha(20, 23))!
  central = recibeAncla(central, firmaAncla(a1, llaves.privada), verifica, fecha(20, 23)).central
  const a2 = preparaAncla(SITIO, c, central.anclas[SITIO]!, '2026-09-21', fecha(21, 23))!
  const r = recibeAncla(central, firmaAncla(a2, llaves.privada), verifica, fecha(21, 23))
  assert.equal(r.ok, true)
  return { central: r.central, verifica, id, llaves }
}

test('anclaje: raiz diaria firmada y aceptada por el central; cada evento prueba su inclusion', () => {
  const c = cadenaDePrueba()
  const { central, verifica, id } = anclado(c)
  const anclas = central.anclas[SITIO]!
  assert.deepEqual(anclas.map((a) => [a.ancla.desdeSeq, a.ancla.hastaSeq, a.ancla.n]), [[1, 4, 4], [5, 8, 4]])
  const informe = verificaSitio(SITIO, c, anclas, id, verifica)
  assert.equal(informe.ok, true)
  assert.equal(informe.sinAnclar, 0)
  for (const e of c) {
    const p = pruebaDeEvento(e, c, anclas)!
    assert.ok(verificaPruebaEvento(e, p), `evento #${e.seq}`)
    assert.equal(verificaPruebaEvento({ ...e, hash: c[(e.seq % 8)]!.hash }, p), false)
  }
})

test('anclaje: RECALCULAR la cadena entera la deja valida localmente, pero el ancla la delata', () => {
  const c = cadenaDePrueba()
  const { central, verifica, id } = anclado(c)
  // Quien tiene escritura cambia la caducidad del evento 2 y recalcula TODOS los hashes.
  const reescrita: Evento[] = []
  for (const e of c) {
    const { hash: _h, anterior: _a, anteriorLote: _l, ...b } = e
    void _h; void _a; void _l
    reescrita.push(nuevoEvento(SITIO, reescrita, e.seq === 2 ? { ...b, lote: { ...b.lote, caducidad: '2027-02-20' } } : b))
  }
  assert.equal(verificaCadena(SITIO, reescrita).ok, true, 'localmente parece valida')
  const informe = verificaSitio(SITIO, reescrita, central.anclas[SITIO]!, id, verifica)
  assert.equal(informe.ok, false)
  assert.match(informe.primerFallo ?? '', /ancla del 2026-09-20: la raíz de Merkle recalculada no es la anclada/)
  assert.equal(informe.anclas[1]!.ok, false, 'y el dia siguiente tampoco continua')
})

test('anclaje: borrar el ultimo evento se detecta (antes de anclar, por el testigo; despues, por el ancla)', () => {
  const c = cadenaDePrueba()
  const { central, verifica, id, llaves } = anclado(c)
  // Despues del ancla: el evento #8 ya estaba anclado y alguien lo borra.
  const sinUltimo = c.slice(0, -1)
  assert.equal(verificaCadena(SITIO, sinUltimo).ok, true)
  const inf = verificaSitio(SITIO, sinUltimo, central.anclas[SITIO]!, id, verifica)
  assert.match(inf.primerFallo ?? '', /cubre 4 eventos \(#5-#8\) y en el almacén hay 3: falta 1 evento/)
  // Antes del ancla: #9 se registra, el sitio avisa su cabeza, y alguien lo borra antes de la noche.
  const nueve = nuevoEvento(SITIO, c, { tipo: 'VENDIDO', lote: LOTE, datos: { cajas: 2 }, operador: 'op-1a2b3c4d', fecha: fecha(22, 12) })
  let cen = recibeTestigo(central, SITIO, { seq: 9, cabeza: nueve.hash, fecha: nueve.fecha }).central
  const diez = nuevoEvento(SITIO, c, { tipo: 'VENDIDO', lote: LOTE, datos: { cajas: 1 }, operador: 'op-1a2b3c4d', fecha: fecha(22, 18) })
  // Opcion 1: no anclar nada nuevo. La auditoria del dia siguiente no encuentra lo que vio el central.
  const aud = audita({ [SITIO]: c }, cen, verifica, [SITIO])
  assert.equal(aud.ok, false)
  assert.match(aud.sitios[0]!.primerFallo ?? '', /el central vio el evento #9 y en el almacén ya no está/)
  // Opcion 2: sustituirlo por otro #9 y anclar: el central lo rechaza y abre incidente.
  const a3 = preparaAncla(SITIO, [...c, diez], cen.anclas[SITIO]!, '2026-09-22', fecha(22, 23))!
  const r = recibeAncla(cen, firmaAncla(a3, llaves.privada), verifica, fecha(22, 23))
  assert.equal(r.ok, false)
  assert.match(r.motivo ?? '', /el evento #9 no es el que vio el central/)
  assert.equal(r.central.incidentes.at(-1)!.origen, 'anclaje')
  // Y avisar una cabeza que retrocede tambien es incidente.
  cen = recibeTestigo(cen, SITIO, { seq: 8, cabeza: c[7]!.hash, fecha: fecha(23, 8) }).central
  assert.match(cen.incidentes.at(-1)!.motivo, /retrocedió/)
})

test('firma Ed25519: la del sitio se acepta; la de otra llave, una alterada o sin registrar se rechazan', () => {
  const c = cadenaDePrueba()
  const propia = generaLlaves()
  const ajena = generaLlaves()
  const idP = idLlave(propia.publica)
  const verifica = verificador({ [idP]: propia.publica, [idLlave(ajena.publica)]: ajena.publica })
  const central = registraLlave(centralVacio(), SITIO, { id: idP, publica: propia.publica, registrada: fecha(1, 0) }, fecha(1, 0))
  const ancla = preparaAncla(SITIO, c, [], '2026-09-21', fecha(21, 23))!
  assert.equal(recibeAncla(central, firmaAncla(ancla, propia.privada), verifica, fecha(21, 23)).ok, true)
  const deOtra = recibeAncla(central, firmaAncla(ancla, ajena.privada), verifica, fecha(21, 23))
  assert.deepEqual([deOtra.ok, deOtra.motivo], [false, 'firmada con una llave que no es la registrada para el sitio'])
  const buena = firmaAncla(ancla, propia.privada)
  const alterada: AnclaFirmada = { ...buena, ancla: { ...buena.ancla, raiz: comoHash(sha256(utf8('otra raiz'))) } }
  assert.deepEqual(recibeAncla(central, alterada, verifica, fecha(21, 23)).motivo, 'la firma no es válida')
  const robada: AnclaFirmada = { ...buena, firma: firmaAncla(ancla, ajena.privada).firma }
  assert.equal(recibeAncla(central, robada, verifica, fecha(21, 23)).ok, false)
  assert.equal(recibeAncla(centralVacio(), buena, verifica, fecha(21, 23)).ok, false, 'sin llave registrada no hay ancla')
})
