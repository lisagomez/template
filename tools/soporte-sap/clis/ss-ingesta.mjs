#!/usr/bin/env node
/**
 * ss-ingesta — lee un documento como lo haría la incidencia: valida por bytes y tamaño, lo lee
 * con el extractor documental por su vía (XML, capa 0 o motor LOCAL) y muestra sus campos con
 * evidencia, todos por revisar. Solo lectura: no guarda nada. Las imágenes necesitan Tesseract
 * (TESSERACT_CMD, LD_LIBRARY_PATH y TESSDATA_PREFIX); sin él, la imagen queda como adjunto.
 *
 * Uso:  ss-ingesta --archivo captura.png [--maximo 5000000]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { clasePorBytes, leeCapaCero } from '../../extractor-documental/dist/index.js'
import { leeCfdi40, registroDeEsquemas, lectorDeTimbre11 } from '../../extractor-documental/dist/xml/index.js'
import { motorPorProceso } from '../../extractor-documental/dist/motores/proceso-local.js'
import { ingiere, leeArgumentos, ayuda } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-ingesta', que: 'lee un documento por su vía y muestra sus campos con evidencia', uso: 'ss-ingesta --archivo ruta [--maximo bytes]', readOnly: true, dryRunPorDefecto: false }

const a = leeArgumentos(process.argv.slice(2), ['archivo', 'maximo'])
if (a.banderas.has('help')) { console.log(ayuda(DESCRIPCION)); process.exit(0) }
if (!a.valores.archivo || !existsSync(a.valores.archivo)) { console.error(ayuda(DESCRIPCION)); process.exit(2) }

function motorLocal() {
  const cmd = process.env.TESSERACT_CMD
  if (!cmd) return null
  const version = execFileSync(cmd, ['--version'], { encoding: 'utf8' }).split('\n')[0].replace(/^tesseract\s+/, '').trim()
  const entorno = Object.fromEntries(['LD_LIBRARY_PATH', 'TESSDATA_PREFIX', 'TESSERACT_CMD'].filter((n) => process.env[n]).map((n) => [n, process.env[n]]))
  const m = motorPorProceso({ comando: 'python3', argumentos: [join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extractor-documental', 'motores-locales', 'tesseract.py')], modelo: `tesseract-${version}-spa-zonal-1`, entorno: { ...entorno, EXTRACTOR_IDIOMA: 'spa' } })
  return { modelo: m.modelo, extrae: (b) => m.extrae(b) }
}

const timbre = registroDeEsquemas([lectorDeTimbre11])
const puertos = {
  clasePorBytes, leeCapaCero: (p) => leeCapaCero(p),
  leeCfdi: (x) => { const l = leeCfdi40(x, timbre); return { esCfdi: l.esCfdi, motivo: l.motivo, campos: l.campos.map((c) => ({ clave: c.clave, valor: c.valor })) } },
  ocr: motorLocal(),
}
const r = await ingiere(puertos, { bytesMaximos: Number(a.valores.maximo ?? 5_000_000), motor: 'local', decisionC4: null }, { nombre: a.valores.archivo, bytes: new Uint8Array(readFileSync(a.valores.archivo)) })
console.log(JSON.stringify(r.aceptado ? { ...r, texto: `${r.texto.length} caracteres (dato delimitado, no se imprime)` } : r, null, 1))
process.exit(r.aceptado ? 0 : 1)
