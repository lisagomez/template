/**
 * El asistente de la clinica (chatbot por texto o voz). El orden ES la seguridad:
 *
 *   1. URGENCIA por regla  → respuesta fija (911 o llamar hoy). El LLM nunca decide una urgencia.
 *   2. INYECCION evidente  → respuesta fija, sin gastar tokens.
 *   3. DIAGNOSTICO pedido  → respuesta fija que ofrece agendar una valoracion.
 *   4. ENRUTADOR sin LLM   → mis citas / agendar / cancelar / horario / ubicacion: local o abre la UI.
 *   5. CEREBRO (LLM)       → con la base de conocimiento de SU clinica, sin herramientas; cada frase pasa por
 *                            `revisaFrase` ANTES de mostrarse o decirse.
 *
 * Nada de esto escribe: lo mas que devuelve es una `accion` PROPUESTA que la UI ofrece como boton.
 */
import type { Clinica } from '../clinicas.js';
import type { Intencion, RutaAsistente } from '../eventos.js';
import type { CitaParaAsistente } from './conocimiento.js';
import { respuestaLocal } from './conocimiento.js';
import { pareceInyeccion, pideDiagnostico, respuestaFueraDeDominio, respuestaInyeccion, respuestaNoDiagnostico, revisaFrase, type MotivoBarrera } from './guardas.js';
import { escrituraA, TEXTO_ACCION, TEXTO_NO_PERMITIDA, type AccionPropuesta } from './ordenes.js';
import { MAX_TOKENS_CHATBOT, promptChatbot, versionPrompt, type CanalPrompt } from './prompts.js';
import { detectaUrgencia, detectaUrgenciaEnVoz, normaliza, REGLA_VOZ, type DestinoUrgencia } from './urgencias.js';

export interface MensajeCerebro { rol: 'usuario' | 'asistente'; texto: string }
export type PiezaCerebro = { tipo: 'token'; texto: string } | { tipo: 'uso'; costoUsd: number | null; tokens?: { entrada: number; salida: number } };
export interface PuertoCerebro { piensa(mensajes: readonly MensajeCerebro[], senal: AbortSignal): AsyncIterable<PiezaCerebro> }
export type DecisionEnrutador =
  | { tipo: 'orden'; orden: string; clase: 'control' | 'lectura' | 'escritura'; confianza: number; texto: string }
  | { tipo: 'llm'; motivo: 'conversacion' | 'dudoso'; confianza: number; texto: string }
  | { tipo: 'nada' };
export interface PuertoEnrutador { decide(candidatos: readonly string[]): DecisionEnrutador }

export interface DepsAsistente {
  clinica: Clinica;
  enrutador: PuertoEnrutador;
  /** Un cerebro con este prompt de sistema (el modelo lo fija el routing de quien lo inyecta). */
  cerebroPara: (sistema: string, maxTokens: number) => PuertoCerebro;
  reloj: () => number;
  /** Etiqueta secreta del prompt: si aparece en la salida, el prompt se filtro. */
  canario: string;
  /** Por donde contesta (cambia dos reglas del prompt; el portal usa el prompt firmado sin cambios). */
  canal?: CanalPrompt;
}

export interface EntradaAsistente {
  /** Transcripciones alternativas (voz) o el texto escrito; la preferida primero. */
  candidatos: readonly string[];
  historial: readonly MensajeCerebro[];
  citas: readonly CitaParaAsistente[] | null;
  /** Solo si la persona lo pidio en el chat y dio el consentimiento de salud. */
  padecimiento: string | null;
  senal: AbortSignal;
  alFrase?: (frase: string) => void;
  /** Es voz (lecturas de ASR, que pueden torcer la palabra que decide): las urgencias se leen con `detectaUrgenciaEnVoz`. */
  voz?: boolean;
}

export interface RespuestaAsistente {
  ruta: RutaAsistente;
  intencion: Intencion;
  texto: string;
  accion: AccionPropuesta | null;
  urgencia: { regla: string; destino: DestinoUrgencia } | null;
  barrera: MotivoBarrera | 'inyeccion' | 'diagnostico_pedido' | null;
  costoUsd: number | null;
  tokens: { entrada: number; salida: number } | null;
  latenciaMs: number;
  primeraFraseMs: number | null;
  versionPrompt: string;
}

