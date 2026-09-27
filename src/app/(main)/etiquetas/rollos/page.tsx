'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaRollos } from '@/features/etiquetas/components/pantalla-rollos';

export default function Pagina() {
  return (
    <Marco titulo="Rollos y presupuesto" descripcion="Cuánto se gasta en rollos de etiquetas por sitio contra lo presupuestado, a qué ritmo, y cuánto costaría un escenario antes de comprar.">
      {(e) => <PantallaRollos e={e} />}
    </Marco>
  );
}
