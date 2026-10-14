import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Marco } from '@/features/soporte-sap/vitrina/componentes/marco'

export const metadata: Metadata = {
  title: { default: 'Soporte SAP · vitrina', template: '%s · Soporte SAP' },
  description: 'Soporte SAP de tres niveles: el cliente levanta, el agente prepara con evidencia, una persona decide. Vitrina de laboratorio con datos sintéticos.',
  robots: { index: false, follow: false },
}

export default function LayoutDeLaVitrina({ children }: { children: ReactNode }) {
  return <Marco>{children}</Marco>
}
