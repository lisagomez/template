import type { Metadata } from 'next';
import { CentroDeMando } from '@/features/centro-de-mando/components/centro-de-mando';

export const metadata: Metadata = {
  title: 'Centro de mando',
  description: 'Centro de mando por voz local: órdenes sin LLM en menos de un segundo, conversación en flujo, interrupción y telemetría por etapa.',
};

export default function PaginaCentroDeMando() {
  return <CentroDeMando />;
}
