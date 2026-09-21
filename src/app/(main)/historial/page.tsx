import type { Metadata } from 'next';
import { Historial } from '@/features/historial/components/historial';

export const metadata: Metadata = {
  title: 'Historial de dictado',
  description: 'Todo lo que has dictado, en esta computadora: buscar, copiar, corregir, borrar y exportar.',
};

export default function PaginaHistorial() {
  return <Historial />;
}
