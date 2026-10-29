import type { Metadata } from 'next'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { Tablero } from '@/features/agora-tablero/components/tablero'
import { leeTablero } from '@/features/agora-tablero/services/lecturas'

export const metadata: Metadata = { title: 'Tablero · Ágora', description: 'Tabla, kanban y Gantt de un workspace: los agentes solo proponen.' }

export default async function PaginaDelTablero({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const r = await leeTablero(q.ws ?? null)
  if (!r.ok || !r.valor) return <AgoraApagada motivo={r.ok ? 'no hay workspaces visibles para ti' : r.motivo} />
  const vista = q.vista === 'kanban' || q.vista === 'gantt' ? q.vista : 'tabla'
  return <Tablero key={`${r.valor.workspace.id}-${vista}-${q.cat ?? ''}`} d={r.valor} vista={vista} cat={q.cat ?? null} />
}
