/**
 * El overview del laboratorio: de dónde sale el conocimiento (sapstack fijado, el experto en la mesa, los punteros a SAP
 * Notes), dónde vive (la base `sap-soporte` de `tools/conocimiento`) y quién lo usa (el triage, el motor, el léxico del
 * anonimizador y los CLIs). Cada número sale de algo que existe: lo guardado en el almacén, el catálogo fijado, la foto
 * de la base o el código de Soporte SAP corrido sobre el catálogo. Si no hay de dónde, es `null` y la pantalla dice
 * «sin datos». Solo lo ve el laboratorio (la ruta lo comprueba).
 */
import baseJson from '../fuentes/base.json'
import clisJson from '../../../../../tools/soporte-sap/clis/manifiesto.json'
import { anonimiza, transaccionDe } from '../../../../../tools/soporte-sap/dist/index.js'
import type { Almacen } from './almacen'
import { catalogo, fuente, todasLasValidaciones } from './candidatos'
import { todosLosCasos } from './mesa'
import type { CasoMesa } from './modelo'
import type { Candidato, MapaVista, Metrica, PropuestaCandidato, PuntoSerie, ValidacionCandidato, VersionBase } from './modelo-candidatos'

const DIAS = 14
const SIN_DATOS_PERSONALES = { rfc: () => false, curp: () => false, nss: () => false }

/** Cuántos eventos hubo cada día de los últimos `dias`, contando hoy. */
export function serie(fechas: readonly string[], hoy: Date, dias = DIAS): PuntoSerie[] {
  const puntos = Array.from({ length: dias }, (_, i) => new Date(hoy.getTime() - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10))
  const cuenta = new Map(puntos.map((d) => [d, 0]))
  for (const f of fechas) { const d = f.slice(0, 10); const n = cuenta.get(d); if (n !== undefined) cuenta.set(d, n + 1) }
  return puntos.map((dia) => ({ dia, n: cuenta.get(dia) ?? 0 }))
}
const metrica = (valor: number | null, fechas: readonly string[], hoy: Date, nota: string): Metrica => ({ valor, serie: valor === null ? [] : serie(fechas, hoy), nota })

/** Lo que el código de Soporte SAP hace HOY con los T-codes del catálogo. Depende del código y del catálogo: una vez. */
let medidos: MapaVista['usos']['triage'] & { readonly lexico: MapaVista['usos']['lexico'] } | null = null
function mideUsos(): NonNullable<typeof medidos> {
  if (medidos) return medidos
  const tcodes = catalogo().filter((c) => c.tipo === 'tcode' && c.enAlcance)
  const reconocidos = new Set(tcodes.filter((c) => transaccionDe(`Desde ayer falla la ${c.clave} en producción`) === c.clave).map((c) => c.id))
  const tapa = (frase: string) => { const r = anonimiza(frase, SIN_DATOS_PERSONALES); return (r.reemplazos.NOMBRE ?? 0) + (r.reemplazos.USUARIO ?? 0) > 0 || r.veredicto === 'cuarentena' }
  const cajas = (k: string) => [k, k[0] + k.slice(1).toLowerCase(), k.toLowerCase()]
  const codigos = tcodes.filter((c) => cajas(c.clave).some((v) => tapa(`El error sale en ${v} al contabilizar`)))
  const nombres = tcodes.filter((c) => c.titulo && tapa(`Abrí ${c.titulo} y sale el error`))
  medidos = {
    reconocidos: reconocidos.size, total: tcodes.length, faltan: tcodes.filter((c) => !reconocidos.has(c.id)).slice(0, 12).map((c) => c.clave),
    lexico: { codigosTapados: codigos.length, nombresTapados: nombres.length, total: tcodes.length, ejemplos: nombres.slice(0, 6).map((c) => c.titulo) },
  }
  return medidos
}

const alExpertoDe = (c: CasoMesa) => c.resultado.tipo !== 'solucion'
const usuariosDe = (xs: ReadonlyArray<{ readonly por: { readonly usuario: string; readonly prueba: boolean } }>) => xs.filter((x) => !x.por.prueba).map((x) => x.por.usuario)

