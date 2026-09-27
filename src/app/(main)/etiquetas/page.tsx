'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaEditor } from '@/features/etiquetas/components/pantalla-editor';

export default function Pagina() {
  return (
    <Marco titulo="Etiqueta GS1-128" descripcion="Arma la etiqueta de una caja o una tarima, revísala contra la norma GS1 y mándala a la Zebra.">
      {(e) => <PantallaEditor e={e} />}
    </Marco>
  );
}
