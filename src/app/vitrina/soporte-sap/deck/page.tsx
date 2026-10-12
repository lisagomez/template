import type { Metadata } from 'next'
import { Deck } from '@/features/soporte-sap/vitrina/componentes/deck'
import { Titular } from '@/features/soporte-sap/vitrina/componentes/bento'

export const metadata: Metadata = { title: 'Deck para consultoras' }

export default function PaginaDelDeck() {
  return (
    <>
      <div className="print:hidden">
        <Titular antetitulo="Deck para consultoras" titulo="Soporte SAP, en 13 láminas"
          bajada="Para presentarlo a tu equipo: el dolor, la propuesta, los tres niveles, el journey, lo que se mide, lo que no hace y lo que todavía no se promete." />
      </div>
      <Deck />
    </>
  )
}
