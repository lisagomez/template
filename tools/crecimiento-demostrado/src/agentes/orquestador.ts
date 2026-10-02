/**
 * El ORQUESTADOR: delega en especialidades (planear, verificar, narrar) y no hace el trabajo de
 * ninguna. El lazo: propuesta → kernel → si rechaza, retroalimentación con el motivo → otro
 * intento, con tope. Los permisos de cada hijo son un subconjunto de los suyos, y ninguno puede
 * EJECUTAR: lo más que sale es una propuesta con la forma de `sis_propuesta`, para un humano.
 */
import type { Gamma } from '../datos/gamma.js';
import { verifica } from '../kernel/kernel.js';
import type { Veredicto } from '../kernel/veredicto.js';
import { ejecutaPlan, leePlan, type Hecho, type Plan } from '../motor/plan.js';
import { permitidosDe, permitidosDeVeredicto, verificaNarracion } from '../narracion/inclusion.js';
import { huellaDeEspecificacion, type Especificacion } from '../ontologia/especificacion.js';
import { PERMISOS, type Contexto, type Narrador, type Permiso, type Proponente, type PropuestaDeAccion, type Retroalimentacion } from './tipos.js';

export type EstadoDeRespuesta = 'demostrada' | 'evidencia_insuficiente' | 'hipotesis' | 'rechazada' | 'requiere_entrada' | 'sin_plan' | 'no_medido' | 'narracion_bloqueada';

export interface Intento { readonly n: number; readonly etapa: 'plan' | 'derivacion' | 'narracion'; readonly resultado: string; readonly detalle: string }

export interface Respuesta {
  readonly pregunta: string;
  readonly pyme: string;
  readonly estado: EstadoDeRespuesta;
  readonly texto: string | null;
  readonly bloqueos: readonly { readonly crudo: string; readonly motivo: string }[];
  readonly veredicto: Veredicto | null;
  readonly derivacion: unknown;
  readonly plan: Plan | null;
  readonly planHuella: string | null;
  readonly hechos: readonly Hecho[];
  readonly intentos: readonly Intento[];
  readonly propuesta: PropuestaDeAccion | null;
  readonly gamma: string;
  readonly especificacion: string;
  readonly agentes: { readonly proponente: string; readonly narrador: string };
}

export interface OpcionesDelOrquestador {
  readonly proponente: Proponente;
  readonly narrador: Narrador;
  readonly intentos?: number;
  readonly permisos?: readonly Permiso[];
}

const ESTADO: Readonly<Record<Veredicto['estado'], EstadoDeRespuesta>> = {
  aceptada: 'demostrada', rechazada: 'rechazada', requiere_entrada: 'requiere_entrada', evidencia_insuficiente: 'evidencia_insuficiente', hipotesis: 'hipotesis',
};

function compruebaPermisos(o: OpcionesDelOrquestador): readonly Permiso[] {
  const padre = o.permisos ?? PERMISOS;
  for (const hijo of [o.proponente, o.narrador]) {
    const sobra = hijo.permisos.filter((p) => !padre.includes(p));
    if (sobra.length) throw new Error(`${hijo.nombre} pide ${sobra.join(', ')}: un hijo no puede tener permisos que el padre no tiene`);
  }
  return padre;
}

function propuestaDe(v: Veredicto, g: Gamma, modelo: string, pregunta: string): PropuestaDeAccion | null {
  const base = { origen: 'crecimiento-demostrado' as const, modelo, version: '0.1.0', estado: 'propuesta' as const, requiere: 'principal humano' as const };
  if (v.estado === 'hipotesis') return { ...base, accion: `Correr el experimento diseñado para «${pregunta}» antes de cambiar nada en el negocio`, evidencia: { veredicto: v.estado, certificado: null, gamma: g.hash } };
  if (v.estado === 'aceptada' && v.certificado.hechos.some((h) => 'clase' in h.termino && h.termino.clase === 'L' && h.termino.m === 'top')) {
    return { ...base, accion: 'Contactar a los clientes perdidos para entender por qué dejaron de comprar', evidencia: { veredicto: v.estado, certificado: v.certificado.hash, gamma: g.hash } };
  }
  return null;
}

