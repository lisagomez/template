/**
 * La narración RESTRINGIDA: números(texto) ⊆ hechos verificados. Cada cifra del texto tiene que
 * coincidir, a la precisión con que se escribió, con un valor que el kernel certificó; si una sola
 * no coincide, la respuesta se bloquea. Además:
 *  - el SENTIDO: «creció $X» sobre un valor negativo es una cifra verdadera con un verbo falso;
 *  - el LENGUAJE CAUSAL («porque», «gracias a», «hará que») sin una hipótesis detrás es una
 *    afirmación causal disfrazada de descripción, y se bloquea.
 * Es una comprobación sobre magnitudes, verbos de dirección y conectores, no sobre el significado
 * entero del texto: lo que no ve, lo declara el README.
 */
import type { Certificado, Veredicto } from '../kernel/veredicto.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import { numerosDe, type Numero } from './numeros.js';

export interface ValorVerificado {
  readonly etiqueta: string;
  readonly clase: 'pesos' | 'cantidad' | 'proporcion';
  readonly num: bigint;
  readonly den: bigint;
}

export type Inclusion =
  | { ok: true; usados: readonly { readonly crudo: string; readonly etiqueta: string }[] }
  | { ok: false; bloqueos: readonly { readonly crudo: string; readonly motivo: string }[] };

// Fronteras de palabra Unicode: `\b` de JavaScript no ve la frontera después de una vocal acentuada,
// y «causó» o «creció» se escapaban. Medido con la trampa `sentido_falso`.
const L = '[\\p{L}\\p{N}_]';
const palabra = (alternativas: string, cola = '') => new RegExp(`(?<!${L})(${alternativas})(?!${L})${cola}`, 'iu');
const CAUSAL = palabra('porque|debido a|gracias a|por culpa de|a ra[ií]z de|provoc\\p{L}*|caus[óoa]\\p{L}*|hizo que|har[áa] que|aumentar[áa]n?|disminuir[áa]n?|subir[áa]n?|bajar[áa]n?');
const SUBE = palabra('creci[óo]|crecieron|aument[óo]|aumentaron|subi[óo]|subieron|gan[óo]', '\\s*(?:en\\s+|un\\s+|unos\\s+)?$');
const BAJA = palabra('cay[óo]|cayeron|baj[óo]|bajaron|disminuy[óo]|disminuyeron|rest[óo]|restaron|perdi[óo]|se contrajo', '\\s*(?:en\\s+|un\\s+|unos\\s+)?$');

const abs = (x: bigint) => (x < BigInt(0) ? -x : x);

/** ¿|escrito| redondea a |real| con la precisión escrita? Todo en racionales exactos. */
function coincide(n: Numero, v: ValorVerificado): boolean {
  const escala = n.clase === 'porcentaje' ? BigInt(100) : BigInt(1);
  const compatibles = n.clase === 'pesos' ? v.clase === 'pesos'
    : n.clase === 'porcentaje' || n.clase === 'fraccion' ? v.clase === 'proporcion'
      : v.clase === 'cantidad' || v.clase === 'proporcion';
  if (!compatibles) return false;
  const precision = n.clase === 'fraccion' ? { num: BigInt(1), den: BigInt(50) } : n.precision;
  // |escrito/den_n − escala·real| ≤ precisión/2  ⇔  |2·(escrito·den_v − escala·num_v·den_n)|·den_p ≤ num_p·den_n·den_v
  const diferencia = abs(abs(n.num) * v.den - escala * abs(v.num) * n.den);
  return BigInt(2) * diferencia * precision.den <= precision.num * n.den * v.den;
}

function sentidoFalso(texto: string, n: Numero, v: ValorVerificado): boolean {
  const antes = texto.slice(Math.max(0, n.posicion - 30), n.posicion);
  return (SUBE.test(antes) && v.num < BigInt(0)) || (BAJA.test(antes) && v.num > BigInt(0));
}

