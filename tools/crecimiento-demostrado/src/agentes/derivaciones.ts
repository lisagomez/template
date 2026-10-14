/**
 * Cómo un proponente honesto arma PLANES y DERIVACIONES a partir de una intención y de los hechos
 * que el motor devolvió. Lo usan el simulado (tal cual) y el adversarial (para torcerlo). Ningún
 * valor de aquí se cree: el kernel recalcula cada cita.
 */
import type { Hecho, Plan } from '../motor/plan.js';
import type { Clase, Termino } from '../motor/terminos.js';
import type { Derivacion, Paso } from '../kernel/derivacion.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import type { Gamma } from '../datos/gamma.js';
import { huellaDeEspecificacion } from '../ontologia/especificacion.js';
import type { Intencion } from './intencion.js';

export const CLASES_DEL_PUENTE: readonly Clase[] = ['N', 'K_exp', 'K_con', 'K_flat', 'L', 'Z', 'A'];

export function planDe(i: Intencion, e: Especificacion): Plan {
  const t = { metrica: i.metrica, desde: i.desde, hasta: i.hasta };
  const seg = i.segmento ? { segmento: i.segmento } : {};
  const alcance = e.pyme.modelo === 'b2b' ? 'identificados' as const : 'todos' as const;
  const pregunta = i.intervencion ?? i.tipo;
  switch (i.tipo) {
    case 'origen': case 'proporcion_expansion': case 'causal': return { pregunta, consultas: [{ tipo: 'puente', ...t, ...seg }] };
    case 'perdidos': return { pregunta, consultas: [{ tipo: 'puente', ...t }, { tipo: 'top', clase: 'L', ...t, k: 5 }] };
    case 'nuevos': return { pregunta, consultas: [{ tipo: 'puente', ...t }, { tipo: 'top', clase: 'N', ...t, k: 5 }] };
    case 'ruido_frecuencia': return { pregunta, consultas: [{ tipo: 'prueba', diseno: 'pareada', variable: 'frecuencia', desde: i.desde, hasta: i.hasta, ...seg }] };
    case 'ruido_ticket': return { pregunta, consultas: [{ tipo: 'prueba', diseno: 'dos_muestras', variable: 'ticket', desde: i.desde, hasta: i.hasta }] };
    case 'ticket': return { pregunta, consultas: [{ tipo: 'ticket', clase: alcance === 'identificados' ? 'U' : 'T', ...t }] };
    case 'palancas': return { pregunta, consultas: [{ tipo: 'nft', ...t, alcance }] };
  }
}

/** Los hechos que cumplen un predicado sobre su término. */
export const busca = (hechos: readonly Hecho[], p: (t: Termino) => boolean): Hecho | undefined => hechos.find((h) => p(h.termino));
const deClase = (m: Termino['m'], clase: Clase, en?: 'desde' | 'hasta') => (t: Termino) => t.m === m && 'clase' in t && t.clase === clase && !('cliente' in t && t.cliente) && (en === undefined || ('en' in t && t.en === en));

export class Constructor {
  readonly pasos: Paso[] = [];
  private readonly citados = new Set<string>();
  private n = 0;
  cita(h: Hecho | undefined): string | null {
    if (!h) return null;
    const id = `c${++this.n}`;
    this.pasos.push({ regla: 'cita', id, termino: h.termino, valor: h.valor as never });
    for (const sa of h.exige) this.citados.add(sa);
    return id;
  }
  paso(p: Paso): string { this.pasos.push(p); return p.id; }
  supuestos(): string[] { return [...this.citados].sort(); }
  derivacion(g: Gamma, e: Especificacion, afirmacion: string, nivel: Derivacion['nivel']): Derivacion {
    return { afirmacion: { paso: afirmacion }, nivel, gamma: g.hash, especificacion: huellaDeEspecificacion(e), supuestos: this.supuestos(), pasos: this.pasos };
  }
}

/** El puente: cita cada clase, parte T y suma; si las hipótesis valen, la forma clásica. */
export function derivaPuente(k: Constructor, i: Intencion, hechos: readonly Hecho[]): { afirmacion: string; clasico: boolean } {
  for (const c of [...CLASES_DEL_PUENTE, 'T' as const]) { k.cita(busca(hechos, deClase('dR', c))); k.cita(busca(hechos, deClase('n', c))); }
  k.cita(busca(hechos, deClase('R', 'N', 'hasta')));
  k.cita(busca(hechos, deClase('R', 'L', 'desde')));
  // El nivel de los dos periodos: lo que la pantalla muestra también tiene que estar certificado.
  k.cita(busca(hechos, deClase('R', 'T', 'desde')));
  k.cita(busca(hechos, deClase('R', 'T', 'hasta')));
  const hipotesis = [busca(hechos, deClase('R', 'N', 'desde')), busca(hechos, deClase('R', 'L', 'hasta')), busca(hechos, deClase('dR', 'Z'))];
  const ids = hipotesis.map((h) => k.cita(h)!);
  const p = k.paso({ regla: 'particion', id: 'p1', metrica: i.metrica, desde: i.desde, hasta: i.hasta, universo: 'T', clases: [...CLASES_DEL_PUENTE], ...(i.segmento ? { segmento: i.segmento } : {}) });
  const s = k.paso({ regla: 'suma_particion', id: 's1', particion: p });
  const clasico = hipotesis.every((h) => h?.valor.tipo === 'centavos' && h.valor.v === 0);
  if (!clasico) return { afirmacion: s, clasico };
  return { afirmacion: k.paso({ regla: 'teorema', id: 't1', nombre: 'puente_clasico', usa: [p, ...ids] }), clasico };
}

export const EXPERIMENTO_POR_OMISION = {
  diseno: 'escalonado' as const,
  grupoControl: 'un grupo de clientes (o de días de la semana) elegido al azar que no recibe el cambio',
  duracionSemanas: 8,
  criterio: 'margen bruto por cliente activo, tratamiento contra control, con la misma ventana',
};

export { deClase };
