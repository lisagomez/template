import type { Metadata } from 'next'
import { Mostrador } from '@/features/recepcion/components/mostrador'

export const metadata: Metadata = {
  title: 'Recepción',
  description: 'El mostrador de un negocio de servicios ficticio: agenda de tools/calendario, intención sin LLM, el freno y la memoria del producto, con datos sintéticos.',
}

export default function PaginaRecepcion() {
  return <Mostrador />
}
