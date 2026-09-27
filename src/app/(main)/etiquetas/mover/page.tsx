'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaMover } from '@/features/etiquetas/components/pantalla-mover';

export default function Pagina() {
  return (
    <Marco titulo="Mover entre zonas" descripcion="Recibo, almacén, piso de venta y merma: lee la zona y luego las cajas o la tarima. Lo vencido no sube a piso, y el FEFO avisa qué lote bajar primero.">
      {(e) => <PantallaMover e={e} />}
    </Marco>
  );
}
