/**
 * «Ver con ojos», automático (idea de canva-creator: rechazar texto de relleno, producto equivocado,
 * «el trabajo terminó» no significa «se ve bien»). Revisa la pieza sobre la MISMA disposición con que
 * se dibuja: lo que se mide es lo que sale.
 */
import { contraste } from '../marca/colores.js';
import type { PerfilDeMarca } from '../marca/perfil.js';
import { FORMATO_POR_CANAL, type FormatoDePieza } from './formatos.js';
import { disposicion, type DatosDePieza } from './pieza-svg.js';

export type Gravedad = 'problema' | 'aviso';

export interface Observacion {
  readonly regla: 'desborda' | 'recortado' | 'contraste' | 'fuera-de-zona' | 'texto-de-plantilla' | 'formato-de-canal' | 'precio-sin-confirmar';
  readonly gravedad: Gravedad;
  readonly detalle: string;
}

/** Ancho aproximado de un texto: la media de un glifo latino ronda 0.56 del tamaño de letra. */
export function anchoAproximado(texto: string, tamLetra: number, factor = 0.56): number {
  return Math.round(texto.length * tamLetra * factor);
}

const PLANTILLA = /\[(por completar|pendiente|texto|placeholder)|lorem ipsum|xxx+|\{\{|\}\}/i;

export interface ContextoDeRevision {
  readonly canal?: string;
  /** El precio que trae la pieza está confirmado por el dueño (con impuestos). */
  readonly precioConfirmado?: boolean;
}

export function revisaPieza(m: PerfilDeMarca, d: DatosDePieza, ctx: ContextoDeRevision = {}): Observacion[] {
  const L = disposicion(d), obs: Observacion[] = [];
  const disponible = L.caja.x1 - L.caja.x0;
  const larga = L.lineas.find((l) => anchoAproximado(l, L.tamTitular) > disponible);
  if (larga) obs.push({ regla: 'desborda', gravedad: 'problema', detalle: `«${larga}» mide ~${anchoAproximado(larga, L.tamTitular)} px y caben ${disponible}` });
  if (L.recortado) obs.push({ regla: 'recortado', gravedad: 'aviso', detalle: 'el titular era demasiado largo y se recortó con «…»: acórtalo tú' });
  const tinta = contraste(m.colores.primario, m.colores.fondo) >= 4.5 ? m.colores.primario : m.colores.texto;
  if (contraste(tinta, m.colores.fondo) < 4.5) obs.push({ regla: 'contraste', gravedad: 'problema', detalle: `el texto contra el fondo da ${contraste(tinta, m.colores.fondo).toFixed(1)}:1 (mínimo 4.5)` });
  const ultimaLinea = L.yTitular + Math.round(L.tamTitular * 1.05) * (L.lineas.length - 1);
  const fueraDeZona = [L.yTitular - L.tamTitular < L.caja.y0, ultimaLinea > L.caja.y1, L.precio ? L.precio.y + L.precio.alto > L.caja.y1 || L.precio.y < L.caja.y0 : false];
  if (fueraDeZona.some(Boolean)) obs.push({ regla: 'fuera-de-zona', gravedad: 'problema', detalle: 'hay texto o precio donde lo tapa la interfaz de la red' });
  if (L.precio && L.precio.y < ultimaLinea + 20) obs.push({ regla: 'fuera-de-zona', gravedad: 'problema', detalle: 'el precio se encima con el titular' });
  if ([d.titular, d.apoyo ?? '', d.etiqueta ?? ''].some((t) => PLANTILLA.test(t))) obs.push({ regla: 'texto-de-plantilla', gravedad: 'problema', detalle: 'se ve texto de relleno o de plantilla en la imagen' });
  if (d.precio && ctx.precioConfirmado === false) obs.push({ regla: 'precio-sin-confirmar', gravedad: 'problema', detalle: `la pieza muestra ${d.precio} sin que el dueño lo haya confirmado` });
  const esperado = ctx.canal ? FORMATO_POR_CANAL[ctx.canal] : undefined;
  if (esperado && (d.formato ?? 'vertical') !== esperado) obs.push({ regla: 'formato-de-canal', gravedad: 'aviso', detalle: `para ${ctx.canal} va ${esperado}; esta pieza es ${d.formato ?? 'vertical'}` });
  return obs;
}

export function hayProblemas(obs: readonly Observacion[]): boolean {
  return obs.some((o) => o.gravedad === 'problema');
}

export function formatoSugerido(canal: string): FormatoDePieza {
  return FORMATO_POR_CANAL[canal] ?? 'vertical';
}
