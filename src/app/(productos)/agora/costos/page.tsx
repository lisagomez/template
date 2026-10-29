import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Costos } from '@/features/agora-costos/components/costos'
import { leeCostos } from '@/features/agora-costos/services/lecturas'

export const metadata: Metadata = { title: 'Costos · Ágora', description: 'Presupuesto, comprometido, ejercido y disponible por centro de costo; el gasto de los agentes en MXN con su tipo de cambio.' }

export default async function PaginaDeCostos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeCostos(q.periodo ?? null)
  return r.ok ? <Costos d={r.valor} /> : <AgoraApagada motivo={r.motivo} />
}
