'use client';

/** Lo único propio de una tarjeta de este laboratorio: la etiqueta generada contra su referencia aprobada. El resto lo pinta la tarjeta del banco. */
import { BloqueEtiquetado } from '@/shared/components/bloque-etiquetado';

export function PiezaEtiqueta({ svg, referencia }: { svg: string; referencia?: string }) {
  return (
    <BloqueEtiquetado etiqueta={referencia ? 'Actual → referencia' : 'Pieza'} variante="resultado" prueba="pieza-caso">
      <div className="flex flex-wrap gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí, en data URL: nada que optimizar ni que descargar */}
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Etiqueta generada por el caso" width={260} className="rounded border border-border bg-card" />
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG de referencia servido desde public/ */}
        {referencia ? <img src={referencia} alt="Etiqueta de referencia" width={260} className="rounded border border-border bg-card" /> : null}
      </div>
    </BloqueEtiquetado>
  );
}
