import { Suspense } from 'react'
import { CapaAgora } from '@/features/agora/components/capa-agora'
import { datosDeAgora } from '@/features/agora/services/datos'

export const dynamic = 'force-dynamic'

/** Ágora dentro de la capa, con su marca, su asistente (Atenea) y su memoria por organización (`productos/composiciones/agora.json`). */
export default async function LayoutDeAgora({ children }: { children: React.ReactNode }) {
  const datos = await datosDeAgora()
  return <Suspense><CapaAgora datos={datos}>{children}</CapaAgora></Suspense>
}
