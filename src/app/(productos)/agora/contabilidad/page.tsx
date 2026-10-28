import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Contabilidad } from '@/features/agora-contabilidad/components/contabilidad'
import { leeContabilidad } from '@/features/agora-contabilidad/services/lecturas'

export const metadata: Metadata = { title: 'Contabilidad · Ágora', description: 'Cierre de costos del periodo y póliza propuesta para Contabilidad (contrato ERP-5B).' }

export default async function PaginaDeContabilidad({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeContabilidad(q.periodo ?? null)
  return r.ok ? <Contabilidad d={r.valor} /> : <AgoraApagada motivo={r.motivo} />
}
