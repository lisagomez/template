import type { Metadata } from 'next'
import { Inicio } from '@/features/agora/components/inicio'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { datosDeAgora } from '@/features/agora/services/datos'

export const metadata: Metadata = { title: 'Ágora', description: 'El espacio de trabajo de la organización: equipo, agentes internos y socios, con control financiero. Laboratorio con datos ficticios.' }

export default async function PaginaDeAgora() {
  const d = await datosDeAgora()
  return d.apagada ? <AgoraApagada motivo={d.motivo} /> : <Inicio yo={d.yo} arbol={d.arbol} espera={d.espera} />
}
