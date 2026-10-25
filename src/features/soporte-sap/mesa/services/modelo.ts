/**
 * El contrato de la mesa del experto entre el servidor y la pantalla, y lo que se guarda en el almacén. La pantalla solo
 * PINTA esto: los pasos salen de la cadena de eventos del runtime, y los números del laboratorio, de lo guardado.
 */
import { z } from 'zod'
import { ACCION_VALIDA } from './modelo-candidatos'

export const SISTEMAS = ['ECC', 'S4HANA'] as const
export const MODULOS = ['MM', 'SD', 'FI', 'CO', 'PP', 'PM', 'QM', 'WM/EWM', 'HCM', 'BC/Basis', 'Fiori', 'Integración (IDoc/PI)', 'Otro'] as const
export const VEREDICTOS = ['resuelto', 'parcial', 'incorrecto', 'debio_no_lo_se'] as const
export type Veredicto = (typeof VEREDICTOS)[number]

/** Lo que el experto escribe de su caso. Lo valida el servidor (Zod) y pasa por el filtro antes de entrar. */
export const ENTRADA = z.object({
  sistema: z.enum(SISTEMAS),
  modulo: z.enum(MODULOS),
  transaccion: z.string().trim().max(30).regex(/^[A-Za-z0-9_/ -]*$/, 'una transacción son letras, cifras, «_» o «/»'),
  mensaje: z.string().trim().max(200),
  sociedad: z.string().trim().max(10).regex(/^[A-Za-z0-9]*$/, 'una sociedad son letras o cifras'),
  periodo: z.string().trim().max(10).regex(/^(\d{4}[/-]\d{2})?$/, 'el periodo va como 2026/10'),
  sintoma: z.string().trim().min(10, 'cuéntale al agente qué pasa, en una o dos frases').max(2000),
  intento: z.string().trim().max(1500),
  muestras: z.array(z.string().max(60)).max(3),
})
export type EntradaCaso = z.infer<typeof ENTRADA>

export type Quien = 'agente' | 'supervisor' | 'tu' | 'n3' | 'n2' | 'sistema'
/** Un paso de la línea de tiempo: un evento de la cadena, dicho para un experto SAP. */
export interface PasoMesa {
  /** `seq:tipo` del evento: la retro de un paso se ata a esta clave. */
  readonly clave: string
  readonly etapa: 'recibe' | 'evidencia' | 'entiende' | 'busca' | 'plan' | 'sala' | 'decide' | 'aplica' | 'protege' | 'aprende' | 'atiende' | 'presupuesto'
  readonly titulo: string
  readonly quien: Quien
  readonly quienDice: string
  readonly entra: string | null
  readonly sale: string
  readonly porque: string | null
  readonly detalle: readonly string[]
  readonly fecha: string
  /** Desde el paso anterior, en milisegundos medidos con las fechas de la cadena. */
  readonly ms: number
  readonly tono: 'bien' | 'aviso' | 'mal' | 'neutro'
}

export interface ResultadoMesa {
  readonly tipo: 'solucion' | 'grado_insuficiente' | 'sin_solucion'
  readonly regla: string | null
  readonly titulo: string | null
  readonly resumen: string | null
  readonly cita: string | null
  readonly url: string | null
  readonly grado: string | null
  readonly razon: string
}
export interface PlanMesa {
  readonly version: number
  readonly pasos: readonly string[]
  readonly supervisor: { readonly resultado: string; readonly verdes: number; readonly total: number; readonly fallan: readonly string[] }
  readonly mensaje: string | null
  readonly decision: { readonly accion: string; readonly motivo: string | null } | null
  readonly aplicado: { readonly antes: string; readonly despues: string; readonly errorAntes: boolean; readonly errorDespues: boolean } | null
}
export interface TurnoMesa { readonly autor: 'tu' | 'agente'; readonly texto: string; readonly tipo: string | null; readonly fecha: string }
export interface PropuestaMesa { readonly tipo: 'regla' | 'cli'; readonly titulo: string; readonly detalle: string; readonly estado: string }
export interface RetroPaso { readonly gesto: 'bien' | 'mal'; readonly esperaba: string | null; readonly fecha: string }
export interface VeredictoCaso { readonly valor: Veredicto; readonly solucion: string | null; readonly nota: string | null; readonly fecha: string }

