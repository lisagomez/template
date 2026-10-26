import { CapaMesa } from '@/shared/capa/mesa'

/** La mesa del experto dentro de la capa, con la marca y el asistente de Soporte SAP (sin LLM, sin voz: no cabe un motor local). */
export default function LayoutDeLaMesa({ children }: { children: React.ReactNode }) {
  return <CapaMesa>{children}</CapaMesa>
}
