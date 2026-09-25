/**
 * Plan y aplicacion de una importacion de catalogo. El plan NO toca el almacen: se ensena como
 * diff (nuevos, cambiados, sin cambio, conflictos, invalidos) y solo al confirmarlo se aplica,
 * con traza de quien, cuando y con que archivo.
 *
 * Idempotencia: si el archivo no trae codigo para un articulo que ya tiene uno asignado, se
 * CONSERVA el asignado. Por eso resubir el mismo archivo da todo «sin cambio» y cero numeros
 * nuevos. Los conflictos (un GTIN en dos articulos, marca propia con prefijo ajeno, un GTIN de
 * fabricante que cambia) se detienen para decision humana: nunca se resuelven solos.
 */
import { diferencias, reglaDeExistente, validaCodigo, type ErrorFila, type FilaCatalogo, type FilaPlan, type PlanImportacion, type AsignacionPropuesta } from './catalogo.js'
import type { Articulo, Asignacion, EstadoAlmacen, Regla } from './modelo.js'
import { derivaCaja, emiteInterno, emitePropio, esEmision } from './numeracion.js'
import { clasificaPrefijo } from './prefijos.js'

const PROPIAS: readonly Regla[] = ['propio', 'propio-existente']
const REEMPLAZABLES: readonly (Regla | undefined)[] = ['interno', 'interno-existente', undefined]

