import type { Metadata } from 'next';
import { MigracionOpenWA, type FilaPanel } from '@/features/ventas-whatsapp/components/migracion-openwa';
import { MATRIZ_OPENWA, resumenMatriz } from '../../../../tools/ventas-whatsapp/dist/openwa/index.js';

export const metadata: Metadata = {
  title: 'Migración desde OpenWA',
  description: 'Qué cambia al pasar de OpenWA a la API oficial de WhatsApp: la matriz de las 203 operaciones y el informe de tus llamadas.',
};

export default function PaginaMigracionOpenWA() {
  const filas: FilaPanel[] = MATRIZ_OPENWA.map(({ operacion, metodo, ruta, etiqueta, estado, nota, alternativa, fuente, certeza }) => ({ operacion, metodo, ruta, etiqueta, estado, nota, fuente, certeza, ...(alternativa ? { alternativa } : {}) }));
  return <MigracionOpenWA resumen={resumenMatriz()} filas={filas} />;
}
