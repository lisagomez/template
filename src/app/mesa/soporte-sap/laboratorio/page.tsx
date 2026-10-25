import type { Metadata } from 'next'
import { MarcoDeLaMesa } from '@/features/soporte-sap/mesa/components/marco'
import { Laboratorio } from '@/features/soporte-sap/mesa/components/laboratorio'
import { Mapa } from '@/features/soporte-sap/mesa/components/mapa'
import { identidadDeLaPagina } from '@/features/soporte-sap/mesa/services/pagina'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Laboratorio · mesa del experto', robots: { index: false, follow: false } }

/** Solo la identidad del laboratorio: para el experto, esta página no existe. Abre en el mapa; `?pestana=casos`, lo que dijo el experto. */
export default async function PaginaDelLaboratorio({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const id = await identidadDeLaPagina('laboratorio')
  const casos = (await searchParams).pestana === 'casos'
  return <MarcoDeLaMesa identidad={id} activa={casos ? 'laboratorio' : 'mapa'}>{casos ? <Laboratorio /> : <Mapa />}</MarcoDeLaMesa>
}
