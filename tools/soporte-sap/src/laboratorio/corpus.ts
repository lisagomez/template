/**
 * El corpus SINTÉTICO del laboratorio: dos consultoras, cinco clientes de tamaños S, M y L, y seis
 * meses de incidencias (abril–septiembre de 2026) con su ciclo de vida. Determinista: misma semilla,
 * mismo corpus. Las incidencias de nómina llevan datos personales sintéticos sembrados para medir el
 * anonimizador. Nada de esto describe empresas ni personas reales.
 */
import { azar, type Azar } from './aleatorio.js'
import { personaSintetica, ticketDeNomina, valoresSensibles, type DigitosMx } from './pii.js'
import { CALENDARIO_CDMX, sumaMinutosHabiles } from '../calendario.js'
import { categoriza, type Prioridad } from '../categoriza.js'
import type { Sistema } from '../simulador.js'

export type Tamano = 'S' | 'M' | 'L'

export interface ConsultoraLab { readonly id: string; readonly nombre: string; readonly alta: string }
export interface ClienteLab {
  readonly id: string; readonly nombre: string; readonly consultora: string; readonly tamano: Tamano
  readonly sector: string; readonly sistema: Sistema; readonly usuarios: number; readonly alta: string
}

export interface EventoLab { readonly tipo: 'RECIBIDA' | 'PRIMERA_RESPUESTA' | 'ESPERA_CLIENTE' | 'RESPUESTA_CLIENTE' | 'RESUELTA' | 'REABIERTA' | 'CERRADA'; readonly fecha: string }

export interface IncidenciaLab {
  readonly id: string
  readonly consultora: string
  readonly cliente: string
  readonly titulo: string
  readonly descripcion: string
  readonly sistema: Sistema
  readonly creada: string
  /** La regla de la matriz de la que nació el texto, o null si es un caso sin regla. */
  readonly reglaDeOrigen: string | null
  readonly prioridad: Prioridad
  readonly modulo: string | null
  readonly conDatosPersonales: boolean
  /** Lo que NO puede salir del anonimizador (vacío si no hay datos personales). */
  readonly sensibles: readonly string[]
  readonly eventos: readonly EventoLab[]
  readonly minutosConsultor: number
}

export interface CorpusLab {
  readonly consultoras: readonly ConsultoraLab[]
  readonly clientes: readonly ClienteLab[]
  readonly incidencias: readonly IncidenciaLab[]
  readonly corte: string
}

export const CONSULTORAS: readonly ConsultoraLab[] = [
  { id: 'andina', nombre: 'Consultora Andina', alta: '2026-04-01' },
  { id: 'boreal', nombre: 'Consultora Boreal', alta: '2026-06-01' },
]

export const CLIENTES: readonly ClienteLab[] = [
  { id: 'alimentos-del-bajio', nombre: 'Alimentos del Bajío', consultora: 'andina', tamano: 'L', sector: 'alimentos', sistema: 'S4HANA', usuarios: 420, alta: '2026-04-01' },
  { id: 'aceros-del-norte', nombre: 'Aceros del Norte', consultora: 'andina', tamano: 'M', sector: 'manufactura', sistema: 'ECC', usuarios: 150, alta: '2026-04-01' },
  { id: 'farmacias-del-centro', nombre: 'Farmacias del Centro', consultora: 'andina', tamano: 'S', sector: 'retail', sistema: 'S4HANA', usuarios: 45, alta: '2026-05-01' },
  { id: 'bebidas-del-sur', nombre: 'Bebidas del Sur', consultora: 'boreal', tamano: 'M', sector: 'bebidas', sistema: 'S4HANA', usuarios: 180, alta: '2026-06-01' },
  { id: 'textiles-del-golfo', nombre: 'Textiles del Golfo', consultora: 'boreal', tamano: 'S', sector: 'textil', sistema: 'ECC', usuarios: 60, alta: '2026-06-01' },
]

/** Incidencias por mes según el tamaño del cliente (SUPUESTO del laboratorio, D11). */
export const VOLUMEN_MENSUAL: Readonly<Record<Tamano, number>> = { S: 8, M: 20, L: 45 }

