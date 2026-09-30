/**
 * El cronómetro de ventanas de una conversación: cuánto queda de la de atención (24 h desde el
 * último mensaje del cliente), de la entrada gratis (72 h de un anuncio Click-to-WhatsApp) y del
 * plazo para contestar un anuncio y abrirla, y qué costaría el SIGUIENTE mensaje libre. Sirve para
 * dos cosas: que el dueño conteste a tiempo (después, solo plantilla y cobrada) y que el sistema
 * no pague de más por contestar tarde.
 */
import { HORA } from '../comun/base.js';
import { atencionAbierta, entradaGratisAbierta, VENTANA_ATENCION, type Ventanas } from './tarifas.js';

export type CostoSiguiente = 'gratis_anuncio' | 'cupo_o_utilidad' | 'solo_plantilla';

export interface Cronometro {
  atencion: { abierta: boolean; restanteMs: number; cierraEn: number | null };
  entradaGratis: { abierta: boolean; restanteMs: number; cierraEn: number | null };
  /** Un anuncio aún sin responder: contestar antes de `vence` abre 72 h gratis. */
  anuncioPorResponder: { restanteMs: number; vence: number } | null;
  siguiente: CostoSiguiente;
  /** Aviso para el dueño cuando algo cierra en menos de `UMBRAL_AVISO`. */
  aviso: string | null;
}

export const UMBRAL_AVISO = 2 * HORA;

export function formatoRestante(ms: number): string {
  if (ms <= 0) return 'cerrada';
  const min = Math.ceil(ms / 60_000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export function cronometro(v: Ventanas, ahora: number): Cronometro {
  const csw = atencionAbierta(v, ahora);
  const cierraCsw = v.ultimoDelCliente !== undefined ? v.ultimoDelCliente + VENTANA_ATENCION : null;
  const fep = entradaGratisAbierta(v, ahora);
  const cierraFep = v.fep ? v.fep.venceEn : null;
  const venceAnuncio = v.anuncioSinResponder !== undefined ? v.anuncioSinResponder + VENTANA_ATENCION : null;
  const anuncioPorResponder = venceAnuncio !== null && ahora < venceAnuncio ? { restanteMs: venceAnuncio - ahora, vence: venceAnuncio } : null;
  const siguiente: CostoSiguiente = fep || anuncioPorResponder ? 'gratis_anuncio' : csw ? 'cupo_o_utilidad' : 'solo_plantilla';
  let aviso: string | null = null;
  if (anuncioPorResponder && anuncioPorResponder.restanteMs < UMBRAL_AVISO) aviso = `Contesta antes de ${formatoRestante(anuncioPorResponder.restanteMs)}: vino de un anuncio y responder a tiempo abre 72 h gratis.`;
  else if (csw && cierraCsw !== null && cierraCsw - ahora < UMBRAL_AVISO && !fep) aviso = `La ventana de 24 h cierra en ${formatoRestante(cierraCsw - ahora)}: después solo se le puede escribir con plantilla (cobrada).`;
  else if (fep && cierraFep !== null && cierraFep - ahora < UMBRAL_AVISO) aviso = `La entrada gratis de 72 h cierra en ${formatoRestante(cierraFep - ahora)}.`;
  return {
    atencion: { abierta: csw, restanteMs: csw && cierraCsw !== null ? cierraCsw - ahora : 0, cierraEn: cierraCsw },
    entradaGratis: { abierta: fep, restanteMs: fep && cierraFep !== null ? cierraFep - ahora : 0, cierraEn: cierraFep },
    anuncioPorResponder, siguiente, aviso,
  };
}
