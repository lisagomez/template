/**
 * D8 (PRP-012) en el laboratorio: la salida de un cliente y cuándo vence lo que se guarda.
 *
 * La salida la registra una persona del cliente o de su consultora (DP-2), con la fecha que pone el laboratorio. Desde
 * ese momento el cliente queda CONGELADO: nada suyo se escribe ni cambia, su reloj se detiene y su export es el último.
 * El export lo descargan él y su consultora, nadie más. La gracia sale de su contrato y, sin ella, no se borra nada
 * (DP-4). En la base hacen lo mismo `ss_baja`, `ss_priv.congelado_por_baja` y el job de retención (`src/retencion.ts`).
 * Las reglas de los plazos son las de `vencimiento.ts`, las mismas que usa el job.
 */
import { createHash } from 'node:crypto'
import { contratoDeLaboratorio, estadoDeBaja, masDias, vencimientoDeOriginal, CLIENTES, type EstadoBaja } from '../../../../tools/soporte-sap/dist/index.js'
import { Rechazo } from './rechazo'
import type { IncidenciaLab } from './runtime'
import type { Accion, Sesion, SalidaVista } from './tipos'

/** Una baja del laboratorio, como una fila de `ss_baja` con su export ya generado. */
export interface BajaLab {
  readonly cliente: string; readonly consultora: string; readonly registradaPor: string; readonly registradaEn: string
  readonly borrarDesde: string | null; readonly export: { readonly sha256: string; readonly incidencias: number; readonly contenido: string }
}
interface ConBajas { readonly bajas: Record<string, BajaLab>; readonly incidencias: readonly IncidenciaLab[] }

export const CONGELADO = 'la salida de este cliente está registrada (D8): no cambia nada, y su export es el último'
const contrato = (consultora: string, cliente: string) => contratoDeLaboratorio(consultora, cliente, '2026-04-01')

/** Lo que es del cliente y viaja en su export. El sandbox anonimizado no: se queda (DP-1 del PRP-011). */
const paraExport = (i: IncidenciaLab) => ({
  id: i.id, titulo: i.titulo, texto: i.texto, estado: i.estado, prioridad: i.clasificacion.prioridad, adjuntos: i.adjuntos,
  cadena: i.cadena, sla: i.sla, impugnaciones: i.impugnaciones, respuestas: i.respuestas, escalada: i.escalada,
})

/** Registra la salida de un cliente y genera su export, que es el último: desde aquí nada suyo cambia. */
export function registraSalida(e: ConBajas, s: Sesion, cliente: string, ahora: string): void {
  const cl = CLIENTES.find((c) => c.id === cliente)
  const puede = cl !== undefined && ((s.rol === 'cliente' && s.organizacion === cliente) || (s.rol === 'consultor' && s.organizacion === cl.consultora))
  if (!puede) throw new Rechazo('la salida de un cliente la registra una persona del cliente o de su consultora (D8, DP-2)')
  if (e.bajas[cliente]) throw new Rechazo('la salida de ese cliente ya está registrada: no se cambia ni se registra dos veces')
  const suyas = e.incidencias.filter((i) => i.cliente === cliente)
  const contenido = JSON.stringify({ version: 1, cliente, consultora: cl.consultora, generado: ahora, incidencias: suyas.map(paraExport) })
  e.bajas[cliente] = {
    cliente, consultora: cl.consultora, registradaPor: s.usuario, registradaEn: ahora,
    borrarDesde: masDias(ahora, contrato(cl.consultora, cliente).graciaSalidaDias.valor),
    export: { sha256: createHash('sha256').update(contenido).digest('hex'), incidencias: suyas.length, contenido },
  }
}

/** Si la acción toca a un cliente congelado, el motivo para rechazarla; si no, null. */
export function congelamiento(e: ConBajas, s: Sesion, a: Accion): string | null {
  const id = 'incidencia' in a ? a.incidencia : a.tipo === 'decide' ? e.incidencias.find((i) => i.planes.some((p) => p.mensaje === a.mensaje))?.id : undefined
  const cliente = id !== undefined ? e.incidencias.find((i) => i.id === id)?.cliente
    : (a.tipo === 'consiente_nucleo' || a.tipo === 'revoca_nucleo') && s.rol === 'cliente' ? s.organizacion : undefined
  return cliente !== undefined && e.bajas[cliente] ? CONGELADO : null
}

/** El export de un cliente: lo descargan él y su consultora, nadie más (como `ss_exportes_cliente_lee` y `ss_exportes_lee`). */
export function exportDe(e: ConBajas, s: Sesion, cliente: string): string | null {
  const b = e.bajas[cliente]
  const suyo = b !== undefined && ((s.rol === 'cliente' && s.organizacion === cliente) || (s.rol === 'consultor' && s.organizacion === b.consultora))
  return suyo ? b.export.contenido : null
}

/** Cuándo vence el original de los adjuntos de una incidencia: la regla de la base, o se va con la salida del cliente. */
export function venceDe(e: ConBajas, i: IncidenciaLab, ahora: string): string {
  if (e.bajas[i.cliente]) return 'se va con la salida del cliente, cuando termine su gracia'
  const resuelta = i.estado === 'resuelta' ? ([...i.sla].reverse().find((x) => x.tipo === 'RESUELTA')?.fecha ?? null) : null
  return vencimientoDeOriginal({ resueltaEn: resuelta, impugnaciones: i.impugnaciones, dias: contrato(i.consultora, i.cliente).retencionOriginalesDias.valor }, ahora).texto
}

const ESTADOS: Readonly<Record<EstadoBaja, (desde: string | null) => string>> = {
  sin_plazo: () => 'sin gracia en el contrato: no se borra nada hasta que la diga (D8, DP-4)',
  sin_export: () => 'sin export todavía: no se borra nada antes de tenerlo',
  en_gracia: (desde) => `en su gracia: se borra desde el ${desde?.slice(0, 10)}`,
  lista: () => 'la gracia terminó: el job de retención la borra',
  cumplida: () => 'cumplida: del cliente no queda nada',
}

/** Las salidas que ve cada quien: el cliente la suya; la consultora, la de sus clientes; el laboratorio, las registradas y sin el export. */
export function salidasQueVe(e: ConBajas, s: Sesion, ahora: string): SalidaVista[] {
  const clientes = CLIENTES.filter((c) => (s.rol === 'cliente' ? c.id === s.organizacion : s.rol === 'consultor' ? c.consultora === s.organizacion : s.rol === 'superadmin' && e.bajas[c.id] !== undefined))
  return clientes.map((c) => {
    const b = e.bajas[c.id]
    const gracia = contrato(c.consultora, c.id).graciaSalidaDias.valor
    const estado = b ? estadoDeBaja({ exportSha256: b.export.sha256, borrarDesde: b.borrarDesde, borradaEn: null, vencio: b.borrarDesde !== null && b.borrarDesde <= ahora }) : null
    return {
      cliente: c.id, nombre: c.nombre, gracia: gracia === null ? 'por decidir: el contrato todavía no la dice (D8, DP-4)' : `${gracia} días`,
      puedeRegistrar: !b && (s.rol === 'cliente' || s.rol === 'consultor'),
      registrada: b && estado ? {
        por: b.registradaPor, fecha: b.registradaEn, borrarDesde: b.borrarDesde, estado: ESTADOS[estado](b.borrarDesde),
        export: s.nivel === 'N1' ? null : { sha256: b.export.sha256, incidencias: b.export.incidencias, bytes: b.export.contenido.length },
      } : null,
    }
  })
}
