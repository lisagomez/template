/**
 * Impactos proyectados en MXN y accionables recomendados. Cada proyección muestra su FÓRMULA, sus
 * SUPUESTOS (parámetros, D15) y su RANGO (bajo, central, alto); cada accionable trae su evidencia del
 * corte semántico, su confianza y su responsable. Una proyección no es una promesa: la pantalla lo
 * dice. Si un parámetro cambia, todo se recalcula y se ve el antes y el después.
 *
 * Dos familias, porque el dinero es de partes distintas:
 *   · para la CONSULTORA: horas de consultor que se dejan de gastar × su costo hora;
 *   · para el N3: horas de paro que se evitan × su costo de paro por hora.
 * La del N3 solo usa métricas visibles al cliente.
 */
import { leeMetrica, type Corte, type Lector } from './corte.js'

export interface Rango { readonly bajo: number; readonly central: number; readonly alto: number }

export interface Parametro {
  readonly nombre: string
  readonly rango: Rango
  readonly unidad: string
  readonly naturaleza: 'supuesta' | 'derivada'
  readonly fuente: string
}

/** Fuente pública del salario (consultada el 2026-10-04). */
export const FUENTE_SALARIO = 'Jooble México, «Consultor SAP», estadística del 30-09-2026: $34,202 al mes, $201.19 por hora (https://mx.jooble.org/salary/consultor-sap)'
const SALARIO_HORA = 201.19

/** Los parámetros del laboratorio: SUPUESTOS hasta que la consultora los capture por cliente (D15). */
export const PARAMETROS_LABORATORIO: Readonly<Record<string, Parametro>> = {
  costoHoraConsultor: {
    nombre: 'costo hora del consultor', unidad: 'MXN/h', naturaleza: 'derivada',
    rango: { bajo: Math.round(SALARIO_HORA * 1.3), central: Math.round(SALARIO_HORA * 1.6), alto: Math.round(SALARIO_HORA * 2) },
    fuente: `salario por hora (${FUENTE_SALARIO}) × factor de carga 1.3 / 1.6 / 2.0 (SUPUESTO: prestaciones, cuotas e indirectos)`,
  },
  costoParoP1: { nombre: 'costo de una hora de paro P1', unidad: 'MXN/h', naturaleza: 'supuesta', rango: { bajo: 5_000, central: 20_000, alto: 80_000 }, fuente: 'SUPUESTO del laboratorio sin fuente: lo captura la consultora con su cliente (D15)' },
  costoParoP2: { nombre: 'costo de una hora de paro P2', unidad: 'MXN/h', naturaleza: 'supuesta', rango: { bajo: 1_000, central: 5_000, alto: 20_000 }, fuente: 'SUPUESTO del laboratorio sin fuente: lo captura la consultora con su cliente (D15)' },
  fraccionSembrable: { nombre: 'fracción de lo resuelto sin regla que se puede volver regla', unidad: 'fracción', naturaleza: 'supuesta', rango: { bajo: 0.2, central: 0.35, alto: 0.5 }, fuente: 'SUPUESTO del laboratorio: casos repetibles entre los resueltos sin regla' },
  ahorroPorRegla: { nombre: 'horas de consultor que ahorra una regla por incidencia', unidad: 'fracción de las horas', naturaleza: 'supuesta', rango: { bajo: 0.2, central: 0.35, alto: 0.5 }, fuente: 'SUPUESTO del laboratorio: KCS reporta menos tiempo con solución conocida; sin medición propia' },
  retrabajoPorReapertura: { nombre: 'horas de retrabajo por reapertura', unidad: 'fracción de las horas por incidencia', naturaleza: 'supuesta', rango: { bajo: 0.3, central: 0.5, alto: 0.8 }, fuente: 'SUPUESTO del laboratorio' },
  horasDeParoPorIncumplimiento: { nombre: 'horas de paro de más por respuesta tardía', unidad: 'h', naturaleza: 'supuesta', rango: { bajo: 0.25, central: 1, alto: 3 }, fuente: 'SUPUESTO del laboratorio: el retraso de la primera respuesta alarga el paro' },
}

export interface Evidencia { readonly metrica: string; readonly valor: number; readonly fuente: string }

export interface Accionable {
  readonly id: string
  readonly para: 'consultora' | 'n3'
  readonly titulo: string
  readonly evidencia: readonly Evidencia[]
  readonly formula: string
  readonly supuestos: readonly Parametro[]
  readonly impactoMxn: Rango
  readonly confianza: 'baja' | 'media'
  readonly responsable: string
  readonly aviso: string
}

const AVISO = 'Proyección con supuestos, no una promesa: cambia si cambian los parámetros.'

type Donde = { alcance: 'cliente'; consultora: string; cliente: string }

/** Lee una métrica para la evidencia; si no hay dato, no hay accionable (no se inventa). */
function ev(corte: Corte, lector: Lector, metrica: string, periodo: string, d: Donde): Evidencia | null {
  const r = leeMetrica(corte, lector, { metrica, periodo, ...d })
  return r.valor === null ? null : { metrica, valor: r.valor, fuente: r.fuente }
}

