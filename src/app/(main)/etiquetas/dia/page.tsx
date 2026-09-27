'use client';

import { Marco } from '@/features/etiquetas/components/marco';
import { PantallaDia } from '@/features/etiquetas/components/pantalla-dia';

export default function Pagina() {
  return (
    <Marco titulo="El día" descripcion="Todo lo del día en una pantalla: avisos, avance de la ronda, lo pendiente por confirmar, lo que entró hoy a rojo, conteos, hallazgos y recomendaciones del agente. Cada renglón lleva a donde se resuelve.">
      {(e) => <PantallaDia e={e} />}
    </Marco>
  );
}
