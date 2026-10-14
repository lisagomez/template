import type { Metadata } from 'next'
import { Manual } from '@/features/soporte-sap/vitrina/componentes/manual'
import { Titular } from '@/features/soporte-sap/vitrina/componentes/bento'

export const metadata: Metadata = { title: 'Manual de usuario' }

export default function PaginaDelManual() {
  return (
    <>
      <Titular antetitulo="Manual de usuario" titulo="Cómo se usa, rol por rol"
        bajada="Para el usuario del cliente, el consultor y el laboratorio: qué hace cada quien, paso a paso, con capturas del producto." />
      <Manual />
    </>
  )
}