export function verificaNarracion(texto: string, permitidos: readonly ValorVerificado[], opciones: { causalPermitido: boolean }): Inclusion {
  const bloqueos: { crudo: string; motivo: string }[] = [];
  const causal = CAUSAL.exec(texto);
  if (causal && !opciones.causalPermitido) bloqueos.push({ crudo: causal[0], motivo: 'lenguaje causal sin hipótesis: los datos describen, no explican por qué' });
  const lectura = numerosDe(texto);
  if (!lectura.ok) return { ok: false, bloqueos: [...bloqueos, { crudo: lectura.crudo, motivo: lectura.motivo }] };
  const usados: { crudo: string; etiqueta: string }[] = [];
  for (const n of lectura.numeros) {
    const v = permitidos.find((p) => coincide(n, p));
    if (!v) { bloqueos.push({ crudo: n.crudo, motivo: 'cifra que no está entre los hechos verificados' }); continue; }
    if (sentidoFalso(texto, n, v)) { bloqueos.push({ crudo: n.crudo, motivo: `el verbo dice lo contrario del signo de ${v.etiqueta}` }); continue; }
    usados.push({ crudo: n.crudo, etiqueta: v.etiqueta });
  }
  return bloqueos.length ? { ok: false, bloqueos } : { ok: true, usados };
}

/** Los parámetros de la spec: también son verificados (versionados y con hash). */
export function permitidosDeLaSpec(e: Especificacion): ValorVerificado[] {
  return [
    { etiqueta: 'n mínimo de la spec', clase: 'cantidad', num: BigInt(e.inferencia.nMinimo), den: BigInt(1) },
    { etiqueta: 'α de la spec', clase: 'proporcion', num: BigInt(e.inferencia.alfaPorMil), den: BigInt(1000) },
    { etiqueta: 'banda de estabilidad', clase: 'proporcion', num: BigInt(e.estable.bandaPorMil), den: BigInt(1000) },
    { etiqueta: 'materialidad', clase: 'pesos', num: BigInt(e.materialidadCentavos), den: BigInt(100) },
  ];
}

/** Los valores que un certificado permite citar: hechos, derivados y sus partes, más los de la spec. */
export function permitidosDe(c: Certificado, e: Especificacion): ValorVerificado[] {
  const fuera: ValorVerificado[] = permitidosDeLaSpec(e);
  for (const h of c.hechos) {
    const v = h.valor;
    if (v.tipo === 'centavos') fuera.push({ etiqueta: h.nombre, clase: 'pesos', num: BigInt(v.v), den: BigInt(100) });
    else if (v.tipo === 'conteo') fuera.push({ etiqueta: h.nombre, clase: 'cantidad', num: BigInt(v.v), den: BigInt(1) });
    else if (v.tipo === 'fraccion') fuera.push({ etiqueta: h.nombre, clase: 'pesos', num: BigInt(v.num), den: BigInt(v.den) * BigInt(100) });
    else if (v.tipo === 'lista') for (const i of v.items) fuera.push({ etiqueta: `${h.nombre} ${i.cliente}`, clase: 'pesos', num: BigInt(i.centavos), den: BigInt(100) });
    else if (v.tipo === 'prueba') {
      fuera.push({ etiqueta: `${h.nombre}: n`, clase: 'cantidad', num: BigInt(v.r.n), den: BigInt(1) });
      fuera.push({ etiqueta: `${h.nombre}: p`, clase: 'proporcion', num: BigInt(v.r.exitos + 1), den: BigInt(v.r.iteraciones + 1) });
    }
  }
  for (const d of c.derivados) fuera.push({ etiqueta: d.enunciado, clase: d.unidad === 'centavos' ? 'pesos' : d.unidad === 'conteo' ? 'cantidad' : 'proporcion', num: BigInt(d.num), den: BigInt(d.den) * (d.unidad === 'centavos' ? BigInt(100) : BigInt(1)) });
  return fuera;
}

/** Lo que un «no» tipado permite citar: n, p, el mínimo y el α de la spec. Nada del negocio. */
export function permitidosDeVeredicto(v: Veredicto, e: Especificacion): ValorVerificado[] {
  const fuera: ValorVerificado[] = permitidosDeLaSpec(e);
  if (v.estado === 'evidencia_insuficiente') {
    fuera.push({ etiqueta: 'n de la prueba', clase: 'cantidad', num: BigInt(v.n), den: BigInt(1) });
    if (v.p) fuera.push({ etiqueta: 'p de la prueba', clase: 'proporcion', num: BigInt(v.p.num), den: BigInt(v.p.den) });
  }
  const semanas = v.estado === 'hipotesis' ? (v.experimento as { duracionSemanas?: number } | null)?.duracionSemanas : undefined;
  if (semanas) fuera.push({ etiqueta: 'duración del experimento', clase: 'cantidad', num: BigInt(semanas), den: BigInt(1) });
  return fuera;
}
