'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaRecibir } from '@/features/etiquetas/components/pantalla-recibir';

export default function Pagina() {
  return (
    <Marco titulo="Recibir mercancía" descripcion="Aunque la caja no traiga GS1-128: escanea su código, fotografía la caducidad, confirma lo que leyó la máquina y sale la etiqueta de la casa.">
      {(e) => <PantallaRecibir e={e} />}
    </Marco>
  );
}
