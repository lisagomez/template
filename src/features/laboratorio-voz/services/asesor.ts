/**
 * Puente al cerebro de asesoria de ventas (`tools/asesor-ventas`, sin LLM, cero deps). Corre
 * en el navegador: la transcripcion no sale de la pantalla de quien prueba. Entra lo que da la
 * transcripcion por turnos mas «de que lado esta cada voz»; sale el analisis con evidencia.
 */
import {
  analizarReunion,
  ETIQUETA_DIMENSION,
  participantesDesdeHablantes,
  playbookPorTipo,
  transcripcionDesdeTurnos,
  type AnalisisReunion,
  type Reunion,
  type TipoReunion,
} from '../../../../tools/asesor-ventas/dist/index.js';
import type { Segmento } from '../types/index.ts';

export type { AnalisisReunion, TipoReunion };
export { ETIQUETA_DIMENSION };

export type Lado = 'interno' | 'cliente';

export const TIPOS_REUNION: Array<{ valor: TipoReunion; nombre: string }> = [
  { valor: 'discovery', nombre: 'Descubrimiento (primera reunion)' },
  { valor: 'demo', nombre: 'Demostracion' },
  { valor: 'negociacion', nombre: 'Negociacion' },
  { valor: 'revision_tecnica', nombre: 'Revision tecnica' },
  { valor: 'cierre', nombre: 'Cierre' },
];

export const hablantesDe = (segmentos: readonly Segmento[]): string[] => [...new Set(segmentos.map((s) => s.hablante))];

/**
 * El motor cachea por id de reunion (mismo input → mismo output, sin recalcular): el id tiene
 * que cambiar con el CONTENIDO, o un segundo analisis devolveria el primero. FNV-1a corto
 * sobre turnos, lados y tipo.
 */
export function idDeAnalisis(segmentos: readonly Segmento[], lados: Record<string, Lado>, tipoReunion: TipoReunion): string {
  const texto = JSON.stringify([segmentos.map((s) => [s.inicioMs, s.finMs, s.hablante, s.texto]), lados, tipoReunion]);
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `lab-${h.toString(16).padStart(8, '0')}`;
}

export function analizaTurnos(segmentos: readonly Segmento[], lados: Record<string, Lado>, tipoReunion: TipoReunion, motor = 'parakeet'): AnalisisReunion {
  const hablantes = hablantesDe(segmentos);
  const participantes = participantesDesdeHablantes(
    hablantes,
    Object.fromEntries(hablantes.map((h) => [h, { rol: lados[h] === 'interno' ? 'Asesor' : 'Cliente', lado: lados[h] ?? 'cliente' }])),
  );
  const asesor = participantes.find((p) => p.lado === 'interno')?.nombre ?? hablantes[0] ?? 'Asesor';
  const reunion: Reunion = { id: idDeAnalisis(segmentos, lados, tipoReunion), titulo: 'Reunion de prueba', cuenta: 'Prueba', tipoReunion, participantes, asesor, fecha: new Date().toISOString() };
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

/** El acta en Markdown: turnos, hallazgos con cita, puntaje con desglose, huecos, acciones, riesgos, personas. */
export function actaMarkdown(segmentos: readonly Segmento[], analisis: AnalisisReunion, tipoReunion: TipoReunion, ahora = new Date()): string {
  const t = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const sc = analisis.score;
  return [
    `# Acta de reunión (${TIPOS_REUNION.find((x) => x.valor === tipoReunion)?.nombre ?? tipoReunion})`,
    ``,
    `> Confidencial: contiene palabras de un tercero. Generada localmente el ${ahora.toLocaleString('es-MX')}; análisis por reglas, sin modelo de lenguaje. Cada hallazgo cita su frase; el puntaje no evalúa personas.`,
    ``,
    `## Puntaje de descubrimiento: ${sc.total} / 100`,
    ``,
    `| Dimensión | Peso | Estado |`,
    `|---|---|---|`,
    ...sc.dimensiones.map((d) => `| ${ETIQUETA_DIMENSION[d.dimension]} | ${d.peso} | ${d.estado} |`),
    ``,
    `Habla del asesor: ${Math.round(sc.conducta.ratioHablaInterno * 100)} % · preguntas abiertas: ${sc.conducta.preguntasAbiertas} · turnos inaudibles: ${sc.conducta.segmentosInaudibles}`,
    ``,
    ...(sc.huecos.length > 0 ? [`## Huecos y la pregunta que faltó`, ``, ...sc.huecos.map((h) => `- **${ETIQUETA_DIMENSION[h.dimension]}**: ${h.motivo} → «${h.preguntaSugerida}»`), ``] : []),
    `## Hallazgos (${analisis.insights.length})`,
    ``,
    ...analisis.insights.map((i) => `- **${i.categoria}** · ${i.texto}  \n  Evidencia: «${i.evidencia[0]?.cita ?? ''}» (${Math.round(i.evidencia[0]?.inicioS ?? 0)} s)`),
    ``,
    `## Acciones (${analisis.acciones.length})`,
    ``,
    ...(analisis.acciones.length > 0 ? analisis.acciones.map((a) => `- [ ] ${a.tarea}${a.responsable ? ` — ${a.responsable}` : ''}${a.fechaTexto ? ` (${a.fechaTexto})` : ''}`) : ['- (ninguna detectada)']),
    ``,
    `## Riesgos (${analisis.riesgos.length})`,
    ``,
    ...(analisis.riesgos.length > 0 ? analisis.riesgos.map((r) => `- **${r.severidad}** · ${r.descripcion} → ${r.mitigacion}`) : ['- (ninguno)']),
    ``,
    `## Personas`,
    ``,
    ...analisis.stakeholders.map((p) => `- ${p.nombre} — ${p.rol} · ${p.influencia}${p.presente ? '' : ' (ausente)'}`),
    ``,
    `## Transcripción por turnos`,
    ``,
    ...segmentos.map((s) => `- [${t(s.inicioMs)}] **${s.hablante}:** ${s.texto || '(inaudible)'}`),
    ``,
  ].join('\n');
}
