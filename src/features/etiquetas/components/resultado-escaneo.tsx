'use client';

/**
 * La respuesta de un escaneo, para no tener que leerla: el COLOR a pantalla completa (el del
 * semaforo o el del resultado), vibracion y sonido distintos para bien, aviso y error, y el titulo
 * grande. Se quita sola a los 1,6 s (o al tocarla) y queda la tarjeta abajo con «deshacer».
 */
import { useEffect } from 'react';
import type { EstadoSemaforo, VistaEscaneo } from '../services/nucleo.ts';
import { COLOR_SEMAFORO } from '../services/presenta.ts';

export const COLOR_VISTA: Record<VistaEscaneo['color'], string> = {
  ...COLOR_SEMAFORO,
  ok: 'bg-emerald-600 text-white', aviso: 'bg-amber-400 text-neutral-950', error: 'bg-red-700 text-white', info: 'bg-sky-700 text-white',
} satisfies Record<EstadoSemaforo | 'ok' | 'aviso' | 'error' | 'info', string>;

let audio: AudioContext | null = null;

/** Vibracion y tono: corto y agudo = bien; doble = aviso; largo y grave = error. */
export function retroalimenta(sonido: VistaEscaneo['sonido']): void {
  try { navigator.vibrate?.(sonido === 'ok' ? 60 : sonido === 'aviso' ? [80, 60, 80] : [250, 80, 250]); } catch { /* sin vibrador */ }
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = sonido === 'error' ? 'square' : 'sine';
    o.frequency.value = sonido === 'ok' ? 1250 : sonido === 'aviso' ? 740 : 190;
    g.gain.value = 0.07;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (sonido === 'ok' ? 0.09 : 0.3));
  } catch { /* sin audio */ }
}

/** Lo que el detalle repite de lo que ya se ve grande (articulo, «baja primero», tarea cerrada). */
const repetido = (v: VistaEscaneo, d: string): boolean =>
  Boolean((v.tarea && d.startsWith('Tarea de la ronda cerrada')) || (v.fefo && d.startsWith('Este no:')) || (v.articulo?.descripcion && v.lote && d.startsWith(`${v.articulo.descripcion} · lote ${v.lote.lote}`) && !/cajas?|motivo/.test(d)));

function Cuerpo({ v }: { v: VistaEscaneo }) {
  return (
    <>
      <p className="text-3xl font-black leading-tight" data-prueba="titulo-escaneo">{v.titulo}</p>
      {v.articulo?.descripcion ? <p className="text-lg font-semibold">{v.articulo.descripcion}</p> : null}
      {v.lote ? <p className="text-base" data-prueba="lote-escaneo">Lote <b>{v.lote.lote}</b> · caduca <b>{v.lote.caducidad}</b>{v.lote.ubicacion ? <> · en <b>{v.lote.ubicacion}</b></> : null}</p> : null}
      {v.fefo ? <p className="rounded-lg bg-black/15 px-2 py-1 text-base font-bold" data-prueba="fefo-escaneo">Baja primero el lote {v.fefo.lote} (caduca {v.fefo.caducidad}) de {v.fefo.ubicacion}</p> : null}
      {v.detalle.filter((d) => !repetido(v, d)).map((d) => <p key={d} className="text-sm opacity-90">{d}</p>)}
      {v.tarea ? <p className="rounded-lg bg-white/20 px-2 py-1 text-sm font-semibold" data-prueba="tarea-cerrada">✓ Tarea de la ronda cerrada: {v.tarea.instruccion}</p> : null}
    </>
  );
}

export function DestelloEscaneo({ v, alCerrar }: { v: VistaEscaneo; alCerrar: () => void }) {
  useEffect(() => { retroalimenta(v.sonido); const t = setTimeout(alCerrar, 1600); return () => clearTimeout(t); }, [v, alCerrar]);
  return (
    <button type="button" onClick={alCerrar} className={`fixed inset-0 z-50 flex flex-col items-start justify-center gap-2 p-6 text-left ${COLOR_VISTA[v.color]}`} data-prueba="destello" data-color={v.color} data-tipo={v.tipo}>
      <Cuerpo v={v} />
      <span className="mt-4 text-xs opacity-75">Toca para seguir</span>
    </button>
  );
}

export function TarjetaEscaneo({ v, alDeshacer }: { v: VistaEscaneo; alDeshacer?: () => void }) {
  return (
    <div className={`space-y-1 rounded-xl p-3 ${COLOR_VISTA[v.color]}`} data-prueba="ultimo-escaneo" data-color={v.color} data-tipo={v.tipo}>
      <Cuerpo v={v} />
      {v.deshacer && alDeshacer ? <button type="button" className="mt-1 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-bold text-neutral-900 disabled:opacity-50" onClick={alDeshacer} data-prueba="deshacer">Deshacer este escaneo</button> : null}
    </div>
  );
}
