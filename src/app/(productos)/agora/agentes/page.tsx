import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Agentes } from '@/features/agora-agentes/components/agentes'
import { leeAgentes } from '@/features/agora-agentes/services/lecturas'

export const metadata: Metadata = { title: 'Agentes · Ágora', description: 'idCard, topes, suspender y revocar; la Puerta A2A cerrada y el socio simulado.' }

export default async function PaginaDeAgentes() {
  const r = await leeAgentes()
  return r.ok ? <Agentes d={r.valor} /> : <AgoraApagada motivo={r.motivo} />
}
