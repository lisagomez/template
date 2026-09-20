import type { Metadata } from 'next';
import { Laboratorio } from '@/features/laboratorio-voz/components/laboratorio';

export const metadata: Metadata = {
  title: 'Laboratorio de voz',
  description: 'Prueba los veinte casos de uso de la voz, con su estado real, en esta computadora.',
};

/** `?caso=6` abre esa tarjeta al entrar (para enlaces desde otras tarjetas y para las capturas). */
export default async function PaginaLaboratorio({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { caso } = await searchParams;
  const n = Number(Array.isArray(caso) ? caso[0] : caso);
  return <Laboratorio casoAbierto={Number.isInteger(n) && n >= 1 && n <= 20 ? n : undefined} />;
}
