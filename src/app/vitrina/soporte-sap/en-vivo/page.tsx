import type { Metadata } from 'next'
import { EnVivo } from '@/features/soporte-sap/vitrina/componentes/en-vivo'
import { Titular } from '@/features/soporte-sap/vitrina/componentes/bento'

export const metadata: Metadata = { title: 'En vivo' }

export default function PaginaEnVivo() {
  return (
    <>
      <Titular antetitulo="En vivo" titulo="El producto corriendo, no una grabación"
        bajada="Levanta una incidencia como el cliente, atiéndela como la consultora y decídela como el laboratorio. Corre en la máquina del laboratorio mientras esté encendida." />
      <EnVivo />
    </>
  )
}
