'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaConteo } from '@/features/etiquetas/components/pantalla-conteo';

export default function Pagina() {
  return (
    <Marco titulo="Inventario físico" descripcion="Conteo ciego por ubicación contra la cadena: lo que no cuadra lo recuenta otra persona, lo autoriza quien no contó, y el ajuste entra como evento de conteo en el expediente de cada lote.">
      {(e) => <PantallaConteo e={e} />}
    </Marco>
  );
}
