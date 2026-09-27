#!/usr/bin/env node
/**
 * Migración ÚNICA del seed de Hermes a la fuente única (PRP-005 Fase 2). Se conserva para
 * auditoría, no para volver a correrla: desde esta migración las reglas se investigan y se
 * siembran en `catalogo.json`, `dominios/` y `generales/`.
 *
 * Entrada: `origen/hermes/reglas.json`, importado con su historial. Tras la migración ese archivo
 * se retira del árbol, pero su historia queda. Para reproducir la migración:
 *   git show <commit de la importación>:tools/conocimiento/origen/hermes/reglas.json > origen/hermes/reglas.json
 *   node origen/migra-desde-hermes.mjs
 *
 * Lo que comprueba antes de escribir nada:
 * - la huella del seed es la del corte congelado (CORTE_HERMES);
 * - cada regla dicta sobre una sola categoría, o es general de su ámbito;
 * - cada categoría con reglas cae en exactamente UN dominio de su ámbito;
 * - la procedencia, partida por dominio, vuelve a unirse en el texto original sin perder un carácter.
 *
 * Lo que NO hace: corregir nada. Las dos divergencias (la regla de 2010 borrada y el conflicto de
 * INTERESES) pasan tal cual; su corrección es un cambio aparte, con firma del laboratorio.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORTE_HERMES, desdeHermes } from '../../grafo-conocimiento/dist/index.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const buf = readFileSync(join(raiz, 'origen', 'hermes', 'reglas.json'))
const huella = `sha256:${createHash('sha256').update(buf).digest('hex')}`
if (huella !== CORTE_HERMES.seed_sha256) {
  console.error(`✗ el seed no es el del corte: ${huella}`)
  process.exit(2)
}
const hermes = JSON.parse(buf.toString('utf8'))

// Secciones de `_meta.source_version`, en el orden en que aparecen. Cada una es una investigación
// con su fecha; el texto completo es la concatenación exacta de todas.
const SECCIONES = [
  'seed v4 2026-07-30',
  'regulatorio MX 2026-07:',
  'Fase 8b (2026-07-10):',
  'datos-personales MX 2026-07-30:',
  'corporativo-mercantil MX 2026-08-06 (Fase A):',
  'fiduciario/sucesorio/inmobiliario MX 2026-08-07 (Fase B):',
  'ambiental MX 2026-08-07 (Fase C):',
  'cabildeo/politico MX 2026-08-07 (Fase D):',
  'frontera financiera MX 2026-08-07',
  'propiedad industrial MX 2026-08-08:',
  'vocabulario 2026-08-08:',
  'servicios legales transversal 2026-08-08:',
  'comercio exterior MX 2026-09-02:',
  'logistica MX 2026-09-02:',
  'T-MEC 2026-09-03:',
]

// Dominio → categorías y secciones de procedencia que lo respaldan. Agrupados por la
// investigación de la que salieron, que en Hermes coincide con la familia de leyes.
const DOMINIOS = [
  ['mx-drones-de-reparto', 'Drones de reparto (RPAS)', 'MX', 'regulatorio', ['DRONES_DELIVERY'], [1, 2]],
  ['mx-agentes-de-seguros', 'Intermediación de seguros', 'MX', 'regulatorio', ['AGENTES_SEGUROS'], [1, 2]],
  ['mx-logistica-carga', 'Logística de carga (autotransporte y aérea)', 'MX', 'regulatorio', ['AUTOTRANSPORTE_CARGA', 'CARGA_AEREA_EAWB'], [13]],
  ['mx-comercio-exterior', 'Comercio exterior y aduanas', 'MX', 'regulatorio',
    ['CLASIFICACION_ARANCELARIA', 'DESPACHO_ADUANERO', 'INFRACCIONES_ADUANERAS', 'ORIGEN_MERCANCIAS', 'PADRON_IMPORTADORES',
      'PRACTICAS_DESLEALES', 'REGIMENES_ADUANEROS', 'REGULACIONES_NO_ARANCELARIAS', 'REPRESENTACION_ADUANAL', 'VALOR_ADUANA'], [12, 14]],
  ['mx-t-mec', 'T-MEC: origen, certificación y facilitación', 'MX', 'regulatorio',
    ['TMEC_CERTIFICACION_ORIGEN', 'TMEC_ENVIOS_ENTREGA_RAPIDA', 'TMEC_REGLAS_ORIGEN', 'TMEC_RESOLUCIONES_ANTICIPADAS',
      'TMEC_TRATO_PREFERENCIAL', 'TMEC_VERIFICACION_ORIGEN'], [14]],
  ['mx-corporativo-mercantil', 'Corporativo y mercantil', 'MX', 'regulatorio',
    ['ASAMBLEAS_SOCIETARIAS', 'CONCENTRACIONES_COFECE', 'CONSTITUCION_SOCIEDADES', 'DIVIDENDOS_UTILIDADES', 'FUSION_ESCISION',
      'GRUPOS_HOLDING', 'PODERES_REPRESENTACION', 'REGISTRO_ACCIONES_BC', 'SAS_CONSTITUCION'], [4]],
  ['mx-fiduciario-inmobiliario-sucesorio', 'Fiduciario, inmobiliario y sucesorio', 'MX', 'regulatorio',
    ['COMPRAVENTA_INMUEBLES', 'FIDEICOMISO_CONSTITUCION', 'FIDEICOMISO_ZONA_RESTRINGIDA', 'REGISTRO_PROPIEDAD', 'TESTAMENTOS_SUCESIONES'], [5, 10]],
  ['mx-ambiental', 'Ambiental', 'MX', 'regulatorio',
    ['AUDITORIA_AMBIENTAL', 'EMISIONES_ATMOSFERA', 'IMPACTO_AMBIENTAL', 'RESIDUOS_PELIGROSOS', 'RESPONSABILIDAD_AMBIENTAL'], [6]],
  ['mx-cabildeo-y-politica', 'Cabildeo y política', 'MX', 'regulatorio', ['APORTACIONES_POLITICAS', 'CABILDEO_CONGRESO', 'PROPAGANDA_ELECTORAL'], [7]],
  ['mx-servicios-financieros', 'Asesoría en inversiones (frontera LMV)', 'MX', 'regulatorio', ['ASESORIA_INVERSIONES'], [8]],
  ['mx-propiedad-industrial', 'Propiedad industrial', 'MX', 'regulatorio', ['MARCAS_REGISTRO', 'PATENTES_INVENCIONES'], [9]],
  ['mx-servicios-legales', 'Operar como despacho legal', 'MX', 'regulatorio', ['SERVICIOS_LEGALES'], [11]],
  ['mx-deducibilidad', 'Deducibilidad de gastos (MX)', 'MX', 'fiscal',
    ['ARRENDAMIENTO', 'COMBUSTIBLES', 'DONATIVOS', 'EQUIPO_DE_COMPUTO', 'INTERESES', 'SERVICIOS_PROFESIONALES', 'VIATICOS'], [0]],
  ['mx-registro-contable', 'Registro contable (NIF)', 'MX', 'contable', ['ARRENDAMIENTO', 'EQUIPO_DE_COMPUTO'], [0]],
  ['mx-clausulas-contractuales', 'Cláusulas de contratos comerciales', 'MX', 'contractual',
    ['CLAUSULA_CONFIDENCIALIDAD', 'CLAUSULA_PAGO', 'CLAUSULA_PENAL', 'CLAUSULA_TERMINACION'], [0, 3]],
  ['mx-datos-personales-prospeccion', 'Datos personales en prospección B2B', 'MX', 'datos-personales',
    ['DATOS_CONTACTO_CORPORATIVO', 'DATOS_CONTACTO_PERSONA_FISICA', 'DATOS_FUENTE_PUBLICA', 'DATOS_TRANSFERENCIA_INTL'], [3]],
  ['co-deducibilidad', 'Deducibilidad de gastos (CO)', 'CO', 'fiscal', ['SERVICIOS_PROFESIONALES'], [0]],
]

function parteProcedencia(texto) {
  const pos = SECCIONES.map((m) => texto.indexOf(m))
  if (pos.some((p) => p < 0) || pos[0] !== 0 || pos.some((p, i) => i > 0 && p <= pos[i - 1])) {
    throw new Error('las secciones de la procedencia no están todas, o no en orden')
  }
  const partes = pos.map((p, i) => texto.slice(p, pos[i + 1] ?? texto.length))
  if (partes.join('') !== texto) throw new Error('la procedencia partida no reconstruye el texto original')
  return partes.map((p) => p.trim())
}

const corteDe = (secciones) =>
  secciones.flatMap((s) => SECCIONES[s].match(/\d{4}-\d{2}-\d{2}/g) ?? []).sort().at(-1)

function reparte(conocimiento, partes) {
  const dominioDe = new Map()
  for (const [clave, , jur, dim, cats] of DOMINIOS) {
    for (const cat of cats) {
      const llave = `${jur}/${dim}/${cat}`
      if (dominioDe.has(llave)) throw new Error(`${cat} en dos dominios de ${jur}/${dim}`)
      dominioDe.set(llave, clave)
    }
  }
  const porDominio = new Map(DOMINIOS.map(([clave]) => [clave, []]))
  const generales = new Map()
  for (const r of conocimiento.reglas) {
    const cats = [...new Set(r.impactos.map((i) => i.categoria).filter(Boolean))]
    if (cats.length > 1) throw new Error(`${r.clave} dicta sobre ${cats.length} categorías`)
    if (cats.length === 0) {
      const llave = `${r.jurisdiccion.toLowerCase()}-${r.dimension}`
      generales.set(llave, [...(generales.get(llave) ?? []), r])
      continue
    }
    const dominio = dominioDe.get(`${r.jurisdiccion}/${r.dimension}/${cats[0]}`)
    if (!dominio) throw new Error(`${r.clave}: ${cats[0]} no está en ningún dominio de ${r.jurisdiccion}/${r.dimension}`)
    porDominio.get(dominio).push(r)
  }
  for (const [clave, reglas] of porDominio) if (reglas.length === 0) throw new Error(`${clave} quedó sin reglas`)
  return { porDominio, generales, partes }
}

const escribe = (ruta, datos) => {
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`)
}
const porClave = (a, b) => a.clave.localeCompare(b.clave)

// Orden canónico de claves: se van a leer y editar a mano, y `clave` va primero. (El esquema laxo
// con el que se lee el seed reordena las claves; aquí se devuelven a un orden legible.)
const ordenaClaves = (orden) => (o) =>
  Object.fromEntries([...orden.filter((k) => k in o).map((k) => [k, o[k]]), ...Object.entries(o).filter(([k]) => !orden.includes(k))])
const impactoCanonico = ordenaClaves(['categoria', 'regimen', 'veredicto_base', 'tope_monto', 'tope_pct', 'requisitos', 'banderas', 'parametros'])
const reglaCanonica = (r) => ordenaClaves(['clave', 'jurisdiccion', 'dimension', 'titulo', 'texto_resumen', 'fuente_cita', 'fuente_url',
  'vigente_desde', 'vigente_hasta', 'reemplaza', 'impactos'])({ ...r, impactos: r.impactos.map(impactoCanonico) })
const categoriaCanonica = ordenaClaves(['clave', 'nombre', 'descripcion', 'keywords', 'exclusiones'])

const conocimiento = desdeHermes(hermes, { version: '0.1.0', corte: CORTE_HERMES.fecha })
const partes = parteProcedencia(hermes._meta.source_version)
const { porDominio, generales } = reparte(conocimiento, partes)

rmSync(join(raiz, 'dominios'), { recursive: true, force: true })
rmSync(join(raiz, 'generales'), { recursive: true, force: true })
escribe(join(raiz, 'catalogo.json'), {
  procedencia:
    `Fuente única del conocimiento del grafo (PRP-005). Importada una vez de ${CORTE_HERMES.repo}@${CORTE_HERMES.commit.slice(0, 7)} ` +
    `(reglas.json ${CORTE_HERMES.seed_sha256}) con su historial, en tools/conocimiento/origen/. ` +
    `${hermes._meta.descripcion} ${hermes._meta.disclaimer}`,
  jurisdicciones: conocimiento.jurisdicciones,
  dimensiones: conocimiento.dimensiones,
  categorias: [...conocimiento.categorias].sort(porClave).map(categoriaCanonica),
})
for (const [clave, nombre, jurisdiccion, dimension, categorias, secciones] of DOMINIOS) {
  escribe(join(raiz, 'dominios', `${clave}.json`), {
    dominio: {
      clave, nombre, jurisdiccion, dimension, cita: 'publica', corte: corteDe(secciones),
      procedencia: secciones.map((s) => partes[s]).join('\n\n'),
      categorias: [...categorias].sort(),
    },
    reglas: porDominio.get(clave).sort(porClave).map(reglaCanonica),
  })
}
for (const [llave, reglas] of generales) {
  const [jur, ...dim] = llave.split('-')
  escribe(join(raiz, 'generales', `${llave}.json`), {
    jurisdiccion: jur.toUpperCase(), dimension: dim.join('-'), procedencia: partes[0], reglas: reglas.sort(porClave).map(reglaCanonica),
  })
}
const n = [...porDominio.values()].reduce((a, r) => a + r.length, 0) + [...generales.values()].reduce((a, r) => a + r.length, 0)
console.log(`✓ ${DOMINIOS.length} dominios, ${generales.size} archivos de generales, ${n} reglas, ${conocimiento.categorias.length} categorías`)
if (hermes._bajas?.length) console.log(`  · _bajas de Hermes, NO migradas (el contrato no las admite): ${hermes._bajas.join(', ')}`)
