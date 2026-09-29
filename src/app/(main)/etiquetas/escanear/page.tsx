'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaEscanear } from '@/features/etiquetas/components/pantalla-escanear';

export default function Pagina() {
  return (
    <Marco titulo="Escanear" descripcion="Di dónde estás escaneando la etiqueta de la zona o del rack; desde ahí cada escaneo hace lo que toca en esa zona para tu rol, y cierra las tareas de la ronda de hoy.">
      {(e) => <PantallaEscanear e={e} />}
    </Marco>
  );
}
