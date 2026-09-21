import type { Metadata } from 'next';
import { Ajustes } from '@/features/ajustes/components/ajustes';

export const metadata: Metadata = {
  title: 'Ajustes del dictado',
  description: 'Motor, tecla, pegado, audio, texto, sonidos e historial: lo que decides una vez y el dictado recuerda.',
};

export default function PaginaAjustes() {
  return <Ajustes />;
}