type Plantilla = { regla: string | null; texto: (a: Azar) => string }

const PLANTILLAS: readonly Plantilla[] = [
  { regla: 'SS-MM-PERIODO', texto: (a) => `MIGO no deja contabilizar la entrada: mensaje M7 053, solo se puede en periodos 2026/08 y 2026/09 en sociedad 1000; necesitamos el periodo 2026/10${a.prob(0.3) ? ' y toda la planta está detenida hoy' : ''}` },
  { regla: 'SS-FI-PERIODO', texto: (a) => `FB01 marca F5 201: el periodo contable no está abierto en sociedad 1000 para el periodo 2026/10${a.prob(0.4) ? ', es cierre de mes' : ''}` },
  { regla: 'SS-BC-USUARIO', texto: (a) => `El usuario ALMACEN01 está bloqueado (usuario bloqueado por intentos fallidos) y ${a.prob(0.5) ? 'varios usuarios del almacén no pueden entrar' : 'no puede entrar'}` },
  { regla: 'SS-IDOC-51', texto: () => 'El IDoc 0000000000123456 quedó en estado 51 después de corregir el maestro del material' },
  { regla: 'SS-CFDI-LCO', texto: (a) => `El PAC rechazó la factura con CFDI40102: el RFC del receptor no se encuentra en la LCO. BP 1000452, RFC correcto: EKU9003173C9, UUID: 6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7${a.prob(0.5) ? '. No podemos facturar' : ''}` },
  { regla: 'SS-SD-RANGO', texto: () => 'VA01 se cae con un dump DBSQL_DUPLICATE_KEY_ERROR; parece el rango RV_BELEG/01 desfasado' },
  { regla: 'SS-BC-JOB', texto: () => 'El job ZCIERRE_DIARIO aparece como job cancelado en SM37 desde anoche' },
  { regla: 'SS-SD-CUENTAS', texto: () => 'VF02 no pasa la factura a contabilidad: error en la determinacion de cuentas (VKOA)' },
  { regla: null, texto: () => 'La app Fiori F0842 se queda en blanco al abrirla desde el launchpad' },
  { regla: null, texto: (a) => `Falta autorización al crear el pedido en ME21N; SU53 muestra el objeto M_BEST_BSA${a.prob(0.3) ? ', es urgente' : ''}` },
  { regla: null, texto: () => 'El reporte ZVENTAS_MES tarda más de veinte minutos desde la semana pasada' },
]

const PESOS_PRIORIDAD: Readonly<Record<Prioridad, readonly [number, number, number, number]>> = {
  // [respuesta min, respuesta max, resolución min, resolución max] en minutos hábiles
  P1: [15, 60, 120, 480], P2: [30, 180, 240, 1440], P3: [60, 600, 480, 2880], P4: [120, 1440, 960, 4800],
}

const iso = (t: number): string => new Date(t).toISOString()

