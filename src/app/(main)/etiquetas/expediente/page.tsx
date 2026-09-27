'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaExpediente } from '@/features/etiquetas/components/pantalla-expediente';

export default function Pagina() {
  return (
    <Marco titulo="Expediente del lote" descripcion="La historia completa de cada lote en todos los sitios, con su prueba: cada evento encadenado por hash, la raíz de su día anclada y firmada, y los enlaces de transferencia.">
      {(e) => <PantallaExpediente e={e} />}
    </Marco>
  );
}
