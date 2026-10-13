import type { Metadata } from 'next'
import { Journey } from '@/features/soporte-sap/vitrina/componentes/journey'
import { Titular } from '@/features/soporte-sap/vitrina/componentes/bento'
import { JOURNEY } from '@/features/soporte-sap/vitrina/contenido/journey'

export const metadata: Metadata = { title: 'Journey' }

export default function PaginaDelJourney() {
  return (
    <>
      <Titular antetitulo="Journey de experiencia" titulo={`De la incidencia a la salida, en ${JOURNEY.length} pasos y tres niveles`}
        bajada="Quién actúa en cada paso, qué ve y qué necesita, quién decide, qué se mide y qué se protege. Cada paso trae su captura del producto y abre ese momento en la vitrina." />
      <Journey />
    </>
  )
}