function cicloDeVida(a: Azar, creada: number, p: Prioridad, conocida: boolean, corte: number): { eventos: EventoLab[]; minutos: number } {
  const [r0, r1, s0, s1] = PESOS_PRIORIDAD[p]
  const factor = conocida ? 0.55 : 1.3
  const c = CALENDARIO_CDMX
  const eventos: EventoLab[] = [{ tipo: 'RECIBIDA', fecha: iso(creada) }]
  const resp = sumaMinutosHabiles(c, creada, Math.round(a.entero(r0, r1) * (conocida ? 0.6 : 1)))
  const resolucionMin = Math.round(a.entero(s0, s1) * factor)
  if (resp > corte) return { eventos, minutos: 0 }
  eventos.push({ tipo: 'PRIMERA_RESPUESTA', fecha: iso(resp) })
  let t = resp
  if (a.prob(0.25)) {
    const pausa = sumaMinutosHabiles(c, t, Math.round(resolucionMin * 0.3))
    const vuelve = sumaMinutosHabiles(c, pausa, a.entero(60, 600))
    if (vuelve > corte) return { eventos: [...eventos, { tipo: 'ESPERA_CLIENTE', fecha: iso(pausa) }], minutos: Math.round(resolucionMin * 0.3) }
    eventos.push({ tipo: 'ESPERA_CLIENTE', fecha: iso(pausa) }, { tipo: 'RESPUESTA_CLIENTE', fecha: iso(vuelve) })
    t = vuelve
  }
  const resuelta = sumaMinutosHabiles(c, t, Math.round(resolucionMin * 0.7))
  if (resuelta > corte) return { eventos, minutos: Math.round(resolucionMin * 0.5) }
  eventos.push({ tipo: 'RESUELTA', fecha: iso(resuelta) })
  let fin = resuelta
  if (a.prob(0.05)) {
    const reabre = sumaMinutosHabiles(c, resuelta, a.entero(60, 480))
    const otra = sumaMinutosHabiles(c, reabre, Math.round(resolucionMin * 0.3))
    if (otra <= corte) { eventos.push({ tipo: 'REABIERTA', fecha: iso(reabre) }, { tipo: 'RESUELTA', fecha: iso(otra) }); fin = otra }
  }
  const cierra = sumaMinutosHabiles(c, fin, 540)
  if (cierra <= corte) eventos.push({ tipo: 'CERRADA', fecha: iso(cierra) })
  return { eventos, minutos: Math.round(resolucionMin * (0.3 + a.siguiente() * 0.5)) }
}

function incidencia(a: Azar, digitos: DigitosMx, cl: ClienteLab, n: number, creada: number, corte: number): IncidenciaLab {
  const nomina = a.prob(0.08)
  const plantilla = nomina ? null : a.prob(0.72) ? a.elige(PLANTILLAS.filter((x) => x.regla)) : a.elige(PLANTILLAS.filter((x) => !x.regla))
  const persona = nomina ? personaSintetica(a, digitos, cl.id) : null
  const descripcion = persona ? ticketDeNomina(persona, cl.nombre) : plantilla!.texto(a)
  const c = categoriza(descripcion)
  const conocida = Boolean(plantilla?.regla && plantilla.regla !== 'SS-SD-CUENTAS')
  const { eventos, minutos } = cicloDeVida(a, creada, c.prioridad, conocida, corte)
  return {
    id: `${cl.id}-${String(n).padStart(4, '0')}`, consultora: cl.consultora, cliente: cl.id,
    titulo: descripcion.split(/[:.;]/)[0]!.slice(0, 80), descripcion, sistema: cl.sistema, creada: iso(creada),
    reglaDeOrigen: plantilla?.regla ?? null, prioridad: c.prioridad, modulo: c.modulo,
    conDatosPersonales: Boolean(persona), sensibles: persona ? valoresSensibles(persona) : [], eventos, minutosConsultor: minutos,
  }
}

/** Genera el corpus completo. `digitos` son los del extractor documental (RFC y CURP válidos). */
export function generaCorpus(digitos: DigitosMx, semilla = 20261004): CorpusLab {
  const a = azar(semilla)
  const corte = Date.parse('2026-09-30T23:59:00Z')
  const incidencias: IncidenciaLab[] = []
  for (const cl of CLIENTES) {
    let n = 0
    for (let mes = 4; mes <= 9; mes++) {
      const inicioMes = Date.parse(`2026-${String(mes).padStart(2, '0')}-01T15:00:00Z`)
      if (inicioMes < Date.parse(`${cl.alta}T00:00:00Z`)) continue
      for (let k = 0; k < VOLUMEN_MENSUAL[cl.tamano]; k++) {
        const creada = sumaMinutosHabiles(CALENDARIO_CDMX, inicioMes, a.entero(0, 20 * 9 * 60))
        if (creada > corte) continue
        incidencias.push(incidencia(a, digitos, cl, ++n, creada, corte))
      }
    }
  }
  return { consultoras: CONSULTORAS, clientes: CLIENTES, incidencias, corte: iso(corte) }
}
