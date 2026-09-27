/**
 * SVG → PNG con el canvas DEL PROPIO NAVEGADOR: sin dependencias y sin subir la pieza a ningún lado.
 * Subpath aparte porque usa el DOM; importarlo en Node no rompe nada, pero llamarlo ahí lanza un error
 * que dice por qué (en el servidor se rasteriza con un navegador sin ventana, fuera del paquete).
 * Las fuentes son las que tenga instaladas quien rasteriza: las piezas usan familias con respaldo.
 */
export interface OpcionesDeRaster {
  readonly ancho: number;
  readonly alto: number;
}

export async function svgAPng(svg: string, o: OpcionesDeRaster): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('svgAPng corre en el navegador; en el servidor usa un navegador sin ventana');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((listo, falla) => { img.onload = () => listo(); img.onerror = () => falla(new Error('el SVG no se pudo dibujar')); img.src = url; });
    const lienzo = document.createElement('canvas');
    lienzo.width = o.ancho;
    lienzo.height = o.alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('el navegador no dio un contexto 2D');
    ctx.drawImage(img, 0, 0, o.ancho, o.alto);
    return await new Promise<Blob>((listo, falla) => lienzo.toBlob((b) => (b ? listo(b) : falla(new Error('no se pudo codificar el PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Medidas de un SVG a partir de su viewBox (para no pedirlas dos veces). */
export function medidasDeSvg(svg: string): OpcionesDeRaster | null {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  return m ? { ancho: Number(m[1]), alto: Number(m[2]) } : null;
}
