import { CapaRecepcion } from '@/features/recepcion/components/capa-recepcion'

/** Recepción dentro de la capa, con su marca, su asistente (Nora) y su memoria por inquilino (`productos/composiciones/recepcion.json`). */
export default function LayoutDeRecepcion({ children }: { children: React.ReactNode }) {
  return <CapaRecepcion>{children}</CapaRecepcion>
}
