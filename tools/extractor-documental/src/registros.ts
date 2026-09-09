/**
 * El lote de trabajo: lo que lleva titulo y lo que se recupera despues.
 *
 * Se titula la SESION, no el escaneo suelto — nadie pone titulo a una etiqueta. "Conteo almacen
 * norte 07/09" es lo que una persona busca tres meses despues.
 *
 * Y el titulo es obligatorio pero NO unico a proposito: forzar unicidad hace que el segundo dia
 * alguien escriba "Conteo almacen 2", que es peor que dos lotes homonimos distinguibles por fecha.
 */
import type { Rol } from './roles.js'
import { exige } from './roles.js'

export type EstadoLote = 'abierto' | 'en_revision' | 'cerrado'

export type TipoDeTrabajo = 'facturas' | 'inventario' | 'trazabilidad' | 'mixto'

export interface Lote {
  id: string
  organizacionId: string
  titulo: string
  tipoTrabajo: TipoDeTrabajo
  estado: EstadoLote
  creadoPor: string
  creadoEn: string
  cerradoEn: string | null
}

const TRANSICIONES: Readonly<Record<EstadoLote, readonly EstadoLote[]>> = {
  abierto: ['en_revision', 'cerrado'],
  en_revision: ['abierto', 'cerrado'],
  // Un lote cerrado no vuelve. Es lo que hace que "recuperarlo" signifique algo estable y no una
  // foto de algo que sigue moviendose.
  cerrado: [],
}

export interface DatosDeLote {
  id: string
  organizacionId: string
  titulo: string
  tipoTrabajo: TipoDeTrabajo
  creadoPor: string
  rol: Rol
}

export function abreLote(datos: DatosDeLote, ahora: Date = new Date()): Lote {
  exige(datos.rol, 'crear_lote')
  const titulo = datos.titulo.trim()
  if (titulo.length === 0) {
    throw new Error('Un lote sin titulo no se puede recuperar despues: el titulo es obligatorio')
  }
  return {
    id: datos.id,
    organizacionId: datos.organizacionId,
    titulo,
    tipoTrabajo: datos.tipoTrabajo,
    estado: 'abierto',
    creadoPor: datos.creadoPor,
    creadoEn: ahora.toISOString(),
    cerradoEn: null,
  }
}

export function cierraLote(lote: Lote, rol: Rol, ahora: Date = new Date()): Lote {
  exige(rol, 'cerrar_lote')
  if (!TRANSICIONES[lote.estado].includes('cerrado')) {
    throw new Error(`El lote ya esta ${lote.estado}: no se puede cerrar dos veces`)
  }
  return { ...lote, estado: 'cerrado', cerradoEn: ahora.toISOString() }
}

/** Un lote cerrado no admite altas. Lo comprueba quien va a anadir, antes de anadir. */
export function admiteAltas(lote: Lote): boolean {
  return lote.estado !== 'cerrado'
}

export function exigeAbierto(lote: Lote): void {
  if (!admiteAltas(lote)) {
    throw new Error(`El lote "${lote.titulo}" esta cerrado y no admite documentos nuevos`)
  }
}

export interface ResumenParaTitulo {
  tipoTrabajo: TipoDeTrabajo
  documentos: number
  /** Emisor, proveedor o contraparte dominante, si se reconocio alguno. */
  contraparte?: string
  fecha: Date
}

const NOMBRE_TIPO: Readonly<Record<TipoDeTrabajo, string>> = {
  facturas: 'Facturas',
  inventario: 'Inventario',
  trazabilidad: 'Trazabilidad',
  mixto: 'Documentos',
}

/**
 * Titulo por defecto derivado del contenido: "Facturas · ACME · 12 documentos · 07/09".
 *
 * Contra el "prueba 2" no sirve validar —bloquear titulos malos es paternalismo que la gente
 * esquiva— sino ofrecer un buen defecto que el humano acepta o cambia.
 */
export function tituloSugerido(resumen: ResumenParaTitulo): string {
  const dia = String(resumen.fecha.getUTCDate()).padStart(2, '0')
  const mes = String(resumen.fecha.getUTCMonth() + 1).padStart(2, '0')
  const partes = [NOMBRE_TIPO[resumen.tipoTrabajo]]
  if (resumen.contraparte) partes.push(resumen.contraparte)
  partes.push(`${resumen.documentos} documento${resumen.documentos === 1 ? '' : 's'}`)
  partes.push(`${dia}/${mes}`)
  return partes.join(' · ')
}
