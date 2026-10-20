import type { Metadata } from 'next'
import { MarcoDeLaMesa } from '@/features/soporte-sap/mesa/components/marco'
import { Laboratorio } from '@/features/soporte-sap/mesa/components/laboratorio'
import { identidadDeLaPagina } from '@/features/soporte-sap/mesa/services/pagina'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Lo que dijo el experto · mesa del experto', robots: { index: false, follow: false } }

/** Solo la identidad del laboratorio: para el experto, esta página no existe. */
export default async function PaginaDelLaboratorio() {
  const id = await identidadDeLaPagina('laboratorio')
  return <MarcoDeLaMesa identidad={id} activa="laboratorio"><Laboratorio /></MarcoDeLaMesa>
}
