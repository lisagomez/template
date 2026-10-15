import type { Metadata } from 'next';
import { LaboratorioCalendario } from '@/features/laboratorio-calendario/components/laboratorio-calendario';

export const metadata: Metadata = {
  title: 'Laboratorio del calendario',
  description: 'La herramienta de calendario (un espejo, una pluma) contra su simulador de Google: alcances, reservas, actividad programada y credencial caducada.',
};

export default function PaginaLaboratorioCalendario() {
  return <LaboratorioCalendario />;
}
