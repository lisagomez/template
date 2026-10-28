import type { Metadata } from 'next'
import { PantallaContabilidad } from '@/features/agora-contabilidad/components/pantalla'

export const metadata: Metadata = { title: 'Contabilidad · Ágora', description: 'Cierre del periodo y póliza propuesta para Contabilidad.' }

export default function PaginaContabilidad() {
  return <PantallaContabilidad />
}