export function planificaImportacion(filas: readonly FilaCatalogo[], errores: readonly ErrorFila[], estado: EstadoAlmacen): PlanImportacion {
  const cfg = estado.configuracion
  const usados = new Set<string>(estado.emitidos)
  const dueno = new Map<string, string>()
  for (const a of Object.values(estado.articulos)) {
    for (const g of [a.gtinUnidad, a.gtinCaja]) if (g) { usados.add(g); dueno.set(g, a.sku) }
  }
  // Los codigos validos del archivo tampoco se pueden emitir para otro.
  for (const f of filas) for (const t of [f.gtin, f.gtinCaja]) { const v = validaCodigo(t); if (v.estado === 'valido') usados.add(v.gtin) }
  let { propio, interno } = estado.contadores
  const vistos = new Map<string, number>()
  const plan: FilaPlan[] = []

  for (const f of filas) {
    const motivos: string[] = []
    const previo = estado.articulos[f.sku]
    if (vistos.has(f.sku)) { plan.push({ fila: f.fila, sku: f.sku, estado: 'conflicto', motivos: [`el sku aparece también en la fila ${vistos.get(f.sku)}`], cambios: [], nuevas: [] }); continue }
    vistos.set(f.sku, f.fila)
    const vu = validaCodigo(f.gtin)
    const vc = validaCodigo(f.gtinCaja)
    if (vu.estado === 'invalido') motivos.push(`GTIN de pieza «${f.gtin}»: ${vu.motivo}`)
    if (vc.estado === 'invalido') motivos.push(`GTIN de caja «${f.gtinCaja}»: ${vc.motivo}`)
    if (motivos.length) { plan.push({ fila: f.fila, sku: f.sku, estado: 'invalido', motivos, cambios: [], nuevas: [] }); continue }

    // --- conflictos que piden decision humana, ANTES de emitir nada ---------------------
    const conflictos: string[] = []
    const ajeno = (g: string) => { const d = dueno.get(g); return d !== undefined && d !== f.sku ? d : undefined }
    let reglaU: Regla | undefined
    if (vu.estado === 'valido') {
      reglaU = reglaDeExistente(vu.gtin, cfg.prefijoEmpresa, cfg.prefijoInterno)
      if (f.marcaPropia && reglaU === 'fabricante') conflictos.push(`es marca propia pero su GTIN (${vu.gtin}) no está bajo el prefijo de la casa (${cfg.prefijoEmpresa || 'sin configurar'}): nunca se etiqueta con un prefijo ajeno`)
      if (ajeno(vu.gtin)) conflictos.push(`el GTIN ${vu.gtin} ya es del artículo ${ajeno(vu.gtin)}`)
      if (previo?.gtinUnidad && previo.gtinUnidad !== vu.gtin && !REEMPLAZABLES.includes(previo.reglaUnidad)) conflictos.push(`cambia el GTIN de pieza ${previo.gtinUnidad} (${previo.reglaUnidad}) por ${vu.gtin}: confirma con el fabricante antes`)
    }
    if (vc.estado === 'valido') {
      if (ajeno(vc.gtin)) conflictos.push(`el GTIN de caja ${vc.gtin} ya es del artículo ${ajeno(vc.gtin)}`)
      if (vu.estado === 'valido' && vc.gtin === vu.gtin && f.unidadesPorCaja > 1) conflictos.push(`la caja trae ${f.unidadesPorCaja} piezas y no puede llevar el mismo GTIN que la pieza`)
    }
    if (conflictos.length) { plan.push({ fila: f.fila, sku: f.sku, estado: 'conflicto', motivos: conflictos, cambios: [], nuevas: [] }); continue }

    // --- pieza --------------------------------------------------------------------------
    const nuevas: AsignacionPropuesta[] = []
    const notas: string[] = []
    let gtinU: string | undefined
    if (vu.estado === 'valido') {
      gtinU = vu.gtin
      if (previo?.gtinUnidad !== gtinU) nuevas.push({ nivel: 'unidad', gtin: gtinU, regla: reglaU!, emitido: false, ...(previo?.gtinUnidad ? { anterior: previo.gtinUnidad } : {}) })
    } else if (previo?.gtinUnidad) {
      gtinU = previo.gtinUnidad; reglaU = previo.reglaUnidad
    } else {
      const r = f.marcaPropia ? emitePropio(cfg.prefijoEmpresa, propio, usados) : emiteInterno(cfg.prefijoInterno, interno, usados)
      if (!esEmision(r)) { plan.push({ fila: f.fila, sku: f.sku, estado: 'conflicto', motivos: [`no se pudo numerar: ${r.error}`], cambios: [], nuevas: [] }); continue }
      if (f.marcaPropia) propio = r.siguiente; else interno = r.siguiente
      gtinU = r.numero; reglaU = f.marcaPropia ? 'propio' : 'interno'
      usados.add(gtinU)
      nuevas.push({ nivel: 'unidad', gtin: gtinU, regla: reglaU, emitido: true })
    }

    // --- caja ---------------------------------------------------------------------------
    let gtinC: string | undefined
    let reglaC: Regla | undefined
    const mismaCaja = previo?.gtinCaja && previo.unidadesPorCaja === f.unidadesPorCaja && previo.gtinUnidad === gtinU
    if (vc.estado === 'valido') {
      gtinC = vc.gtin; reglaC = reglaDeExistente(vc.gtin, cfg.prefijoEmpresa, cfg.prefijoInterno)
      if (previo?.gtinCaja !== gtinC) nuevas.push({ nivel: 'caja', gtin: gtinC, regla: reglaC, emitido: false, ...(previo?.gtinCaja ? { anterior: previo.gtinCaja } : {}) })
    } else if (mismaCaja) {
      gtinC = previo!.gtinCaja; reglaC = previo!.reglaCaja
    } else if (f.unidadesPorCaja === 1) {
      gtinC = gtinU; reglaC = 'igual-unidad'
      if (previo?.gtinCaja !== gtinC && gtinC) nuevas.push({ nivel: 'caja', gtin: gtinC, regla: reglaC, emitido: false })
    } else if (reglaU && PROPIAS.includes(reglaU)) {
      gtinC = derivaCaja(gtinU!, usados); reglaC = 'derivado-caja'
      if (!gtinC) { plan.push({ fila: f.fila, sku: f.sku, estado: 'conflicto', motivos: ['los ocho indicadores de caja (1-8) ya están usados'], cambios: [], nuevas: [] }); continue }
      nuevas.push({ nivel: 'caja', gtin: gtinC, regla: reglaC, emitido: true })
    } else {
      const r = emiteInterno(cfg.prefijoInterno, interno, usados)
      if (!esEmision(r)) { plan.push({ fila: f.fila, sku: f.sku, estado: 'conflicto', motivos: [`no se pudo numerar la caja: ${r.error}`], cambios: [], nuevas: [] }); continue }
      interno = r.siguiente; gtinC = r.numero; reglaC = 'interno'
      nuevas.push({ nivel: 'caja', gtin: gtinC, regla: reglaC, emitido: true })
    }
    if (gtinC) usados.add(gtinC)
    if (reglaU === 'fabricante' && reglaC === 'interno') notas.push('Pide al fabricante el GTIN-14 de la caja: el de la pieza no sirve para la caja, y un GTIN con su prefijo solo lo puede asignar él.')
    if (reglaU === 'interno' || reglaC === 'interno' || reglaU === 'interno-existente') notas.push('Código de circulación restringida: solo vale dentro de la cadena.')

    const articulo: Articulo = {
      sku: f.sku, descripcion: f.descripcion, categoria: f.categoria, sitios: f.sitios, marcaPropia: f.marcaPropia,
      ...(gtinU ? { gtinUnidad: gtinU } : {}), ...(reglaU ? { reglaUnidad: reglaU } : {}),
      ...(gtinC ? { gtinCaja: gtinC } : {}), ...(reglaC ? { reglaCaja: reglaC } : {}),
      unidadesPorCaja: f.unidadesPorCaja,
      ...(f.cajasPorTarima ? { cajasPorTarima: f.cajasPorTarima } : {}), ...(f.vidaUtilDias ? { vidaUtilDias: f.vidaUtilDias } : {}),
      notas,
    }
    for (const g of [gtinU, gtinC]) if (g) dueno.set(g, f.sku)
    if (!previo) { plan.push({ fila: f.fila, sku: f.sku, estado: 'nuevo', motivos: [], cambios: [], articulo, nuevas }); continue }
    const cambios = diferencias(previo, articulo)
    plan.push({ fila: f.fila, sku: f.sku, estado: cambios.length ? 'cambiado' : 'sin-cambio', motivos: [], cambios, articulo, nuevas })
  }
  return { filas: plan, errores, resumen: resume(plan, filas, errores), contadores: { ...estado.contadores, propio, interno } }
}

