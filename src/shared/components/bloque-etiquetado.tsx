/**
 * El BLOQUE ETIQUETADO: el motivo de la marca Turno 25 (guía v1.0, §05). Un panel con una etiqueta en la
 * esquina que muestra entrada → salida o antes → después. Nació del bloque con etiqueta de Gradio («la
 * referencia de Gradio orienta el tono, no la forma»).
 *
 * Reglas: la variante `resultado` (naranja suave) es SOLO para el resultado; todo lo demás va `neutro`. La
 * etiqueta se corta con elipsis y el contenido parte palabras largas: los datos de peor caso (nombres de 50
 * letras, correos sin cortes, texto de derecha a izquierda) no rompen el panel.
 */
import type { ReactNode } from 'react';

export type VarianteBloque = 'neutro' | 'resultado';

const PANEL: Record<VarianteBloque, string> = {
  neutro: 'border-border bg-card text-card-foreground',
  resultado: 'border-marca-borde bg-marca-suave text-foreground',
};
const ETIQUETA: Record<VarianteBloque, string> = {
  neutro: 'border-border bg-card text-muted-foreground',
  resultado: 'border-marca-borde bg-marca-suave text-marca-suave-fg',
};

export function BloqueEtiquetado({ etiqueta, variante = 'neutro', children, className = '', prueba }: {
  etiqueta: string;
  variante?: VarianteBloque;
  children: ReactNode;
  className?: string;
  prueba?: string;
}) {
  return (
    <section
      data-bloque={variante}
      data-prueba={prueba}
      className={`relative min-w-0 rounded-lg border px-4 pb-4 pt-6 ${PANEL[variante]} ${className}`}
    >
      <span
        title={etiqueta}
        className={`absolute left-3 top-0 block max-w-[calc(100%-1.5rem)] -translate-y-1/2 truncate rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-etiqueta ${ETIQUETA[variante]}`}
      >
        {etiqueta || 'sin etiqueta'}
      </span>
      <div className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</div>
    </section>
  );
}

/** La cifra es el héroe: mono, tabular y con su unidad aparte (guía v1.0, tipografía). */
export function Cifra({ valor, unidad, grande = false }: { valor: string | number; unidad?: string; grande?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`font-mono font-semibold tabular-nums ${grande ? 'text-3xl' : 'text-base'}`}>{valor}</span>
      {unidad ? <span className="ml-1 text-sm text-muted-foreground">{unidad}</span> : null}
    </span>
  );
}
