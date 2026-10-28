import type { Metadata } from 'next'
import { PantallaCostos } from '@/features/agora-costos/components/pantalla'

export const metadata: Metadata = { title: 'Costos · Ágora', description: 'Presupuesto, comprometido, ejercido y disponible por centro de costo.' }

export default function PaginaCostos() {
  return <PantallaCostos />
}