const rango = (f: (k: keyof Rango) => number): Rango => {
  const r = { bajo: f('bajo'), central: f('central'), alto: f('alto') }
  const [a, b, c] = [r.bajo, r.central, r.alto].map((x) => Math.round(x)).sort((x, y) => x - y) as [number, number, number]
  return { bajo: a, central: b, alto: c }
}
/** Con pocas incidencias en el periodo, la confianza es baja; con supuestos de por medio, nunca pasa de media. */
const confianzaDe = (volumen: number): Accionable['confianza'] => (volumen < 15 ? 'baja' : 'media')

/** Los accionables de un cliente en un periodo, con los parámetros dados (por defecto, los del laboratorio). */
export function accionables(corte: Corte, consultora: string, cliente: string, periodo: string, p: Readonly<Record<string, Parametro>> = PARAMETROS_LABORATORIO): Accionable[] {
  const d: Donde = { alcance: 'cliente', consultora, cliente }
  const n2: Lector = { nivel: 'N2', consultora }
  const n3: Lector = { nivel: 'N3', consultora, cliente }
  const fuera: Accionable[] = []
  const volumen = ev(corte, n2, 'volumen', periodo, d)
  const horas = ev(corte, n2, 'horas_por_ticket', periodo, d)
  const reuso = ev(corte, n2, 'reuso_conocimiento', periodo, d)
  const resueltas = ev(corte, n2, 'resueltas', periodo, d)
  const reapertura = ev(corte, n2, 'tasa_reapertura', periodo, d)
  const costoHora = p.costoHoraConsultor!

  if (volumen && horas && reuso && resueltas && reuso.valor < 1) {
    const fs = p.fraccionSembrable!, ah = p.ahorroPorRegla!
    fuera.push({
      id: 'sembrar-reglas', para: 'consultora', titulo: 'Volver regla lo que se resuelve sin solución conocida',
      evidencia: [resueltas, reuso, horas],
      formula: 'resueltas × (1 − reuso del conocimiento) × fracción sembrable × horas por incidencia × ahorro por regla × costo hora',
      supuestos: [fs, ah, costoHora],
      impactoMxn: rango((k) => resueltas.valor * (1 - reuso.valor) * fs.rango[k] * horas.valor * ah.rango[k] * costoHora.rango[k]),
      confianza: confianzaDe(volumen.valor), responsable: 'consultora (propone el FDE, aprueba el HIL)', aviso: AVISO,
    })
  }
  if (volumen && horas && resueltas && reapertura && reapertura.valor > 0) {
    const rt = p.retrabajoPorReapertura!
    fuera.push({
      id: 'reducir-reaperturas', para: 'consultora', titulo: 'Cerrar con verificación del cliente para no reabrir',
      evidencia: [resueltas, reapertura, horas],
      formula: 'resueltas × tasa de reapertura × horas por incidencia × retrabajo por reapertura × costo hora',
      supuestos: [rt, costoHora],
      impactoMxn: rango((k) => resueltas.valor * reapertura.valor * horas.valor * rt.rango[k] * costoHora.rango[k]),
      confianza: confianzaDe(volumen.valor), responsable: 'consultora', aviso: AVISO,
    })
  }
  // Para el N3: solo métricas que el cliente ve de sí mismo.
  const vol3 = ev(corte, n3, 'volumen', periodo, d)
  const t1 = ev(corte, n3, 'respuestas_tardias_p1', periodo, d)
  const t2 = ev(corte, n3, 'respuestas_tardias_p2', periodo, d)
  if (vol3 && t1 && t2 && t1.valor + t2.valor > 0) {
    const hp = p.horasDeParoPorIncumplimiento!, p1 = p.costoParoP1!, p2 = p.costoParoP2!
    fuera.push({
      id: 'responder-a-tiempo', para: 'n3', titulo: 'Responder a tiempo los P1 y P2 (alerta al 80 % de la meta)',
      evidencia: [t1, t2, vol3],
      formula: '(respuestas tardías P1 × costo de una hora de paro P1 + respuestas tardías P2 × costo de una hora de paro P2) × horas de paro de más por respuesta tardía',
      supuestos: [hp, p1, p2],
      impactoMxn: rango((k) => (t1.valor * p1.rango[k] + t2.valor * p2.rango[k]) * hp.rango[k]),
      confianza: confianzaDe(vol3.valor), responsable: 'consultora, con el cliente', aviso: AVISO,
    })
  }
  return fuera
}

export interface Cambio { readonly id: string; readonly antes: Rango; readonly despues: Rango }

