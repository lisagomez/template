import type { Metadata } from 'next'
import { PantallaTablero } from '@/features/agora-tablero/components/pantalla'

export const metadata: Metadata = { title: 'Tablero · Ágora', description: 'Tabla, kanban y Gantt de un workspace.' }

export default function PaginaTablero() {
  return <PantallaTablero />
}
