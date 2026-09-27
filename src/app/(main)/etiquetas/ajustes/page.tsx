'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaAjustes } from '@/features/etiquetas/components/pantalla-ajustes';

export default function Pagina() {
  return (
    <Marco titulo="Ajustes" descripcion="Prefijo de empresa, códigos internos, umbrales del semáforo, sitios y servicios externos.">
      {(e) => <PantallaAjustes e={e} />}
    </Marco>
  );
}
