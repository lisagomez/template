import { BotonDictado } from '@/features/dictado/components/boton-dictado'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {/* Nav, Sidebar, etc. */}
      <div className="fixed right-4 top-4 z-50">
        <BotonDictado />
      </div>
      <main>{children}</main>
    </div>
  )
}
