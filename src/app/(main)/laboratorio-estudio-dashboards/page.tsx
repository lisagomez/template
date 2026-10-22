import type { Metadata } from 'next';
import { Estudio } from '@/features/estudio-dashboards/components/estudio';

export const metadata: Metadata = {
  title: 'Estudio de dashboards (laboratorio)',
  description: 'Un agente regenera el tablero desde una frase editando una especificación validada; toda cifra sale de la capa semántica dbt + MetricFlow (Golfo Norte, datos ficticios).',
};

/** Laboratorio: el lienzo pide todo a /api/estudio-dashboards, que cierra con 503 fuera del laboratorio. */
export default function PaginaEstudioDashboards() {
  return <Estudio inicial="growth" />;
}