const INTENCIONES_KB: [Intencion, RegExp][] = [
  ['precios', /\b(precio|precios|cuesta|cuestan|costo|cobran|cuanto sale|cuanto es|tarifa)\b/],
  ['promociones', /\b(promo\w*|descuento\w*|oferta\w*)\b/],
  ['preparacion', /\b(preparo|prepararme|preparacion|ayuno|antes de (ir|la cita)|llevar|traer)\b/],
  ['politicas', /\b(cancelacion|cancelar|pago|pagos|tarjeta|efectivo|menor|menores|tutor|politica)\b/],
  ['horario', /\b(horario|abren|cierran|abierto|sabado|domingo)\b/],
  ['ubicacion', /\b(donde|direccion|llegar|estacionamiento|metro|ubicacion)\b/],
  ['servicios', /\b(servicio\w*|limpieza|brackets|ortodoncia|endodoncia|conductos|implante\w*|resina|valoracion|tratamiento\w*)\b/],
];
const RECHAZO = /\bsolo (te )?(puedo )?ayud\w* con\b|\bno (lo )?se contestar\b|\beso no (lo )?(se|puedo)\b/;

export const intencionDe = (texto: string): Intencion => INTENCIONES_KB.find(([, re]) => re.test(normaliza(texto)))?.[0] ?? 'conversacion';

export function creaAsistente(d: DepsAsistente) {
  const c = d.clinica;
  const fija = (t0: number, ruta: RutaAsistente, intencion: Intencion, texto: string, extra: Partial<RespuestaAsistente> = {}): RespuestaAsistente => ({
    ruta, intencion, texto, accion: null, urgencia: null, barrera: null, costoUsd: null, tokens: null, latenciaMs: Math.round(d.reloj() - t0), primeraFraseMs: Math.round(d.reloj() - t0), versionPrompt: versionPrompt(d.canal ?? 'portal'), ...extra,
  });

  function local(t0: number, orden: string, citas: readonly CitaParaAsistente[] | null): RespuestaAsistente | null {
    if (orden === 'horario' || orden === 'ubicacion') return fija(t0, 'enrutador', orden, respuestaLocal(orden, c));
    if (orden === 'mis-citas') {
      const texto = citas === null ? 'Para ver tus citas, entra con tu cuenta.' : citas.length === 0 ? 'No tienes citas próximas. ¿Quieres agendar una?' : `Tu próxima cita: ${citas[0]!.servicio}, ${citas[0]!.cuando}.`;
      return fija(t0, 'enrutador', 'mis_citas', texto, { accion: { tipo: 'abrir_mis_citas' } });
    }
    const mapa: Record<string, AccionPropuesta> = { agendar: { tipo: 'abrir_agenda' }, cancelar: { tipo: 'abrir_cancelacion' }, reprogramar: { tipo: 'abrir_reprogramacion' } };
    const accion = mapa[orden];
    return accion ? fija(t0, 'enrutador', orden as Intencion, TEXTO_ACCION[accion.tipo], { accion }) : null;
  }

  /** Con voz, las urgencias se leen como una nota de voz (corrección y U7). U7 avisa PRIMERO y deja contestar al asistente. */
  async function responde(e: EntradaAsistente): Promise<RespuestaAsistente> {
    const u = e.voz ? detectaUrgenciaEnVoz(e.candidatos, c) : null;
    if (!u) return respondeTurno(e);
    const urgencia = { regla: u.regla.id, destino: u.regla.destino };
    if (u.regla.id !== REGLA_VOZ.id) return fija(d.reloj(), 'urgencia', 'urgencia', u.respuesta, { urgencia });
    e.alFrase?.(u.respuesta);
    const r = await respondeTurno(e);
    return { ...r, texto: `${u.respuesta} ${r.texto}`, urgencia };
  }

  async function respondeTurno(e: EntradaAsistente): Promise<RespuestaAsistente> {
    const t0 = d.reloj();
    const texto = (e.candidatos[0] ?? '').trim();
    if (!texto) return fija(t0, 'barrera', 'conversacion', 'No te escuché bien. ¿Me lo repites?');
    const urg = e.candidatos.map((x) => detectaUrgencia(x, c)).find((u) => u !== null);
    if (urg) return fija(t0, 'urgencia', 'urgencia', urg.respuesta, { urgencia: { regla: urg.regla.id, destino: urg.regla.destino } });
    if (pareceInyeccion(texto)) return fija(t0, 'barrera', 'inyeccion', respuestaInyeccion(c), { barrera: 'inyeccion' });
    if (pideDiagnostico(texto)) return fija(t0, 'barrera', 'diagnostico', respuestaNoDiagnostico(c), { barrera: 'diagnostico_pedido', accion: { tipo: 'abrir_agenda', servicio: 'valoracion' } });
    const decision = d.enrutador.decide(e.candidatos);
    if (decision.tipo === 'orden' && decision.clase === 'escritura') {
      const w = escrituraA(decision.texto);
      return fija(t0, 'enrutador', w.intencion, w.accion ? TEXTO_ACCION[w.accion.tipo] : TEXTO_NO_PERMITIDA, { accion: w.accion });
    }
    if (decision.tipo === 'orden') {
      const r = local(t0, decision.orden, e.citas);
      if (r) return r;
    }
    if (decision.tipo === 'nada') return fija(t0, 'barrera', 'conversacion', 'No te entendí. ¿Me lo dices de otra forma?');
    return conCerebro(t0, texto, e);
  }

  async function conCerebro(t0: number, texto: string, e: EntradaAsistente): Promise<RespuestaAsistente> {
    const cerebro = d.cerebroPara(promptChatbot(c, e.citas, d.canario, e.padecimiento, d.canal ?? 'portal'), MAX_TOKENS_CHATBOT);
    const mensajes = [...e.historial.slice(-6), { rol: 'usuario' as const, texto }];
    let r: LecturaCerebro;
    try {
      r = await leeCerebro(cerebro, mensajes, e, (f) => revisaFrase(f, c, d.canario), () => d.reloj() - t0);
    } catch (err) {
      if (e.senal.aborted) throw err;
      return fija(t0, 'barrera', 'error', `Ahora no puedo contestar eso. Llama a ${c.nombre} al ${c.telefono}.`);
    }
    const base = { costoUsd: r.costo, tokens: r.tokens, primeraFraseMs: r.primera === null ? null : Math.round(r.primera) };
    if (r.barrera) {
      const fallback = r.barrera === 'diagnostico' ? respuestaNoDiagnostico(c) : r.barrera === 'precio_inventado' ? `Ese precio te lo confirma la clínica al ${c.telefono}; los precios de lista están en «Servicios».` : respuestaInyeccion(c);
      e.alFrase?.(fallback);
      const intencion: Intencion = r.barrera === 'filtra_prompt' ? 'inyeccion' : r.barrera === 'diagnostico' ? 'diagnostico' : 'precios';
      return { ...fija(t0, 'barrera', intencion, [...r.salida, fallback].join(' ')), barrera: r.barrera, ...base, primeraFraseMs: base.primeraFraseMs ?? Math.round(d.reloj() - t0) };
    }
    const final = r.salida.join(' ') || respuestaFueraDeDominio(c);
    const intencion: Intencion = RECHAZO.test(normaliza(final)) ? 'fuera_de_dominio' : intencionDe(texto);
    return { ...fija(t0, 'cerebro', intencion, final), ...base };
  }

  return { responde };
}

