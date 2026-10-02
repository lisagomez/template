/**
 * El proponente y el narrador SIMULADOS: deterministas, sin modelo, honestos. Proponen el plan y
 * la derivación que corresponden a la intención, atienden la retroalimentación del kernel (si la
 * afirmación resultó falsa, afirman lo contrario) y narran SOLO lo certificado.
 */
import type { Hecho, Plan } from '../motor/plan.js';
import type { Derivacion } from '../kernel/derivacion.js';
import { busca, Constructor, deClase, derivaPuente, EXPERIMENTO_POR_OMISION, planDe } from './derivaciones.js';
import { interpreta, type Intencion } from './intencion.js';
import { narraClase, narraNoDemostrable, narraPalancas, narraPrueba, narraProporcion, narraPuente, narraTicket } from './narrativas.js';
import type { Contexto, Narrador, ParaNarrar, Proponente, Propuesta, Retroalimentacion } from './tipos.js';

const fueFalsa = (r: Retroalimentacion | null) => r?.veredicto.estado === 'rechazada' && 'motivo' in r.veredicto && r.veredicto.motivo === 'afirmacion_falsa';

/** La derivación honesta para una intención y sus hechos. */
export function derivacionHonesta(c: Contexto, i: Intencion, hechos: readonly Hecho[], retro: Retroalimentacion | null): Derivacion {
  const k = new Constructor();
  const der = (afirmacion: string, nivel: Derivacion['nivel'] = 'descriptivo') => k.derivacion(c.gamma, c.especificacion, afirmacion, nivel);
  const op = fueFalsa(retro) ? '<=' as const : '>=' as const;
  switch (i.tipo) {
    case 'origen': return der(derivaPuente(k, i, hechos).afirmacion);
    case 'proporcion_expansion': {
      const [num, den] = [k.cita(busca(hechos, deClase('dR', 'K_exp')))!, k.cita(busca(hechos, deClase('dR', 'T')))!];
      return der(k.paso({ regla: 'razon', id: 'r1', num, den, op, umbralPorMil: i.umbralPorMil ?? 700 }));
    }
    case 'perdidos': case 'nuevos': {
      const clase = i.tipo === 'perdidos' ? 'L' : 'N';
      const afirmado = k.cita(busca(hechos, deClase('dR', clase)))!;
      k.cita(busca(hechos, deClase('n', clase)));
      k.cita(busca(hechos, (t) => t.m === 'top'));
      return der(afirmado);
    }
    case 'ruido_frecuencia': case 'ruido_ticket': {
      const cita = k.cita(busca(hechos, (t) => t.m === 'prueba'))!;
      return der(k.paso({ regla: 'prueba', id: 'pr1', cita }), 'inferencial');
    }
    case 'ticket': {
      const de = (en: 'desde' | 'hasta') => k.cita(busca(hechos, (t) => t.m === 'ticket' && t.en === en))!;
      const [antes, despues] = [de('desde'), de('hasta')];
      return der(k.paso({ regla: 'cambio_relativo', id: 'cr1', antes, despues, op, umbralPorMil: i.umbralPorMil ?? 0 }));
    }
    case 'palancas': {
      const usa = hechos.filter((h) => h.termino.m === 'nft').map((h) => k.cita(h)!);
      k.cita(busca(hechos, (t) => t.m === 'dR'));
      return der(k.paso({ regla: 'teorema', id: 't1', nombre: 'nft_lmdi', usa }));
    }
    case 'causal': {
      k.cita(busca(hechos, deClase('dR', 'T')));
      return der(k.paso({ regla: 'hipotesis', id: 'h1', intervencion: i.intervencion ?? c.pregunta, metrica: i.metrica, sentido: 'sube', experimento: EXPERIMENTO_POR_OMISION }), 'causal');
    }
  }
}

export class ProponenteSimulado implements Proponente {
  readonly nombre = 'proponente-simulado@1.0.0';
  readonly permisos = ['leer_gamma', 'proponer_plan', 'proponer_derivacion'] as const;
  async planea(c: Contexto): Promise<Propuesta<unknown>> {
    const i = interpreta(c.pregunta, c.especificacion);
    return i ? { tipo: 'propuesta', valor: planDe(i, c.especificacion) } : { tipo: 'sin_plan', motivo: 'ninguna regla del estructurador reconoce la pregunta' };
  }
  async deriva(c: Contexto, _plan: Plan, hechos: readonly Hecho[], retro: Retroalimentacion | null): Promise<Propuesta<unknown>> {
    const i = interpreta(c.pregunta, c.especificacion);
    return i ? { tipo: 'propuesta', valor: derivacionHonesta(c, i, hechos, retro) } : { tipo: 'sin_plan', motivo: 'sin intención' };
  }
}

export class NarradorSimulado implements Narrador {
  readonly nombre = 'narrador-simulado@1.0.0';
  readonly permisos = ['narrar'] as const;
  async narra(p: ParaNarrar): Promise<string> {
    const v = p.veredicto;
    if (v.estado !== 'aceptada') return narraNoDemostrable(v, p.especificacion);
    const c = v.certificado;
    if (c.hechos.some((h) => h.termino.m === 'prueba')) return narraPrueba(c, p.especificacion);
    if (c.hechos.some((h) => h.termino.m === 'nft')) return narraPalancas(c);
    if (c.afirmacion.regla === 'razon') return narraProporcion(c, p.especificacion);
    if (c.afirmacion.regla === 'cambio_relativo') return narraTicket(c);
    if (c.afirmacion.regla === 'cita') return narraClase(c);
    return narraPuente(c);
  }
}
