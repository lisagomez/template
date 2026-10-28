import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { AltaDeLaOrganizacion } from '@/features/agora/components/alta'
import { leeAlta } from '@/features/agora/services/alta'

export const metadata: Metadata = { title: 'Alta · Ágora', description: 'El alta de la organización, paso por paso: una decisión por paso.' }

export default async function PaginaDelAlta({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeAlta()
  return r.ok ? <AltaDeLaOrganizacion pasos={r.valor} paso={Number(q.paso ?? 1) || 1} /> : <AgoraApagada motivo={r.motivo} />
}