function resume(plan: readonly FilaPlan[], filas: readonly FilaCatalogo[], errores: readonly ErrorFila[]): Record<string, number> {
  const r: Record<string, number> = { filas: filas.length + errores.length, 'filas-con-error': errores.length }
  const suma = (k: string, n = 1) => { r[k] = (r[k] ?? 0) + n }
  for (const p of plan) {
    suma(p.estado)
    for (const n of p.nuevas) suma(`${n.emitido ? 'asignado' : 'registrado'}:${n.regla}`)
  }
  const validados = filas.reduce((n, f) => n + [f.gtin, f.gtinCaja].filter((t) => validaCodigo(t).estado === 'valido').length, 0)
  r['codigos-validados'] = validados
  return r
}

export interface MetaImportacion {
  readonly id: string
  readonly archivo: string
  readonly huella: string
  readonly operador: string
  readonly fecha: string
}

export function aplicaImportacion(estado: EstadoAlmacen, plan: PlanImportacion, meta: MetaImportacion): EstadoAlmacen {
  const articulos: Record<string, Articulo> = { ...estado.articulos }
  const asignaciones: Asignacion[] = [...estado.asignaciones]
  const emitidos = new Set(estado.emitidos)
  for (const p of plan.filas) {
    if (!p.articulo || (p.estado !== 'nuevo' && p.estado !== 'cambiado')) continue
    articulos[p.sku] = p.articulo
    for (const n of p.nuevas) {
      asignaciones.push({ gtin: n.gtin, sku: p.sku, nivel: n.nivel, regla: n.regla, operador: meta.operador, fecha: meta.fecha, importacion: meta.id, ...(n.anterior ? { anterior: n.anterior } : {}) })
    }
    // Todo lo que es de la casa queda emitido para siempre, venga del archivo o del contador.
    for (const [g, regla] of [[p.articulo.gtinUnidad, p.articulo.reglaUnidad], [p.articulo.gtinCaja, p.articulo.reglaCaja]] as const) {
      if (g && regla && regla !== 'fabricante') emitidos.add(g)
    }
  }
  return {
    ...estado,
    version: estado.version + 1,
    articulos,
    asignaciones,
    emitidos: [...emitidos],
    contadores: plan.contadores,
    importaciones: [...estado.importaciones, { id: meta.id, archivo: meta.archivo, huella: meta.huella, operador: meta.operador, fecha: meta.fecha, resumen: plan.resumen }],
  }
}

/** Filas para exportar a CSV o Excel: el catalogo con sus codigos y la regla de cada uno. */
export function filasDeExportacion(estado: EstadoAlmacen): string[][] {
  const cab = ['sku', 'descripcion', 'categoria', 'sitios', 'marca_propia', 'gtin', 'regla_gtin', 'gtin_caja', 'regla_caja', 'circulacion', 'unidades_por_caja', 'cajas_por_tarima', 'vida_util_dias', 'notas']
  const filas = Object.values(estado.articulos).sort((a, b) => a.sku.localeCompare(b.sku)).map((a) => [
    a.sku, a.descripcion, a.categoria, a.sitios.join(';'), a.marcaPropia ? 'SI' : 'NO', a.gtinUnidad ?? '', a.reglaUnidad ?? '', a.gtinCaja ?? '', a.reglaCaja ?? '',
    [a.gtinUnidad, a.gtinCaja].some((g) => g && clasificaPrefijo(g).clase.startsWith('restringido')) ? 'restringida (solo dentro de la cadena)' : 'global',
    String(a.unidadesPorCaja), a.cajasPorTarima ? String(a.cajasPorTarima) : '', a.vidaUtilDias ? String(a.vidaUtilDias) : '', a.notas.join(' '),
  ])
  return [cab, ...filas]
}
