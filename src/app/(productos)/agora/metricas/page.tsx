import type { Metadata } from 'next'
import { PantallaMetricas } from '@/features/agora-metricas/components/pantalla'

export const metadata: Metadata = { title: 'Métricas · Ágora', description: 'Capa semántica y tablero regenerable.' }

export default function PaginaMetricas() {
  return <PantallaMetricas />
}
