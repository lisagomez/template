/**
 * Lo que la mesa sabe de sus fuentes, generado desde la fuente y nunca a mano:
 *
 *   · `candidatos-sapstack.json`: los candidatos que salen de sapstack, fijado por SHA. Cada uno es una HIPÓTESIS para el
 *     experto, con su archivo y su línea de origen. sapstack es de un tercero: aquí solo se LEEN sus datos (YAML), nunca
 *     se corre un guion suyo.
 *   · `base.json`: la foto de `tools/conocimiento` (versiones registradas, firmas y si existe el dominio `sap-soporte`).
 *
 * Los dos llevan el banner ALTO y una huella: la mesa rechaza un archivo editado a mano, y una prueba vuelve a generar
 * la foto de la base para que no se quede vieja. Lo usan `extrae.mjs` (el laboratorio) y las pruebas.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export const BANNER = 'ALTO: ARTEFACTO AUTOGENERADO. Si lo editas, tus cambios se pierden en la próxima extracción y la mesa lo rechaza por su huella. La fuente es src/features/soporte-sap/mesa/fuentes/ (extrae.mjs).'
/** Los módulos que Soporte SAP atiende hoy (`tools/soporte-sap/src/mapeo.ts`). En sapstack, BC es Basis. */
export const ALCANCE = ['ABAP', 'BASIS', 'BC', 'FI', 'FI-LOC', 'HCM', 'MM', 'SD']
const RELEASE = { both: 'Existe en ECC y en S/4HANA', ecc_only: 'Solo existe en ECC', s4_only: 'Solo existe en S/4HANA', 's4_2021+': 'Existe en S/4HANA 2021 o posterior' }

export const huellaDe = (x) => `sha256:${createHash('sha256').update(JSON.stringify(x)).digest('hex')}`
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0] ?? '')
/**
 * El id de un candidato no lleva cifras: el filtro de la mesa revisa TODA la acción, y una nota (2269324) o un reporte
 * (S_ALR_87012284) tienen forma de número de documento. Es una huella corta en letras; la pantalla enseña la clave.
 */
const idDe = (tipo, clave) => `${tipo}-${createHash('sha256').update(`${tipo}:${clave}`).digest('hex').slice(0, 12).replace(/[0-9]/g, (d) => 'ghijklmnop'[Number(d)])}`
const urlDe = (f, archivo, linea) => `${f.web}/blob/${f.sha}/${archivo}#L${linea}`
const enAlcance = (modulos) => modulos.some((m) => ALCANCE.includes(m) || m === 'ALL')

/** La línea (1-based) de cada clave de primer nivel de `tcodes.yaml`: si se repite, todas. */
function lineasDeTcodes(texto) {
  const lineas = new Map()
  texto.split('\n').forEach((l, i) => { const m = /^"?([A-Za-z0-9_/.-]+)"?:\s*$/.exec(l); if (m) lineas.set(m[1], [...(lineas.get(m[1]) ?? []), i + 1]) })
  return lineas
}

function candidatoTcode(f, clave, v, lineas) {
  const modulos = (v?.modules ?? []).map(String)
  const titulo = String(v?.name ?? '').trim()
  const extra = String(v?.note ?? '').trim()
  const nota = extra ? ` sapstack añade${/[\u3131-\uD79D]/.test(extra) ? ', en coreano' : ''}: «${extra}».` : ''
  const ls = lineas.get(clave) ?? [0]
  const linea = ls.at(-1)
  return {
    id: idDe('tcode', clave), tipo: 'tcode', clave, titulo, modulos, release: v?.release ?? null, enAlcance: enAlcance(modulos),
    hipotesis: `«${clave}» es una transacción de ${lista(modulos) || 'un módulo sin decir'}: «${titulo}». ${RELEASE[v?.release] ?? 'sapstack no dice en qué release existe'}.${nota}`,
    destino: 'el triage (módulo del ticket) y el léxico del anonimizador',
    fuente: { archivo: 'data/tcodes.yaml', linea, url: urlDe(f, 'data/tcodes.yaml', linea) },
    aviso: ls.length > 1 ? `la clave está repetida en la fuente (líneas ${ls.join(' y ')}): vale la última` : null,
  }
}

