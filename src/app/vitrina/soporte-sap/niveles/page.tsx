import type { Metadata } from 'next'
import { Niveles } from '@/features/soporte-sap/vitrina/componentes/niveles'
import { Titular } from '@/features/soporte-sap/vitrina/componentes/bento'
import type { Rol } from '@/features/soporte-sap/services/tipos'
import indice from '../../../../../public/vitrina/soporte-sap/momentos/indice.json'

export const metadata: Metadata = { title: 'Los tres niveles' }
const ROLES: readonly Rol[] = ['cliente', 'consultor', 'superadmin', 'experto']

export default async function PaginaDeNiveles({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const rol = ROLES.find((r) => r === q['rol']) ?? 'cliente'
  const momento = indice.momentos.find((m) => m.id === q['momento'])?.id ?? indice.momentos[0]!.id
  return (
    <>
      <Titular antetitulo="La vitrina" titulo="Lo que ve cada nivel, momento a momento"
        bajada="Elige un momento del journey y cambia de rol con los botones: es el mismo producto, con lo que devolvió a cada quien en ese instante. De solo lectura; para actuar, usa la sección en vivo." />
      <Niveles momentos={indice.momentos} momentoInicial={momento} rolInicial={rol} />
    </>
  )
}
