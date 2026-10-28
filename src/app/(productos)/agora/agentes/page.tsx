import type { Metadata } from 'next'
import { PantallaAgentes } from '@/features/agora-agentes/components/pantalla'

export const metadata: Metadata = { title: 'Agentes y Puerta · Ágora', description: 'idCard, topes, suspender y revocar; la Puerta A2A cerrada.' }

export default function PaginaAgentes() {
  return <PantallaAgentes />
}
