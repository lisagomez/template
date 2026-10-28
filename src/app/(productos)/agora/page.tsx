import type { Metadata } from 'next'
import { Inicio } from '@/features/agora/components/inicio'
import { AgoraApagada } from '@/features/agora/components/apagada'
import { datosDeAgora } from '@/features/agora/services/datos'
import { resumenDeAgora } from '@/features/agora/services/resumen'

export const metadata: Metadata = { title: 'Ágora', description: 'El espacio de trabajo de la organización: equipo, agentes internos y socios, con control financiero. Laboratorio con datos ficticios.' }

export default async function PaginaDeAgora() {
  const d = await datosDeAgora()
  if (d.apagada) return <AgoraApagada motivo={d.motivo} />
  const r = await resumenDeAgora()
  return <Inicio yo={d.yo} arbol={d.arbol} espera={d.espera} resumen={r.ok ? r.valor.linea : `sin resumen: ${r.motivo}`} />
}
