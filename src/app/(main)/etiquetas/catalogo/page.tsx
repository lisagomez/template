'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaCatalogo } from '@/features/etiquetas/components/pantalla-catalogo';

export default function Pagina() {
  return (
    <Marco titulo="Catálogo y GTIN" descripcion="Sube el catálogo en Excel o CSV: se validan los códigos que ya existen y se asignan los que faltan con la regla mixta.">
      {(e) => <PantallaCatalogo e={e} />}
    </Marco>
  );
}
