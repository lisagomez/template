'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaLector } from '@/features/etiquetas/components/pantalla-lector';

export default function Pagina() {
  return (
    <Marco titulo="Leer una etiqueta" descripcion="Con la cámara o con la pistola: qué producto es, qué lote, cuánto le queda y dónde está.">
      {(e) => <PantallaLector e={e} />}
    </Marco>
  );
}
