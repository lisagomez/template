import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Buzon } from '@/features/agora-buzon/components/buzon'
import { leeBuzon } from '@/features/agora-buzon/services/lecturas'

export const metadata: Metadata = { title: 'Buzón · Ágora', description: 'El canal interno único de cada categoría: hilos, propuestas con su huella y aprobación por rol.' }

export default async function PaginaDelBuzon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeBuzon(q.cat ?? null)
  return r.ok ? <Buzon d={r.valor} abierta={q.propuesta ?? null} /> : <AgoraApagada motivo={r.motivo} />
}
