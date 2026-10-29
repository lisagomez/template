import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Metricas } from '@/features/agora-metricas/components/metricas'
import { leeMetricas } from '@/features/agora-metricas/services/lecturas'

export const metadata: Metadata = { title: 'Métricas · Ágora', description: 'Capa semántica y tablero regenerable: cada cifra sale de una métrica del catálogo y cuadra con el libro.' }

export default async function PaginaMetricas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeMetricas(q.periodo ?? null)
  return r.ok ? <Metricas d={r.valor} /> : <AgoraApagada motivo={r.motivo} />
}
