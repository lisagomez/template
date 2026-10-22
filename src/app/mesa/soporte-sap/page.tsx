import type { Metadata } from 'next'
import { Candidatos } from '@/features/soporte-sap/mesa/components/candidatos'
import { MarcoDeLaMesa } from '@/features/soporte-sap/mesa/components/marco'
import { Mesa } from '@/features/soporte-sap/mesa/components/mesa'
import { identidadDeLaPagina } from '@/features/soporte-sap/mesa/services/pagina'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mesa del experto · Soporte SAP', robots: { index: false, follow: false } }

/** La mesa y, con `?pestana=candidatos`, la validación de conocimiento: las dos para cualquier identidad de la mesa. */
export default async function PaginaDeLaMesa({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const id = await identidadDeLaPagina()
  const candidatos = (await searchParams).pestana === 'candidatos'
  return <MarcoDeLaMesa identidad={id} activa={candidatos ? 'candidatos' : 'mesa'}>{candidatos ? <Candidatos /> : <Mesa />}</MarcoDeLaMesa>
}
