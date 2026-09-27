'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaTablero } from '@/features/etiquetas/components/pantalla-tablero';

export default function Pagina() {
  return (
    <Marco titulo="Caducidades por sitio" descripcion="Lo vencido, lo que hay que retirar, lo que vence esta semana y este mes, y el orden FEFO para surtir.">
      {(e) => <PantallaTablero e={e} />}
    </Marco>
  );
}
