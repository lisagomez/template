/**
 * El primer arranque y «cuánto pregunta». Adaptado de Arbrain v0.2.10 (`arbrain/src/features/primer-arranque/
 * lib/pasos.ts`, Apache-2.0) con sus reglas: cada paso nombra UNA decisión, lo seguro es el botón principal, todo
 * se cambia después en Ajustes, y un paso que no cambia nada no se muestra. Los pasos son otros: allá llaves y
 * computer use del Arbrain personal; aquí la marca del producto, lo que sale de la máquina, la voz y cuánto
 * pregunta su asistente.
 */
import type { ProductoResuelto } from './composicion.js'
import type { Intencion } from './enchufe.js'

export const NIVELES_PREGUNTA = ['siempre', 'lo-importante', 'solo-irreversible'] as const
export type NivelPregunta = (typeof NIVELES_PREGUNTA)[number]
export const NIVEL_POR_DEFECTO: NivelPregunta = 'lo-importante'

export const ETIQUETA_NIVEL: Readonly<Record<NivelPregunta, { nombre: string; queHace: string }>> = {
  siempre: { nombre: 'Pregúntame antes de todo', queHace: 'Antes de abrir o cambiar algo, te pregunto.' },
  'lo-importante': { nombre: 'Pregúntame lo importante', queHace: 'Consulto sin preguntar; antes de cambiar algo, te pregunto.' },
  'solo-irreversible': { nombre: 'Solo lo irreversible', queHace: 'Hago lo que me pides; lo que no tiene vuelta atrás sigue pidiendo tu clic.' },
}

export type Antes = 'freno' | 'pregunta' | 'directo'

/** Lo que pasa antes de ejecutar una intención. Lo irreversible va al freno en TODOS los niveles. */
export function antesDe(nivel: NivelPregunta, i: Pick<Intencion, 'efecto' | 'irreversible'>): Antes {
  if (i.irreversible) return 'freno'
  if (nivel === 'siempre') return 'pregunta'
  if (nivel === 'lo-importante' && i.efecto === 'escribe') return 'pregunta'
  return 'directo'
}

export type IdPaso = 'bienvenida' | 'privacidad' | 'voz' | 'pregunta' | 'listo'

export interface PasoPrimerArranque { id: IdPaso; titulo: string; texto: string; principal: string; alternativa?: string }

const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

export function pasosDe(p: ProductoResuelto): PasoPrimerArranque[] {
  const { marca } = p.composicion
  const queHago = [...new Set(p.intenciones.map((i) => i.queHace.replace(/\.$/, '').toLowerCase()))].slice(0, 4)
  const sale = [...p.sale, ...p.voz.sale].map((s) => `${s.que} a ${s.aQuien}`)
  const pasos: PasoPrimerArranque[] = [
    { id: 'bienvenida', titulo: `Hola, soy ${marca.asistente}`, texto: `${marca.saludo}${queHago.length ? ` Puedo ${lista(queHago)}.` : ''} Pídemelo como lo dirías.`, principal: 'Empezar' },
    {
      id: 'privacidad',
      titulo: sale.length ? 'Qué sale de aquí' : 'Lo tuyo se queda aquí',
      texto: sale.length
        ? `Lo que recuerdo es de ${p.composicion.memoria.duena === 'inquilino' ? 'tu cuenta' : 'este producto'}. Al usarme sale: ${sale.join('; ')}.`
        : `Lo que recuerdo es de ${p.composicion.memoria.duena === 'inquilino' ? 'tu cuenta' : 'este producto'} y no sale de aquí.`,
      principal: 'Entendido',
    },
  ]
  if (p.voz.visible) {
    pasos.push({ id: 'voz', titulo: 'También me puedes hablar', texto: `Dicta en el chat, escucha cada respuesta o enciende el Modo conversación. ${p.voz.motivo[0]?.toUpperCase()}${p.voz.motivo.slice(1)}.`, principal: 'Dejar la voz apagada por ahora', alternativa: 'Probar la voz' })
  }
  pasos.push(
    { id: 'pregunta', titulo: '¿Cuánto te pregunto?', texto: `${ETIQUETA_NIVEL[NIVEL_POR_DEFECTO].queHace} Lo que no tiene vuelta atrás siempre pide tu clic.`, principal: ETIQUETA_NIVEL[NIVEL_POR_DEFECTO].nombre },
    { id: 'listo', titulo: 'Listo', texto: 'Todo esto se cambia después en Ajustes.', principal: 'Ir al producto' },
  )
  return pasos
}

export interface EstadoPrimerArranque { version: 1; terminado: boolean; paso: number; nivel: NivelPregunta; voz: boolean }

export const ESTADO_INICIAL: EstadoPrimerArranque = { version: 1, terminado: false, paso: 0, nivel: NIVEL_POR_DEFECTO, voz: false }

/** Lo que se guarda en la memoria del producto (módulo `capa`), validado al leerlo: un estado roto vuelve a empezar. */
export function leeEstado(x: unknown): EstadoPrimerArranque {
  const e = x as Partial<EstadoPrimerArranque> | null
  if (!e || e.version !== 1 || typeof e.terminado !== 'boolean' || !NIVELES_PREGUNTA.includes(e.nivel as NivelPregunta)) return ESTADO_INICIAL
  return { version: 1, terminado: e.terminado, paso: Number.isInteger(e.paso) ? (e.paso as number) : 0, nivel: e.nivel as NivelPregunta, voz: e.voz === true }
}
