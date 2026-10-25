import { CapaLaboratorio } from '@/shared/capa/laboratorio'

/** Todo lo de `(main)` vive dentro de la capa (`productos/composiciones/laboratorio.json`): la ventana común. */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CapaLaboratorio>{children}</CapaLaboratorio>
}
