import type { Metadata } from 'next';
import { AprobarEnCelular } from '@/features/estudio-pymes/components/aprobar-en-celular';

export const metadata: Metadata = {
  title: 'Aprobar contenido',
  description: 'Aprueba desde tu celular las piezas, carruseles y videos del mes. Aprobar no publica.',
};

export default function PaginaAprobar() {
  return <AprobarEnCelular />;
}
