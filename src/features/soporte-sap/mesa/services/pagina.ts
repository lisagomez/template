/**
 * La identidad de una página de la mesa, del lado del servidor: el mismo JWT de Access que verifica la ruta. Sin él, la
 * página no existe (404): la mesa no se deja ver, ni vacía, a quien no entró por la puerta.
 */
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { CABECERA_ACCESO, type IdentidadMesa } from './acceso'
import { identidadDe } from './contexto'

export async function identidadDeLaPagina(rol?: 'laboratorio'): Promise<IdentidadMesa> {
  const h = await headers()
  const id = await identidadDe(new Request('http://mesa/', { headers: { [CABECERA_ACCESO]: h.get(CABECERA_ACCESO) ?? '' } }))
  if (!id || (rol && id.rol !== rol)) notFound()
  return id
}
