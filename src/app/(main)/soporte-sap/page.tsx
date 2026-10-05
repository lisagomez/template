import type { Metadata } from 'next'
import { SoporteSap } from '@/features/soporte-sap/components/soporte-sap'
import { encendido } from '@/features/soporte-sap/services/runtime'
import { vista } from '@/features/soporte-sap/services/vistas'
import { SESIONES } from '@/features/soporte-sap/services/tipos'

export const metadata: Metadata = {
  title: 'Soporte SAP · laboratorio',
  description: 'Soporte SAP de tres niveles en laboratorio: N3 levanta, el agente categoriza y propone, el HIL decide en la sala.',
}

/** El estado vive en memoria en el servidor; la página lo lee en cada visita. */
export const dynamic = 'force-dynamic'

export default function PaginaSoporteSap() {
  if (!encendido()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Soporte SAP · laboratorio apagado</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">Se enciende con <code>SOPORTE_SAP_LABORATORIO=1</code>. Corre con datos sintéticos, sin SAP real y sin modelo.</p>
      </main>
    )
  }
  return <SoporteSap inicial={vista(SESIONES.cliente)} />
}
