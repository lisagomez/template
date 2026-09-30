import type { Metadata } from 'next';
import { PanelDueno } from '@/features/ventas-whatsapp/components/panel-dueno';

export const metadata: Metadata = {
  title: 'Vendedor en WhatsApp',
  description: 'La bandeja de lo que el agente pasó al dueño y el tablero de lo que vendió cada canal.',
};

export default function PaginaVentasWhatsapp() {
  return <PanelDueno />;
}
