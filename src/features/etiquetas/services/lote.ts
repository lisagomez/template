/**
 * Etiquetas por lote desde el catalogo: una etiqueta de caja por articulo elegido, cada una con
 * su revision. Si alguna no pasa, el lote entero no se imprime (y se dice cual y por que).
 */
import { aZpl, categoriaPorId, disenaDesdeDatos, revisa, simbolosDe, type Articulo, type Categoria, type PerfilImpresora } from './nucleo.ts';

export interface PedidoLote {
  readonly sitio: string;
  readonly lote: string;
  readonly caducidad: string;
  readonly copias: number;
}

export interface EtiquetaDeLote {
  readonly sku: string;
  readonly bloquea: boolean;
  readonly errores: readonly string[];
}

export function zplDeLote(articulos: readonly Articulo[], p: PedidoLote, perfil: PerfilImpresora, categorias: readonly Categoria[], hoy: string): { zpl: string; etiquetas: EtiquetaDeLote[] } {
  const etiquetas: EtiquetaDeLote[] = [];
  const partes: string[] = [];
  for (const a of articulos) {
    if (!a.gtinCaja) { etiquetas.push({ sku: a.sku, bloquea: true, errores: ['sin GTIN de caja'] }); continue; }
    const datos = { tipo: 'caja' as const, producto: a.descripcion, gtin: a.gtinCaja, caducidad: p.caducidad, lote: p.lote, sitio: p.sitio, ...(a.unidadesPorCaja > 1 ? { unidades: a.unidadesPorCaja } : {}) };
    const diseno = disenaDesdeDatos(datos, perfil, Number(hoy.slice(0, 4)));
    const r = revisa({ simbolos: simbolosDe(datos), diseno, perfil, categoria: categoriaPorId(categorias, a.categoria), hoy });
    const errores = r.puntos.filter((x) => x.estado === 'error').map((x) => x.titulo);
    etiquetas.push({ sku: a.sku, bloquea: r.bloquea, errores });
    if (!r.bloquea) partes.push(aZpl(diseno, perfil, { copias: p.copias }));
  }
  return { zpl: partes.join(''), etiquetas };
}