interface LecturaCerebro { salida: string[]; barrera: MotivoBarrera | null; costo: number | null; tokens: { entrada: number; salida: number } | null; primera: number | null }

/** Lee el flujo del cerebro frase por frase; una frase que no pasa la revision corta TODO lo que falta. */
async function leeCerebro(cerebro: PuertoCerebro, mensajes: readonly MensajeCerebro[], e: EntradaAsistente, revisa: (f: string) => MotivoBarrera | null, transcurrido: () => number): Promise<LecturaCerebro> {
  const r: LecturaCerebro = { salida: [], barrera: null, costo: null, tokens: null, primera: null };
  const corte = new AbortController();
  e.senal.addEventListener('abort', () => corte.abort(), { once: true });
  const emite = (f: string) => {
    if (r.barrera) return;
    r.barrera = revisa(f);
    if (r.barrera) return corte.abort();
    r.primera ??= transcurrido();
    r.salida.push(f);
    e.alFrase?.(f);
  };
  let pendiente = '';
  try {
    for await (const p of cerebro.piensa(mensajes, corte.signal)) {
      if (p.tipo === 'uso') {
        r.costo = p.costoUsd;
        r.tokens = p.tokens ? { entrada: p.tokens.entrada, salida: p.tokens.salida } : null;
        continue;
      }
      const cortadas = cortaFrases(pendiente + p.texto);
      pendiente = cortadas.resto;
      cortadas.frases.forEach(emite);
      if (r.barrera) break;
    }
  } catch (err) {
    if (!r.barrera) throw err;
  }
  if (pendiente.trim()) emite(pendiente.trim());
  return r;
}

const ABREVIATURA = /\b(col|av|ave|pue|dr|dra|no|num|sr|sra|lic|ing|tel)\.$/i;

/** Frases completas del texto acumulado (fin en . ! ? seguido de espacio, sin partir «Col.» ni «Av.»). */
export function cortaFrases(texto: string): { frases: string[]; resto: string } {
  const frases: string[] = [];
  const re = /[.!?…]+(?=\s)/g;
  let inicio = 0;
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    const fin = m.index + m[0].length;
    const candidata = texto.slice(inicio, fin).trim();
    if (ABREVIATURA.test(candidata)) continue;
    if (candidata) frases.push(candidata);
    inicio = fin;
  }
  return { frases, resto: texto.slice(inicio) };
}
