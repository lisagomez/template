/**
 * El SAP SIMULADO de cada cliente del laboratorio. Nada aquí toca un SAP real: «implementar una
 * solución» en el laboratorio es aplicarla a este estado. Las acciones llevan precondición, efecto y
 * si se pueden revertir; en simulación (el valor por defecto) devuelven el antes y el después sin
 * cambiar nada; en ejecución exigen la aprobación humana (la fila de la sala) que el llamador ya
 * verificó.
 */

export type Sistema = 'ECC' | 'S4HANA'

export type AccionSimulador =
  | 'abre_periodo_mm' | 'abre_periodo_fi' | 'desbloquea_usuario' | 'reprocesa_idoc'
  | 'corrige_rfc_receptor' | 'reenvia_cfdi' | 'ajusta_rango' | 'reprograma_job'

export interface SapSimulado {
  readonly cliente: string
  readonly sistema: Sistema
  readonly release: string
  /** Periodos abiertos (`AAAA-MM`) por sociedad, en FI y en MM. */
  readonly periodos: Readonly<Record<string, { readonly fi: readonly string[]; readonly mm: readonly string[] }>>
  readonly usuarios: Readonly<Record<string, { readonly bloqueado: boolean }>>
  readonly idocs: Readonly<Record<string, { readonly estado: number }>>
  readonly bps: Readonly<Record<string, { readonly rfc: string }>>
  readonly cfdis: Readonly<Record<string, { readonly estado: 'rechazado' | 'timbrado'; readonly bp: string }>>
  /** RFC que el PAC simulado acepta (la «lista de contribuyentes obligados»). */
  readonly lco: readonly string[]
  readonly rangos: Readonly<Record<string, { readonly nivel: number; readonly maxUsado: number }>>
  readonly jobs: Readonly<Record<string, { readonly estado: 'cancelado' | 'programado' }>>
}

export interface PasoSolucion {
  readonly accion: AccionSimulador
  readonly parametros: Readonly<Record<string, string>>
  readonly descripcion: string
}

export interface Aplicacion {
  readonly sap: SapSimulado
  readonly antes: string
  readonly despues: string
  readonly reversible: boolean
}

export interface Aprobacion {
  readonly taskId: string
  readonly sha256: string
  readonly decididaPor: string
}

export class NoAplica extends Error {
  override readonly name = 'NoAplica'
}

const exige = (cond: unknown, msg: string): void => {
  if (!cond) throw new NoAplica(msg)
}

const p = (paso: PasoSolucion, nombre: string): string => {
  const v = paso.parametros[nombre]
  exige(v && /^[A-Za-z0-9_\-/.]{1,40}$/.test(v), `parámetro «${nombre}» ausente o con forma inválida`)
  return v!
}

type Efecto = (sap: SapSimulado, paso: PasoSolucion) => Omit<Aplicacion, 'reversible'>

const abrePeriodo = (libro: 'fi' | 'mm'): Efecto => (sap, paso) => {
  const soc = p(paso, 'sociedad'), per = p(paso, 'periodo')
  const actual = sap.periodos[soc]
  exige(actual, `la sociedad ${soc} no existe`)
  exige(!actual![libro].includes(per), `el periodo ${per} de ${libro.toUpperCase()} ya está abierto en ${soc}`)
  const nuevo = { ...actual!, [libro]: [...actual![libro], per].sort() }
  return { sap: { ...sap, periodos: { ...sap.periodos, [soc]: nuevo } }, antes: `${libro.toUpperCase()} ${soc}: ${actual![libro].join(', ')}`, despues: `${libro.toUpperCase()} ${soc}: ${nuevo[libro].join(', ')}` }
}