/** Por módulo (el primero de cada candidato): cuántos hay y cuántos validó algún experto. */
function porModuloDe(cands: readonly Candidato[], reales: readonly ValidacionCandidato[]): MapaVista['fuentes']['sapstack']['porModulo'] {
  const validados = new Set(reales.map((v) => v.candidato))
  const filas = new Map<string, { modulo: string; candidatos: number; validados: number; enAlcance: number }>()
  for (const c of cands) {
    const m = c.modulos[0] ?? '(sin módulo)'
    const f = filas.get(m) ?? { modulo: m, candidatos: 0, validados: 0, enAlcance: 0 }
    filas.set(m, { ...f, candidatos: f.candidatos + 1, validados: f.validados + (validados.has(c.id) ? 1 : 0), enAlcance: f.enAlcance + (c.enAlcance ? 1 : 0) })
  }
  return [...filas.values()].sort((a, b) => b.candidatos - a.candidatos || (a.modulo < b.modulo ? -1 : 1))
}

function fuentesDe(cands: readonly Candidato[], casos: readonly CasoMesa[], vals: readonly ValidacionCandidato[]): MapaVista['fuentes'] {
  const f = fuente()
  const reales = vals.filter((v) => !v.por.prueba)
  const notasValidadas = new Set(reales.filter((v) => v.candidato.startsWith('nota-') && (v.valoracion === 'correcto' || v.valoracion === 'corrige')).map((v) => v.candidato))
  return {
    sapstack: { candidatos: cands.length, tcodes: cands.filter((c) => c.tipo === 'tcode').length, notas: cands.filter((c) => c.tipo === 'nota').length, enAlcance: cands.filter((c) => c.enAlcance).length, commitNuevo: f.revision.head !== f.sha, porModulo: porModuloDe(cands, reales) },
    experto: { casos: casos.filter((c) => !c.por.prueba).length, validaciones: reales.length, expertos: new Set([...usuariosDe(casos), ...usuariosDe(vals)]).size, dePrueba: casos.filter((c) => c.por.prueba).length + vals.filter((v) => v.por.prueba).length },
    notas: { punteros: cands.filter((c) => c.tipo === 'nota').length, validadas: notasValidadas.size },
  }
}

function baseDe(): MapaVista['base'] {
  const versiones = baseJson.versiones as readonly VersionBase[]
  const conDominio = versiones.find((v) => v.categoriasSapSoporte !== null)
  return { paquete: baseJson.paquete, dominio: baseJson.dominio, existe: conDominio !== undefined, versionActual: conDominio?.version ?? null, versiones }
}

function metricasDe(cands: readonly Candidato[], casos: readonly CasoMesa[], vals: readonly ValidacionCandidato[], base: MapaVista['base'], hoy: Date): MapaVista['metricas'] {
  const reales = vals.filter((v) => !v.por.prueba)
  const de = (x: ValidacionCandidato['valoracion']) => reales.filter((v) => v.valoracion === x)
  const validados = new Set(reales.map((v) => v.candidato))
  const pendientes = cands.filter((c) => c.enAlcance && !validados.has(c.id)).length
  const deExpertos = casos.filter((c) => !c.por.prueba)
  const alExperto = deExpertos.filter(alExpertoDe)
  const firmadas = base.versiones.find((v) => v.categoriasSapSoporte !== null)?.categoriasSapSoporte ?? 0
  return {
    pendientes: metrica(pendientes, reales.map((v) => v.creado), hoy, 'candidatos en alcance que ningún experto ha validado; la serie, validaciones nuevas por día'),
    correctos: metrica(de('correcto').length, de('correcto').map((v) => v.actualizado), hoy, 'el experto dijo que la hipótesis es correcta'),
    corregidos: metrica(de('corrige').length, de('corrige').map((v) => v.actualizado), hoy, 'el experto la corrigió'),
    rechazados: metrica(de('mal').length, de('mal').map((v) => v.actualizado), hoy, 'el experto dijo que está mal'),
    noSe: metrica(de('no_se').length, de('no_se').map((v) => v.actualizado), hoy, 'el experto no lo sabe'),
    firmados: { valor: firmadas, serie: [], nota: firmadas ? `categorías de ${base.dominio} en ${base.versionActual}` : `ninguna versión registrada de ${base.paquete.replace(/@[^@]+$/, '')} tiene el dominio ${base.dominio}` },
    alExperto: metrica(deExpertos.length ? Math.round((100 * alExperto.length) / deExpertos.length) : null, alExperto.map((c) => c.creado), hoy, '% de los casos del experto que el agente no resolvió solo'),
  }
}

