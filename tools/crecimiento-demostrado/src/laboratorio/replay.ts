/**
 * REPLAY: las huellas de una corrida completa (Γ, spec, plan, hechos y certificado de cada
 * respuesta). Dos procesos distintos tienen que producir exactamente las mismas: mismo snapshot +
 * misma spec ⇒ los mismos hechos verificados, aunque la redacción pudiera variar.
 */
import type { ModuloXml } from '../datos/cfdi.js';
import { creaOrquestador } from '../agentes/orquestador.js';
import { NarradorSimulado, ProponenteSimulado } from '../agentes/simulado.js';
import { huellaDe } from '../comun/canonico.js';
import { huellaDeEspecificacion } from '../ontologia/especificacion.js';
import type { IdDePyme } from '../sinteticos/pymes.js';
import { construyeDe, preparaPyme } from './preparacion.js';

export const PREGUNTAS_DEL_REPLAY: readonly { readonly pyme: IdDePyme; readonly pregunta: string }[] = [
  { pyme: 'distribuidora', pregunta: '¿De dónde salió el crecimiento del trimestre?' },
  { pyme: 'distribuidora', pregunta: '¿El 70 % del crecimiento viene de la expansión?' },
  { pyme: 'distribuidora', pregunta: '¿Cómo se repartió entre clientes, frecuencia y ticket? palancas' },
  { pyme: 'distribuidora', pregunta: '¿La caída de frecuencia es real o ruido?' },
  { pyme: 'tienda', pregunta: '¿De dónde salió el crecimiento del trimestre?' },
  { pyme: 'tienda', pregunta: '¿El ticket subió de verdad o es ruido?' },
];

export interface HuellaDeRespuesta { readonly pyme: string; readonly pregunta: string; readonly estado: string; readonly plan: string | null; readonly hechos: string; readonly certificado: string | null }
export interface HuellasDeCorrida { readonly gammas: Readonly<Record<string, string>>; readonly especificaciones: Readonly<Record<string, string>>; readonly respuestas: readonly HuellaDeRespuesta[] }

/** Construye Γ desde las fuentes (sin caché de Γ) y responde las preguntas del replay. */
export async function huellasDeCorrida(xml: ModuloXml): Promise<HuellasDeCorrida> {
  const gammas: Record<string, string> = {};
  const especificaciones: Record<string, string> = {};
  const respuestas: HuellaDeRespuesta[] = [];
  const orquestador = creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() });
  for (const id of ['distribuidora', 'tienda'] as const) {
    const c = construyeDe(xml, id);
    if (!c.ok) throw new Error(`${id} no sella`);
    const e = preparaPyme(xml, id).pyme.especificacion;
    gammas[id] = c.gamma.hash;
    especificaciones[id] = huellaDeEspecificacion(e);
    for (const q of PREGUNTAS_DEL_REPLAY.filter((x) => x.pyme === id)) {
      const r = await orquestador.responde(q.pregunta, c.gamma, e);
      const certificado = r.veredicto?.estado === 'aceptada' ? r.veredicto.certificado.hash : null;
      respuestas.push({ pyme: id, pregunta: q.pregunta, estado: r.estado, plan: r.planHuella, hechos: huellaDe('hechos', r.hechos.map((h) => h.id)), certificado });
    }
  }
  return { gammas, especificaciones, respuestas };
}