const EFECTOS: Readonly<Record<AccionSimulador, { efecto: Efecto; reversible: boolean }>> = {
  abre_periodo_mm: { efecto: abrePeriodo('mm'), reversible: true },
  abre_periodo_fi: { efecto: abrePeriodo('fi'), reversible: true },
  desbloquea_usuario: { reversible: true, efecto: (sap, paso) => {
    const u = p(paso, 'usuario')
    exige(sap.usuarios[u]?.bloqueado, `el usuario ${u} no está bloqueado`)
    return { sap: { ...sap, usuarios: { ...sap.usuarios, [u]: { bloqueado: false } } }, antes: `${u}: bloqueado`, despues: `${u}: activo` }
  } },
  reprocesa_idoc: { reversible: false, efecto: (sap, paso) => {
    const n = p(paso, 'idoc')
    exige(sap.idocs[n]?.estado === 51, `el IDoc ${n} no está en estado 51`)
    return { sap: { ...sap, idocs: { ...sap.idocs, [n]: { estado: 53 } } }, antes: `IDoc ${n}: 51 (error de aplicación)`, despues: `IDoc ${n}: 53 (contabilizado)` }
  } },
  corrige_rfc_receptor: { reversible: true, efecto: (sap, paso) => {
    const bp = p(paso, 'bp'), rfc = p(paso, 'rfc')
    exige(sap.bps[bp], `el interlocutor ${bp} no existe`)
    exige(sap.lco.includes(rfc), `el RFC ${rfc} tampoco está en la LCO: corregirlo no resuelve`)
    return { sap: { ...sap, bps: { ...sap.bps, [bp]: { rfc } } }, antes: `BP ${bp}: RFC ${sap.bps[bp]!.rfc}`, despues: `BP ${bp}: RFC ${rfc}` }
  } },
  reenvia_cfdi: { reversible: false, efecto: (sap, paso) => {
    const uuid = p(paso, 'uuid')
    const c = sap.cfdis[uuid]
    exige(c?.estado === 'rechazado', `el CFDI ${uuid} no está rechazado`)
    exige(sap.lco.includes(sap.bps[c!.bp]?.rfc ?? ''), 'el RFC del receptor sigue fuera de la LCO: el PAC lo rechazaría otra vez')
    return { sap: { ...sap, cfdis: { ...sap.cfdis, [uuid]: { ...c!, estado: 'timbrado' } } }, antes: `CFDI ${uuid}: rechazado`, despues: `CFDI ${uuid}: timbrado` }
  } },
  ajusta_rango: { reversible: true, efecto: (sap, paso) => {
    const r = p(paso, 'rango')
    const actual = sap.rangos[r]
    exige(actual && actual.nivel <= actual.maxUsado, `el rango ${r} no está desfasado`)
    const nivel = actual!.maxUsado + 1
    return { sap: { ...sap, rangos: { ...sap.rangos, [r]: { ...actual!, nivel } } }, antes: `rango ${r}: nivel ${actual!.nivel}`, despues: `rango ${r}: nivel ${nivel}` }
  } },
  reprograma_job: { reversible: true, efecto: (sap, paso) => {
    const j = p(paso, 'job')
    exige(sap.jobs[j]?.estado === 'cancelado', `el job ${j} no está cancelado`)
    return { sap: { ...sap, jobs: { ...sap.jobs, [j]: { estado: 'programado' } } }, antes: `job ${j}: cancelado`, despues: `job ${j}: programado` }
  } },
}

/** El efecto de un paso sobre un estado (inmutable): el estado que resultaría y su antes y después. */
function efecto(sap: SapSimulado, paso: PasoSolucion): Aplicacion {
  const def = EFECTOS[paso.accion]
  exige(def, `acción desconocida: ${paso.accion}`)
  return { ...def.efecto(sap, paso), reversible: def.reversible }
}

export interface ResultadoPlan {
  readonly resultados: readonly Aplicacion[]
  /** El estado al final del plan. En `simula` es una PREVISIÓN: el estado original no cambia. */
  readonly final: SapSimulado
}

function encadena(sap: SapSimulado, pasos: readonly PasoSolucion[]): ResultadoPlan {
  let actual = sap
  const resultados: Aplicacion[] = []
  for (const paso of pasos) {
    const r = efecto(actual, paso)
    resultados.push(r)
    actual = r.sap
  }
  return { resultados, final: actual }
}

/** Dry-run: qué pasaría con cada paso, sin aprobación y sin cambiar nada. O aplican todos o lanza. */
export const simula = (sap: SapSimulado, pasos: readonly PasoSolucion[]): ResultadoPlan => encadena(sap, pasos)

/**
 * Ejecuta el plan en el simulador. Exige la aprobación humana de la sala (que el llamador verificó
 * con `aprobado(sala, taskId, sha256)`): sin ella, no corre. El estado nuevo lo persiste el llamador.
 */
export function ejecuta(sap: SapSimulado, pasos: readonly PasoSolucion[], aprobacion: Aprobacion | null): ResultadoPlan {
  if (!aprobacion) throw new NoAplica('sin aprobación humana no se ejecuta: la simulación es lo único que corre sin ella')
  return encadena(sap, pasos)
}

export type Sintoma =
  | { readonly tipo: 'periodo_cerrado'; readonly libro: 'fi' | 'mm'; readonly sociedad: string; readonly periodo: string }
  | { readonly tipo: 'usuario_bloqueado'; readonly usuario: string }
  | { readonly tipo: 'idoc_en_error'; readonly idoc: string }
  | { readonly tipo: 'cfdi_rechazado'; readonly uuid: string }
  | { readonly tipo: 'rango_desfasado'; readonly rango: string }
  | { readonly tipo: 'job_cancelado'; readonly job: string }

/** ¿El error de la incidencia se reproduce en este estado? Sirve para el antes y el después. */
export function reproduce(sap: SapSimulado, s: Sintoma): boolean {
  switch (s.tipo) {
    case 'periodo_cerrado': return !(sap.periodos[s.sociedad]?.[s.libro] ?? []).includes(s.periodo)
    case 'usuario_bloqueado': return sap.usuarios[s.usuario]?.bloqueado === true
    case 'idoc_en_error': return sap.idocs[s.idoc]?.estado === 51
    case 'cfdi_rechazado': return sap.cfdis[s.uuid]?.estado === 'rechazado'
    case 'rango_desfasado': { const r = sap.rangos[s.rango]; return r !== undefined && r.nivel <= r.maxUsado }
    case 'job_cancelado': return sap.jobs[s.job]?.estado === 'cancelado'
  }
}