/** Narra lo verificado; si la inclusión de números bloquea, un segundo intento con el motivo, y si no, sin texto. */
async function narraVerificado(narrador: Narrador, v: Veredicto, c: Contexto, intentos: Intento[]) {
  const permitidos = v.estado === 'aceptada' ? permitidosDe(v.certificado, c.especificacion) : permitidosDeVeredicto(v, c.especificacion);
  let bloqueoAnterior: { crudo: string; motivo: string }[] | null = null;
  for (let n = 1; n <= 2; n++) {
    const texto = await narrador.narra({ pregunta: c.pregunta, veredicto: v, especificacion: c.especificacion, bloqueoAnterior });
    const r = verificaNarracion(texto, permitidos, { causalPermitido: v.estado === 'hipotesis' });
    if (r.ok) return { texto, bloqueos: [] };
    bloqueoAnterior = [...r.bloqueos];
    intentos.push({ n, etapa: 'narracion', resultado: 'bloqueada', detalle: r.bloqueos.map((b) => `«${b.crudo}»: ${b.motivo}`).join('; ') });
  }
  return { texto: null, bloqueos: bloqueoAnterior ?? [] };
}

export function creaOrquestador(o: OpcionesDelOrquestador) {
  const permisos = compruebaPermisos(o);
  const tope = o.intentos ?? 3;

  async function responde(pregunta: string, gamma: Gamma, especificacion: Especificacion): Promise<Respuesta> {
    const c: Contexto = { gamma, especificacion, pregunta };
    const intentos: Intento[] = [];
    const base = { pregunta, pyme: especificacion.pyme.id, gamma: gamma.hash, especificacion: huellaDeEspecificacion(especificacion), agentes: { proponente: o.proponente.nombre, narrador: o.narrador.nombre }, intentos };
    const vacia = (estado: EstadoDeRespuesta, detalle: string): Respuesta => ({ ...base, estado, texto: null, bloqueos: [{ crudo: '', motivo: detalle }], veredicto: null, derivacion: null, plan: null, planHuella: null, hechos: [], propuesta: null });
    let retro: Retroalimentacion | null = null;
    let ultimo: { v: Veredicto; derivacion: unknown; plan: Plan; huella: string; hechos: readonly Hecho[] } | null = null;
    for (let n = 1; n <= tope; n++) {
      const pp = await o.proponente.planea(c, retro);
      if (pp.tipo !== 'propuesta') return vacia(pp.tipo, pp.motivo);
      const lp = leePlan(pp.valor);
      if (!lp.ok) {
        intentos.push({ n, etapa: 'plan', resultado: lp.motivo, detalle: lp.detalle });
        retro = { intento: n, veredicto: { estado: 'plan_rechazado', motivo: lp.motivo, detalle: lp.detalle } };
        continue;
      }
      const ej = ejecutaPlan(gamma, especificacion, lp.plan);
      const pd = await o.proponente.deriva(c, lp.plan, ej.hechos, retro);
      if (pd.tipo !== 'propuesta') return vacia(pd.tipo, pd.motivo);
      const v = verifica(pd.valor, gamma, especificacion);
      intentos.push({ n, etapa: 'derivacion', resultado: v.estado, detalle: v.estado === 'aceptada' ? v.certificado.hash : v.detalle });
      ultimo = { v, derivacion: pd.valor, plan: lp.plan, huella: ej.huella, hechos: ej.hechos };
      if (v.estado === 'rechazada' || v.estado === 'requiere_entrada') { retro = { intento: n, veredicto: v }; continue; }
      const { texto, bloqueos } = await narraVerificado(o.narrador, v, c, intentos);
      const propuesta = permisos.includes('proponer_accion') ? propuestaDe(v, gamma, o.proponente.nombre, pregunta) : null;
      return { ...base, estado: texto === null ? 'narracion_bloqueada' : ESTADO[v.estado], texto, bloqueos, veredicto: v, derivacion: pd.valor, plan: lp.plan, planHuella: ej.huella, hechos: ej.hechos, propuesta };
    }
    if (!ultimo) return vacia('rechazada', `el plan se rechazó ${tope} veces: ${intentos.at(-1)?.detalle ?? ''}`);
    return { ...base, estado: ESTADO[ultimo.v.estado], texto: null, bloqueos: [], veredicto: ultimo.v, derivacion: ultimo.derivacion, plan: ultimo.plan, planHuella: ultimo.huella, hechos: ultimo.hechos, propuesta: null };
  }

  return { responde, permisos };
}
