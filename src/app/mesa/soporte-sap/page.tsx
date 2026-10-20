import type { Metadata } from 'next'
import { MarcoDeLaMesa } from '@/features/soporte-sap/mesa/components/marco'
import { Mesa } from '@/features/soporte-sap/mesa/components/mesa'
import { identidadDeLaPagina } from '@/features/soporte-sap/mesa/services/pagina'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mesa del experto · Soporte SAP', robots: { index: false, follow: false } }

export default async function PaginaDeLaMesa() {
  const id = await identidadDeLaPagina()
  return <MarcoDeLaMesa identidad={id} activa="mesa"><Mesa /></MarcoDeLaMesa>
}
