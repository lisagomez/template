/**
 * El informe de migración: quien usa OpenWA pega las llamadas que hace (`MÉTODO /api/...`, o la URL completa) y ve,
 * por cada una, si sigue igual, qué cambia, o qué la reemplaza por la vía oficial. Sale de la misma matriz que sirve
 * la fachada, así que no puede decir otra cosa que lo que la fachada hace.
 */
import { ESTADOS_OPENWA, type EstadoOpenWA } from './criterios.js';
import { encuentra } from './fachada.js';
import { CONTRATO_OPENWA, MATRIZ_OPENWA } from './matriz.js';

export interface LineaInforme { llamada: string; metodo: string; ruta: string; operacion?: string; estado: EstadoOpenWA | 'desconocida'; nota: string; alternativa?: string; fuente?: string }

export function resumenMatriz() {
  const porEstado = Object.fromEntries(ESTADOS_OPENWA.map((e) => [e, MATRIZ_OPENWA.filter((f) => f.estado === e).length])) as Record<EstadoOpenWA, number>;
  return { version: CONTRATO_OPENWA.version, sha256: CONTRATO_OPENWA.sha256, total: MATRIZ_OPENWA.length, porEstado, sirve: porEstado.igual + porEstado.diferencia };
}

/** `POST https://host/api/sessions/x/messages/send-text` → método y ruta desde `/api/`. */
function leeLlamada(linea: string): { metodo: string; ruta: string } | null {
  const m = /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i.exec(linea);
  if (!m?.[1] || !m[2]) return null;
  const sinOrigen = m[2].replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
  const desde = sinOrigen.indexOf('/api/');
  return desde < 0 ? null : { metodo: m[1].toUpperCase(), ruta: sinOrigen.slice(desde) };
}

export function informeDeMigracion(texto: string) {
  const lineas: LineaInforme[] = texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500).map((llamada) => {
    const l = leeLlamada(llamada);
    if (!l) return { llamada, metodo: '', ruta: '', estado: 'desconocida' as const, nota: 'No se lee como «MÉTODO /api/...».' };
    const e = encuentra(l.metodo, l.ruta);
    if (!e) return { llamada, ...l, estado: 'desconocida' as const, nota: 'No está en el contrato de OpenWA 0.25.0.' };
    return { llamada, ...l, operacion: e.f.operacion, estado: e.f.estado, nota: e.f.nota, fuente: e.f.fuente, ...(e.f.alternativa ? { alternativa: e.f.alternativa } : {}) };
  });
  const cuenta = (e: LineaInforme['estado']) => lineas.filter((x) => x.estado === e).length;
  const resumen = { igual: cuenta('igual'), diferencia: cuenta('diferencia'), imposible: cuenta('imposible'), pendiente: cuenta('pendiente'), fuera: cuenta('fuera'), desconocida: cuenta('desconocida') };
  return { lineas, resumen, migraSinCambios: lineas.length > 0 && resumen.igual === lineas.length };
}