/** Cambia un parámetro y muestra el antes y el después de cada proyección. */
export function recalcula(corte: Corte, consultora: string, cliente: string, periodo: string, nombre: string, nuevo: Rango): { parametros: Record<string, Parametro>; cambios: Cambio[] } {
  const antes = accionables(corte, consultora, cliente, periodo)
  const base = PARAMETROS_LABORATORIO[nombre]
  if (!base) throw new Error(`no existe el parámetro ${nombre}`)
  const parametros = { ...PARAMETROS_LABORATORIO, [nombre]: { ...base, rango: nuevo, naturaleza: 'supuesta' as const, fuente: `capturado por la consultora (antes: ${base.fuente})` } }
  const despues = accionables(corte, consultora, cliente, periodo, parametros)
  return { parametros, cambios: antes.map((a) => ({ id: a.id, antes: a.impactoMxn, despues: despues.find((x) => x.id === a.id)!.impactoMxn })) }
}

// --- El FODA del N3: cada punto cita su dato ------------------------------------------------------

/** `confianza`: la del volumen del cliente en el periodo; con pocas incidencias, un 100 % no dice mucho (PRP-010 H-28). */
export interface PuntoFoda { readonly texto: string; readonly datos: readonly Evidencia[]; readonly criterio: string; readonly confianza: Accionable['confianza'] }
export interface Foda { readonly fortalezas: readonly PuntoFoda[]; readonly debilidades: readonly PuntoFoda[]; readonly oportunidades: readonly PuntoFoda[]; readonly amenazas: readonly PuntoFoda[] }

/** Los umbrales del FODA: SUPUESTOS del laboratorio, a la vista junto a cada punto. */
export const CRITERIOS_FODA = {
  slaBueno: 0.95, slaMalo: 0.9, primerContactoBueno: 0.7, reaperturaMala: 0.1,
  fuente: 'SUPUESTO del laboratorio (umbrales del FODA); la consultora los ajusta con su cliente',
} as const

const mesAnterior = (p: string) => { const [a, m] = p.split('-').map(Number) as [number, number]; return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}` }

/** El FODA que ve el N3, armado con SUS métricas visibles y con los accionables para él. */
export function foda(corte: Corte, consultora: string, cliente: string, periodo: string): Foda {
  const n3: Lector = { nivel: 'N3', consultora, cliente }
  const d: Donde = { alcance: 'cliente', consultora, cliente }
  const c = CRITERIOS_FODA
  const sla = ev(corte, n3, 'cumplimiento_sla_respuesta', periodo, d)
  const fcr = ev(corte, n3, 'resolucion_primer_contacto', periodo, d)
  const reab = ev(corte, n3, 'tasa_reapertura', periodo, d)
  const backlog = ev(corte, n3, 'backlog', periodo, d)
  const backlogAntes = ev(corte, n3, 'backlog', mesAnterior(periodo), d)
  // Sin volumen no hay con qué medir la confianza: «baja», nunca la de un cliente con datos.
  const confianza = confianzaDe(ev(corte, n3, 'volumen', periodo, d)?.valor ?? 0)
  const F: PuntoFoda[] = [], D: PuntoFoda[] = [], A: PuntoFoda[] = []
  if (sla && sla.valor >= c.slaBueno) F.push({ texto: 'Las incidencias críticas se responden a tiempo', datos: [sla], criterio: `cumplimiento ≥ ${c.slaBueno} (${c.fuente})`, confianza })
  if (sla && sla.valor < c.slaMalo) D.push({ texto: 'Hay incidencias críticas que se respondieron tarde', datos: [sla], criterio: `cumplimiento < ${c.slaMalo} (${c.fuente})`, confianza })
  if (fcr && fcr.valor >= c.primerContactoBueno) F.push({ texto: 'La mayoría se resuelve sin esperarte ni reabrirse', datos: [fcr], criterio: `primer contacto ≥ ${c.primerContactoBueno} (${c.fuente})`, confianza })
  if (fcr && fcr.valor < c.primerContactoBueno) D.push({ texto: 'Muchas incidencias necesitan esperarte o se reabren', datos: [fcr], criterio: `primer contacto < ${c.primerContactoBueno} (${c.fuente})`, confianza })
  if (reab && reab.valor > c.reaperturaMala) D.push({ texto: 'Se reabren demasiadas incidencias', datos: [reab], criterio: `reapertura > ${c.reaperturaMala} (${c.fuente})`, confianza })
  if (backlog && backlogAntes && backlog.valor > backlogAntes.valor) A.push({ texto: 'El backlog creció respecto del mes anterior', datos: [backlogAntes, backlog], criterio: 'backlog del periodo > backlog del mes anterior', confianza })
  const O = accionables(corte, consultora, cliente, periodo).filter((a) => a.para === 'n3')
    .map((a) => ({ texto: `${a.titulo}: entre $${a.impactoMxn.bajo.toLocaleString('es-MX')} y $${a.impactoMxn.alto.toLocaleString('es-MX')} MXN al mes de paro evitado (proyección)`, datos: a.evidencia, criterio: `${a.formula}. ${a.aviso}`, confianza: a.confianza }))
  return { fortalezas: F, debilidades: D, oportunidades: O, amenazas: A }
}
