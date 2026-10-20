import type { Metadata } from 'next'
import { MarcoDeLaMesa } from '@/features/soporte-sap/mesa/components/marco'
import { Kit } from '@/features/soporte-sap/mesa/components/kit'
import { identidadDeLaPagina } from '@/features/soporte-sap/mesa/services/pagina'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Cómo se usa · mesa del experto', robots: { index: false, follow: false } }

export default async function PaginaDelKit() {
  const id = await identidadDeLaPagina()
  return <MarcoDeLaMesa identidad={id} activa="kit"><Kit /></MarcoDeLaMesa>
}
