/**
 * El modelo de pricing de Soporte SAP. Se DISEÑA el modelo y se MIDE el costo; el precio no:
 *
 *   variables del N3 (tamaño, volumen, proporción crítica, proporción compleja, respuesta 24×7)
 *     → tier (reglas con umbrales SUPUESTOS del laboratorio, a confirmar: D11)
 *     → consumo del tier (el estimado: cada cifra medida, derivada o supuesta, con su fuente)
 *     → costo = consumo × precio unitario (POR DECIDIR: proveedor D12, modelo D7)
 *     → precio de venta (POR DECIDIR: plan comercial, ERP-7 y D5).
 *
 * Ninguna cifra de precio aquí. Las variables que son métricas salen del corte semántico (no se
 * calculan); las que son del contrato, del contrato.
 */
import { consumoMensual, INCIDENCIAS_MES, supuesta, type Cifra, type Insumos, type Rubro, type Tamano } from './estimado.js'
import type { ContratoSla, PorDecidir } from './sla.js'
import type { Prioridad } from './categoriza.js'

export type Tier = 'esencial' | 'profesional' | 'critico'

export interface VariablesN3 {
  readonly tamano: Tamano
  /** Del corte semántico (o `null` si no hay dato del periodo). */
  readonly volumenMes: number | null
  readonly proporcionCritica: number | null
  readonly proporcionCompleja: number | null
  /** Del contrato: ¿alguna meta corre en calendario continuo (24×7)? */
  readonly respuesta24x7: boolean
}

/** Los umbrales de los tiers: SUPUESTOS del laboratorio. Definen lo que se vende, así que los confirma él (D11). */
export const UMBRALES_TIER = {
  criticaParaCritico: supuesta(0.3, 'proporción P1+P2', 'SUPUESTO (D11): con 24×7 y tres de cada diez incidencias críticas, el tier es crítico'),
  criticaParaCriticoL: supuesta(0.2, 'proporción P1+P2', 'SUPUESTO (D11): un N3 grande con dos de cada diez críticas también'),
  complejaParaProfesional: supuesta(0.4, 'proporción de complejidad alta', 'SUPUESTO (D11): cuatro de cada diez sin regla o complejas piden más consultor'),
} as const

export interface Clasificacion { readonly tier: Tier; readonly razones: readonly string[]; readonly faltan: readonly string[] }

/** Variables → tier. Lo que falta, falta: sin la proporción crítica no se sube a crítico por adivinar. */
export function tierDe(v: VariablesN3): Clasificacion {
  const u = UMBRALES_TIER
  const faltan = [v.volumenMes === null && 'volumen', v.proporcionCritica === null && 'proporción crítica', v.proporcionCompleja === null && 'proporción compleja'].filter(Boolean) as string[]
  const critica = v.proporcionCritica
  if (critica !== null && v.respuesta24x7 && critica >= u.criticaParaCritico.valor!) return { tier: 'critico', razones: [`respuesta 24×7 y proporción crítica ${critica} ≥ ${u.criticaParaCritico.valor} (supuesto)`], faltan }
  if (critica !== null && v.tamano === 'L' && critica >= u.criticaParaCriticoL.valor!) return { tier: 'critico', razones: [`tamaño L y proporción crítica ${critica} ≥ ${u.criticaParaCriticoL.valor} (supuesto)`], faltan }
  if (v.tamano !== 'S') return { tier: 'profesional', razones: [`tamaño ${v.tamano}`], faltan }
  if (v.proporcionCompleja !== null && v.proporcionCompleja >= u.complejaParaProfesional.valor!) return { tier: 'profesional', razones: [`proporción compleja ${v.proporcionCompleja} ≥ ${u.complejaParaProfesional.valor} (supuesto)`], faltan }
  return { tier: 'esencial', razones: ['tamaño S, sin 24×7 crítico ni complejidad alta'], faltan }
}

/** ¿El contrato pide respuesta en calendario continuo para alguna prioridad? */
export const pide24x7 = (c: ContratoSla): boolean => Object.values(c.metas).some((m) => m.calendario === 'continuo' && m.respuestaMin !== null)

export interface LineaDeCosto {
  readonly rubro: Rubro | 'horasConsultor'
  readonly consumo: Cifra
  readonly precioUnitario: PorDecidir<number>
  /** Costo = consumo × precio unitario. Sin precio unitario: «no medido», nunca un cero. */
  readonly costo: Cifra
}

const QUIEN_PRECIO_INFRA = 'el laboratorio, con el proveedor del VPS elegido (D12)'
const PRECIO_UNITARIO: Readonly<Record<Rubro | 'horasConsultor', PorDecidir<number>>> = {
  bd: { valor: null, quienDecide: 'el laboratorio: el plan está decidido (D10, Supabase Pro con PITR) y la cifra sale de la cotización vigente' },
  storage: { valor: null, quienDecide: QUIEN_PRECIO_INFRA },
  paginasOcr: { valor: null, quienDecide: 'no aplica: el OCR es local; su costo es CPU (cpuOcr)' },
  cpuOcr: { valor: null, quienDecide: QUIEN_PRECIO_INFRA },
  tokens: { valor: null, quienDecide: 'el laboratorio, con el modelo permitido por clase de dato (D7)' },
  cpuApp: { valor: null, quienDecide: QUIEN_PRECIO_INFRA },
  respaldo: { valor: null, quienDecide: 'el laboratorio, con el destino de respaldo (D12)' },
  egreso: { valor: null, quienDecide: QUIEN_PRECIO_INFRA },
  horasConsultor: { valor: null, quienDecide: 'la consultora: su costo por hora' },
}

