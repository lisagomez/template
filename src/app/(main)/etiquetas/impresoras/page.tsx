'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaImpresoras } from '@/features/etiquetas/components/pantalla-impresoras';

export default function Pagina() {
  return (
    <Marco titulo="Impresoras" descripcion="Un perfil por impresora y sitio, con la etiqueta de calibración para ajustar contra el papel real.">
      {(e) => <PantallaImpresoras e={e} />}
    </Marco>
  );
}
