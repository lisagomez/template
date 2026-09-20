/**
 * Puente al cerebro de asesoria de ventas (`tools/asesor-ventas`, sin LLM, cero deps). Corre
 * en el navegador: la transcripcion no sale de la pantalla de quien prueba. Entra lo que da la
 * transcripcion por turnos mas «de que lado esta cada voz»; sale el analisis con evidencia.
 */
import {
  analizarReunion,
  participantesDesdeHablantes,
  playbookPorTipo,
  transcripcionDesdeTurnos,
  type AnalisisReunion,
  type Reunion,
  type TipoReunion,
} from '../../../../tools/asesor-ventas/dist/index.js';
import type { Segmento } from '../types/index.ts';

export type { AnalisisReunion, TipoReunion };
export { ETIQUETA_DIMENSION } from '../../../../tools/asesor-ventas/dist/index.js';

export type Lado = 'interno' | 'cliente';

export const TIPOS_REUNION: Array<{ valor: TipoReunion; nombre: string }> = [
  { valor: 'discovery', nombre: 'Descubrimiento (primera reunion)' },
  { valor: 'demo', nombre: 'Demostracion' },
  { valor: 'negociacion', nombre: 'Negociacion' },
  { valor: 'revision_tecnica', nombre: 'Revision tecnica' },
  { valor: 'cierre', nombre: 'Cierre' },
];

export const hablantesDe = (segmentos: readonly Segmento[]): string[] => [...new Set(segmentos.map((s) => s.hablante))];

export function analizaTurnos(segmentos: readonly Segmento[], lados: Record<string, Lado>, tipoReunion: TipoReunion, motor = 'parakeet'): AnalisisReunion {
  const hablantes = hablantesDe(segmentos);
  const participantes = participantesDesdeHablantes(
    hablantes,
    Object.fromEntries(hablantes.map((h) => [h, { rol: lados[h] === 'interno' ? 'Asesor' : 'Cliente', lado: lados[h] ?? 'cliente' }])),
  );
  const asesor = participantes.find((p) => p.lado === 'interno')?.nombre ?? hablantes[0] ?? 'Asesor';
  const reunion: Reunion = { id: 'laboratorio', titulo: 'Reunion de prueba', cuenta: 'Prueba', tipoReunion, participantes, asesor, fecha: new Date().toISOString() };
  const transcripcion = transcripcionDesdeTurnos(segmentos, { reunionId: reunion.id, motor });
  return analizarReunion(reunion, transcripcion, playbookPorTipo(tipoReunion));
}

/** «Nombre: texto» por linea → segmentos con tiempos ficticios (6 s por linea), para probar sin audio. */
export function segmentosDesdeTexto(texto: string, segundosPorLinea = 6): Segmento[] {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const m = /^([^:]{1,40}):\s*(.+)$/.exec(l);
      return { inicioMs: i * segundosPorLinea * 1000, finMs: (i + 1) * segundosPorLinea * 1000, hablante: m ? (m[1] ?? '').trim() : 'Hablante 1', texto: m ? (m[2] ?? '').trim() : l };
    });
}
