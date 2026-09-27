/**
 * Revisión de una escena antes de renderizar: sin personas, formato 9:16 a 30 fps, duración de 3 a
 * 8 s, todo texto dentro de la zona segura y nada que cargue recursos de fuera.
 */
import { cajaSegura, FORMATOS } from '../contenido/formatos.js';
import { cuadroSvg } from './cuadro.js';
import { TIPOS_DE_CAPA, type Escena } from './escena.js';

export interface ObservacionDeVideo {
  readonly regla: 'personas' | 'formato' | 'duracion' | 'fuera-de-zona' | 'recurso-externo';
  readonly detalle: string;
}

export function revisaEscena(e: Escena): ObservacionDeVideo[] {
  const obs: ObservacionDeVideo[] = [];
  const f = FORMATOS.historia, caja = cajaSegura(f);
  if (e.capas.some((c) => !TIPOS_DE_CAPA.includes(c.tipo))) obs.push({ regla: 'personas', detalle: 'la escena trae un tipo de capa que no es texto, precio ni marca (foto o cámara): no se permite en esta versión' });
  if (e.ancho !== f.ancho || e.alto !== f.alto || e.fps !== 30) obs.push({ regla: 'formato', detalle: `se espera 1080×1920 a 30 fps; llegó ${e.ancho}×${e.alto} a ${e.fps}` });
  if (e.duracion < 3 || e.duracion > 8) obs.push({ regla: 'duracion', detalle: `dura ${e.duracion} s; una promo va de 3 a 8 s` });
  for (const c of e.capas) {
    const alto = c.pastilla?.alto ?? 0, arriba = c.pastilla ? c.y : c.y - c.tam;
    if (arriba < caja.y0 || c.y + alto > caja.y1 || c.x < caja.x0) obs.push({ regla: 'fuera-de-zona', detalle: `«${c.texto}» queda donde lo tapa la interfaz de la red` });
  }
  const muestra = cuadroSvg(e, e.duracion - 1 / e.fps);
  if (/<image\b|href\s*=|url\(/i.test(muestra)) obs.push({ regla: 'recurso-externo', detalle: 'el cuadro intenta cargar una imagen o un recurso de fuera' });
  return obs;
}
