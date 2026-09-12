/**
 * Que llevan los QR de un lote de paginas. SOLO FORMA: cuantos codigos, formato, si es URL, host,
 * nombres de parametros, longitud y si la carga contiene un token con forma de CURP/RFC (booleano).
 * NUNCA imprime la carga: las paginas son documentos reales con datos de terceros.
 *
 *   node medicion/sonda-qr.mjs ruta/a/pagina1.jpg ruta/a/pagina2.png ...
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader')
// En Node el .wasm se inyecta desde el paquete: sin esto, zxing-wasm va a buscarlo a un CDN.
const rutaWasm = fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm'))
prepareZXingModule({ overrides: { wasmBinary: readFileSync(rutaWasm).buffer }, fireImmediately: true })

const MASCARA = process.argv.includes('--mascara')
const rutas = process.argv.slice(2).filter((a) => a !== '--mascara')
// --mascara: letras->A, digitos->9, separadores tal cual. Es forma, no contenido: sirve para
// escribir el parser de un QR sin leer lo que dice.
const mascara = (t) => t.replace(/[A-ZÑ]/g, 'A').replace(/[a-zñ]/g, 'a').replace(/\d/g, '9')
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/

let conCodigo = 0
for (const ruta of rutas) {
  const bytes = readFileSync(ruta)
  const lecturas = await readBarcodes(new Uint8Array(bytes), { tryHarder: true, formats: ['QRCode', 'DataMatrix', 'PDF417', 'Code128'] })
  const validas = lecturas.filter((l) => l.isValid && l.text.length > 0)
  const etiqueta = ruta.split('/').slice(-2).join('/')
  if (validas.length === 0) { console.log(`${etiqueta} · sin codigo`); continue }
  conCodigo++
  for (const l of validas) {
    let forma = 'texto'
    let detalle = ''
    try {
      const u = new URL(l.text)
      forma = 'url'
      detalle = `host=${u.hostname} path=${u.pathname.split('/').slice(-1)[0]} params=[${[...u.searchParams.keys()].join(',')}]`
    } catch { /* no es URL */ }
    console.log(`${etiqueta} · ${l.format} · ${forma} · ${l.text.length} chars · ${detalle} · curp-en-carga=${CURP.test(l.text)} rfc-en-carga=${RFC.test(l.text)}`)
    if (MASCARA) {
      const m = forma === 'url' ? `${new URL(l.text).hostname} ? ${[...new URL(l.text).searchParams].map(([k, v]) => `${k}=${mascara(v)}`).join('&')}` : mascara(l.text)
      console.log(`    mascara: ${m}`)
    }
  }
}
console.log(`\n${conCodigo} pagina(s) con codigo de ${rutas.length}`)