const costoDe = (consumo: Cifra, precio: PorDecidir<number>): Cifra => precio.valor === null
  ? { valor: null, unidad: 'MXN/mes', naturaleza: 'derivada', fuente: `consumo × precio unitario (precio por decidir: ${precio.quienDecide})`, insumos: [consumo.naturaleza, ...(consumo.insumos ?? [])] }
  : { valor: Math.round(consumo.valor! * precio.valor * 100) / 100, unidad: 'MXN/mes', naturaleza: 'derivada', fuente: 'consumo × precio unitario', insumos: [consumo.naturaleza, ...(consumo.insumos ?? [])] }

/**
 * El costo mensual de un N3 de un tamaño: consumo del estimado (volumen por tamaño, supuesto D11) más
 * las horas de consultor (horas por incidencia del CORTE × volumen). Cada costo, «no medido» hasta que
 * haya precio unitario.
 */
export function costoDelTier(insumos: Insumos, tamano: Tamano, horasPorIncidencia: number | null): readonly LineaDeCosto[] {
  const consumo = consumoMensual(insumos, INCIDENCIAS_MES.cliente[tamano])
  const horas: Cifra = horasPorIncidencia === null
    ? { valor: null, unidad: 'h/mes', naturaleza: 'derivada', fuente: 'horas por incidencia (capa semántica) × incidencias al mes (falta un insumo)', insumos: ['medida', 'supuesta'] }
    : { valor: Math.round(horasPorIncidencia * INCIDENCIAS_MES.cliente[tamano] * 100) / 100, unidad: 'h/mes', naturaleza: 'derivada', fuente: 'horas por incidencia (capa semántica, por tamaño) × incidencias al mes (supuesto D11)', insumos: ['medida', 'supuesta'] }
  const lineas = (Object.keys(consumo) as Rubro[]).map((r) => ({ rubro: r, consumo: consumo[r], precioUnitario: PRECIO_UNITARIO[r], costo: costoDe(consumo[r], PRECIO_UNITARIO[r]) }))
  return [...lineas, { rubro: 'horasConsultor', consumo: horas, precioUnitario: PRECIO_UNITARIO.horasConsultor, costo: costoDe(horas, PRECIO_UNITARIO.horasConsultor) }]
}

/** Cómo se cobra: modelos de AMS de referencia (SDD §18). Cuál y a cuánto, por decidir. */
export const MODELOS_DE_COBRO = [
  { modelo: 'por tier mensual', describe: 'una cuota por tier con un volumen incluido' },
  { modelo: 'bolsa de horas', describe: 'horas prepagadas que se consumen por incidencia' },
  { modelo: 'por ticket', describe: 'un precio por incidencia según prioridad' },
] as const

export interface FilaDelModelo {
  readonly tier: Tier
  readonly tamanos: readonly Tamano[]
  readonly precio: PorDecidir<number>
  readonly modeloDeCobro: PorDecidir<(typeof MODELOS_DE_COBRO)[number]['modelo']>
}

/** La tabla del modelo: los tres tiers, su precio y su forma de cobro, todo por decidir. */
export const TABLA_DE_PRECIOS: readonly FilaDelModelo[] = (['esencial', 'profesional', 'critico'] as const).map((tier) => ({
  tier, tamanos: tier === 'esencial' ? ['S'] : tier === 'profesional' ? ['S', 'M', 'L'] : ['M', 'L'],
  precio: { valor: null, quienDecide: 'el laboratorio: plan comercial (ERP-7, D5)' },
  modeloDeCobro: { valor: null, quienDecide: 'el laboratorio: plan comercial (ERP-7, D5)' },
}))

// --- Control de costos: qué hace el triage ante el presupuesto -------------------------------------

/** El veredicto de la guardia de presupuesto (la de la sala: fail-closed, aviso al 80 %). */
export type Veredicto =
  | { readonly permitido: true; readonly restante: number; readonly aviso: boolean }
  | { readonly permitido: false; readonly motivo: 'sin_presupuesto' | 'excedido'; readonly texto: string }

export interface AccionDeTriage {
  readonly accion: 'llama_modelo' | 'a_humano' | 'espera'
  readonly aviso: string | null
}

/**
 * Qué hace el triage con el veredicto del presupuesto. El presupuesto nunca deja sin atención a un
 * P1 o un P2: al tope, sin modelo, pasa a una persona en el momento y se avisa (AISIA §4). P3 y P4
 * esperan, con aviso. Cortar el servicio a un usuario para proteger la factura es una decisión con
 * víctima (C4): aquí no se toma en silencio.
 */
export function accionAnteElPresupuesto(v: Veredicto, prioridad: Prioridad): AccionDeTriage {
  if (v.permitido) return { accion: 'llama_modelo', aviso: v.aviso ? 'presupuesto al 80 %: se avisa a la consultora y al laboratorio' : null }
  if (prioridad === 'P1' || prioridad === 'P2') return { accion: 'a_humano', aviso: `${v.texto}: el triage de ${prioridad} pasa a una persona ahora, sin modelo` }
  return { accion: 'espera', aviso: `${v.texto}: ${prioridad} espera a que se amplíe el presupuesto, con aviso` }
}