function candidatoNota(f, n, texto) {
  const clave = String(n.id)
  const linea = texto.split('\n').findIndex((l) => l.includes(`id: "${clave}"`)) + 1
  const modulos = (n.modules ?? []).map(String)
  const temas = (n.keywords ?? []).slice(0, 4).map(String)
  return {
    id: idDe('nota', clave), tipo: 'nota', clave, titulo: String(n.title ?? '').trim(), modulos, release: n.release ?? null, enAlcance: enAlcance(modulos),
    hipotesis: `La SAP Note ${clave} («${String(n.title ?? '').trim()}») trata de ${lista(temas) || 'un tema sin decir'}${modulos.length ? `, en ${lista(modulos)}` : ''}. ${RELEASE[n.release] ?? 'sapstack no dice en qué release aplica'}. Solo el número y el enlace: el contenido es de SAP.`,
    destino: 'la fuente citada de una regla (puntero a SAP for Me)',
    fuente: { archivo: 'data/sap-notes.yaml', linea, url: urlDe(f, 'data/sap-notes.yaml', linea) },
    aviso: linea === 0 ? 'no encontré la línea de la nota en la fuente' : null,
  }
}

/** Los candidatos de una copia de sapstack en el SHA de `fuente`. Lee YAML; no ejecuta nada del repo. */
export function candidatosDe(clon, fuente) {
  const textoT = readFileSync(join(clon, 'data/tcodes.yaml'), 'utf8')
  const textoN = readFileSync(join(clon, 'data/sap-notes.yaml'), 'utf8')
  const t = yaml.load(textoT, { json: true }) ?? {}
  const notas = (yaml.load(textoN) ?? {}).notes ?? []
  const lineas = lineasDeTcodes(textoT)
  const candidatos = [
    ...Object.keys(t).sort().map((k) => candidatoTcode(fuente, k, t[k], lineas)),
    ...notas.map((n) => candidatoNota(fuente, n, textoN)).sort((a, b) => (a.clave < b.clave ? -1 : 1)),
  ]
  const ids = new Set()
  for (const c of candidatos) { if (ids.has(c.id)) throw new Error(`dos candidatos con el mismo id: ${c.id}`); ids.add(c.id) }
  return { _ALTO: BANNER, fuente: { repo: fuente.repo, sha: fuente.sha }, huella: huellaDe(candidatos), candidatos }
}

/** Fecha y firmante de cada versión, de `CAMBIOS.md` («## X.Y.Z — AAAA-MM-DD» y «firmadas por … el AAAA-MM-DD»). */
function cambiosDe(texto) {
  const secciones = texto.split(/^## /m).slice(1)
  return new Map(secciones.map((s) => {
    const [cabeza] = s.split('\n')
    const [, version, fecha] = /^(\S+)\s+—\s+(\d{4}-\d{2}-\d{2})/.exec(cabeza) ?? []
    const firma = /firmad[ao]s?\s+por\s+([^*\n]+?)\s+el\s+(\d{4}-\d{2}-\d{2})/i.exec(s)
    return [version, { fecha: fecha ?? null, firmo: firma ? firma[1].trim() : null }]
  }))
}

/** La foto de `tools/conocimiento` que pinta el nodo central del mapa. Sale del registro y de CAMBIOS, no de la memoria. */
export function baseDe(raiz) {
  const dir = join(raiz, 'tools/conocimiento')
  const registro = JSON.parse(readFileSync(join(dir, 'versiones.json'), 'utf8'))
  const cambios = cambiosDe(readFileSync(join(dir, 'CAMBIOS.md'), 'utf8'))
  const paquete = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const versiones = registro.versiones.map((v) => ({
    version: v.version, fecha: cambios.get(v.version)?.fecha ?? null, firmo: cambios.get(v.version)?.firmo ?? null,
    firmadas: v.firmadas.length, reglas: Object.keys(v.huellas.reglas).length, dominios: Object.keys(v.huellas.dominios ?? {}).length,
    categoriasSapSoporte: v.huellas.dominios?.['sap-soporte']?.categorias?.length ?? null,
    huella: huellaDe(v.huellas).slice(0, 19),
  })).reverse()
  return { _ALTO: BANNER, paquete: `${paquete.name}@${paquete.version}`, dominio: 'sap-soporte', versiones }
}
