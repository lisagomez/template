import type { Metadata } from 'next'
import { AltaDeLaOrganizacion } from '@/features/agora/components/alta'

export const metadata: Metadata = { title: 'Alta · Ágora', description: 'El alta de la organización, paso por paso: una decisión por paso.' }

export default function PaginaDelAlta() {
  return <AltaDeLaOrganizacion />
}
