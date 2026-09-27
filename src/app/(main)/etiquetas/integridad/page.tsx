'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaIntegridad } from '@/features/etiquetas/components/pantalla-integridad';

export default function Pagina() {
  return (
    <Marco titulo="Integridad por sucursal" descripcion="Lo que verifica el central: la cadena de cada sitio, que el estado sea su proyección, las raíces ancladas y firmadas, y lo que falta por anclar.">
      {(e) => <PantallaIntegridad e={e} />}
    </Marco>
  );
}
