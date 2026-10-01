import type { Metadata } from 'next';
import { PlataformaVentas } from '@/features/ventas-whatsapp/components/plataforma-ventas';

export const metadata: Metadata = {
  title: 'Plataforma del vendedor',
  description: 'Altas de pymes por el BSP propio, números en venta y renta, y la factura del mes.',
};

export default function PaginaPlataformaVentas() {
  return <PlataformaVentas />;
}
