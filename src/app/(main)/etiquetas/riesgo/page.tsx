'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaRiesgo } from '@/features/etiquetas/components/pantalla-riesgo';

export default function Pagina() {
  return (
    <Marco titulo="Agente de riesgo" descripcion="No avisa por fecha sino por lo que no se va a vender a tiempo: días de inventario contra días que le quedan de venta. Recomienda; una persona decide, y las dos cosas quedan en la cadena.">
      {(e) => <PantallaRiesgo e={e} />}
    </Marco>
  );
}