/** Lo que se guarda de un caso: lo que el experto escribió, lo que el agente hizo y lo que el experto dijo de ello. */
export interface CasoMesa {
  readonly version: 1
  readonly id: string
  readonly creado: string
  actualizado: string
  readonly por: { readonly usuario: string; readonly correo: string; readonly prueba: boolean }
  readonly entrada: EntradaCaso
  /** La incidencia en el runtime y el arranque en que vive: tras dormirse el contenedor, ya no está. */
  readonly incidencia: string
  readonly arranque: string
  readonly laboratorio: string
  cliente: string
  pasos: PasoMesa[]
  resultado: ResultadoMesa
  prioridad: string
  planes: PlanMesa[]
  sandbox: { readonly veredicto: string; readonly senales: readonly string[]; readonly texto: string | null } | null
  ensenanza: TurnoMesa[]
  propuestas: PropuestaMesa[]
  reloj: { readonly estado: string; readonly respuestaMin: number | null; readonly metaRespuestaMin: number | null; readonly cumpleRespuesta: boolean | null; readonly pausadoMin: number } | null
  retro: { pasos: Record<string, RetroPaso>; veredicto: VeredictoCaso | null }
}

/** Un caso como lo ve la pantalla: lo guardado y si todavía vive en el laboratorio (para decidir o enseñar). */
export interface CasoVista extends CasoMesa { readonly vivo: boolean }
export interface MesaVista {
  readonly identidad: { readonly correo: string; readonly rol: 'experto' | 'laboratorio'; readonly prueba: boolean }
  readonly casos: readonly CasoVista[]
  readonly muestras: ReadonlyArray<{ readonly archivo: string; readonly que: string }>
  readonly almacen: string
  readonly arranque: string
}

export interface AgregadoLaboratorio {
  readonly casos: number
  readonly deExpertos: number
  readonly dePrueba: number
  readonly porVeredicto: Readonly<Record<Veredicto | 'sin_veredicto', number>>
  readonly porResultado: Readonly<Record<ResultadoMesa['tipo'], number>>
  /** En qué paso dijo «mal» el experto, de más a menos: la etapa y cuántas veces. */
  readonly pasosMal: ReadonlyArray<{ readonly etapa: string; readonly titulo: string; readonly mal: number; readonly bien: number }>
  readonly ensenanzasPorFirmar: number
  readonly cuarentenas: number
}
export interface LaboratorioVista { readonly agregado: AgregadoLaboratorio; readonly casos: readonly CasoMesa[]; readonly almacen: string }

const TEXTO_CORTO = z.string().trim().max(1500)
export const ACCION_MESA = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('revisa'), campos: z.record(z.string().max(30), z.string().max(2000)) }),
  z.object({ tipo: z.literal('ingresa'), entrada: ENTRADA }),
  z.object({ tipo: z.literal('decide'), caso: z.string().max(60), accion: z.enum(['aprobar', 'rechazar', 'a_revision']), motivo: TEXTO_CORTO.optional() }),
  z.object({ tipo: z.literal('ensena'), caso: z.string().max(60), texto: z.string().trim().min(10, 'cuéntale al agente cómo se resuelve, en una o dos frases').max(2000) }),
  z.object({ tipo: z.literal('retro_paso'), caso: z.string().max(60), clave: z.string().max(60), gesto: z.enum(['bien', 'mal']), esperaba: TEXTO_CORTO.optional() }),
  z.object({ tipo: z.literal('veredicto'), caso: z.string().max(60), valor: z.enum(VEREDICTOS), solucion: TEXTO_CORTO.optional(), nota: TEXTO_CORTO.optional() }),
  ACCION_VALIDA,
])
export type AccionMesa = z.infer<typeof ACCION_MESA>
export const ACCION_LABORATORIO = z.object({ tipo: z.literal('borra'), caso: z.string().max(60) })