function propuestasDe(cands: readonly Candidato[], vals: readonly ValidacionCandidato[]): PropuestaCandidato[] {
  const porCandidato = new Map<string, ValidacionCandidato[]>()
  for (const v of vals) porCandidato.set(v.candidato, [...(porCandidato.get(v.candidato) ?? []), v])
  const ultima = (xs: readonly ValidacionCandidato[]) => xs.reduce((m, v) => (v.actualizado > m ? v.actualizado : m), '')
  return cands.filter((c) => porCandidato.has(c.id))
    .map((c) => ({ candidato: c, validaciones: [...(porCandidato.get(c.id) ?? [])].sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1)) }))
    .sort((a, b) => (ultima(a.validaciones) < ultima(b.validaciones) ? 1 : -1))
}

/** El mapa entero, para el laboratorio. */
export async function mapaDe(a: Almacen, retencionDias: number | null, hoy = new Date()): Promise<MapaVista> {
  const [casos, vals] = await Promise.all([todosLosCasos(a, retencionDias), todasLasValidaciones(a, retencionDias)])
  const cands = catalogo()
  const base = baseDe()
  const u = mideUsos()
  const deExpertos = casos.filter((c) => !c.por.prueba)
  return {
    generado: hoy.toISOString(),
    fuentes: fuentesDe(cands, casos, vals),
    base,
    usos: {
      triage: { reconocidos: u.reconocidos, total: u.total, faltan: u.faltan },
      motor: { casos: deExpertos.length, solucion: deExpertos.filter((c) => !alExpertoDe(c)).length, alExperto: deExpertos.filter(alExpertoDe).length },
      lexico: u.lexico,
      clis: clisJson.clis.map((c) => ({ nombre: c.nombre, que: c.que, readOnly: c.readOnly, dryRunPorDefecto: c.dryRunPorDefecto, grado: c.grado })),
    },
    metricas: metricasDe(cands, casos, vals, base, hoy),
    propuestas: propuestasDe(cands, vals),
    fuente: fuente(),
  }
}

const VALORACION_DICHA: Readonly<Record<ValidacionCandidato['valoracion'], string>> = { correcto: 'correcto', mal: 'está mal', corrige: 'lo corrige', no_se: 'no lo sabe' }

/** Las validaciones, para el export del laboratorio: cada una es una propuesta, con su fuente para poder firmarla (o no). */
export function propuestasEnMarkdown(ps: readonly PropuestaCandidato[]): string {
  if (!ps.length) return '\n## Candidatos validados\n\nNingún experto ha validado un candidato todavía.\n'
  const filas = ps.flatMap(({ candidato: c, validaciones }) => [
    `### ${c.tipo === 'nota' ? 'SAP Note' : 'T-code'} ${c.clave} — ${c.titulo}`, '', `- **Hipótesis**: ${c.hipotesis}`, `- **Fuente**: ${c.fuente.archivo}:${c.fuente.linea} (${c.fuente.url})`,
    ...validaciones.map((v) => `- ${v.por.prueba ? '(de prueba) ' : ''}${v.por.usuario}, ${v.actualizado.slice(0, 10)}: **${VALORACION_DICHA[v.valoracion]}**${v.correccion ? ` → «${v.correccion}»` : ''}${v.comentario ? ` · «${v.comentario}»` : ''}`),
    '',
  ])
  return ['', '## Candidatos validados', '', 'Son **propuestas**: la mesa no siembra. Una regla nueva se firma en `tools/conocimiento`, con una fuente citable.', '', ...filas].join('\n')
}
