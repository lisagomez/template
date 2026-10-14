/**
 * Las narraciones del narrador simulado: plantillas en español que SOLO usan lo que el kernel
 * certificó (y los parámetros de la spec). Cada cifra que escriben pasa después por la inclusión de
 * números; si una plantilla se equivoca, se bloquea igual que un LLM.
 */
import { etiqueta } from '../comun/periodos.js';
import { formatoPesos } from '../comun/dinero.js';
import type { Certificado, HechoCertificado, Veredicto } from '../kernel/veredicto.js';
import type { Clase, Termino } from '../motor/terminos.js';
import type { Especificacion } from '../ontologia/especificacion.js';

const NOMBRE: Readonly<Record<string, string>> = {
  N: 'clientes nuevos', K_exp: 'clientes que compraron más', K_con: 'clientes que compraron menos', K_flat: 'clientes estables',
  L: 'clientes perdidos', Z: 'clientes solo con ajustes (notas o pagos, sin compra)', A: 'público en general',
};

/** Racional → texto con `d` decimales, mitades lejos del cero. */
export function redondea(num: bigint, den: bigint, d: number): string {
  const escala = BigInt(10) ** BigInt(d);
  const neg = (num < BigInt(0)) !== (den < BigInt(0)) && num !== BigInt(0);
  const [a, b] = [num < BigInt(0) ? -num : num, den < BigInt(0) ? -den : den];
  const q = (BigInt(2) * a * escala + b) / (BigInt(2) * b);
  const ent = q / escala;
  const frac = d ? `.${String(q % escala).padStart(d, '0')}` : '';
  return `${neg ? '-' : ''}${ent}${frac}`;
}

const pesosDe = (num: bigint, den: bigint) => formatoPesos(Number(redondea(num, den, 0)));
const hecho = (c: Certificado, p: (t: Termino) => boolean): HechoCertificado | undefined => c.hechos.find((h) => p(h.termino));
const deClase = (m: Termino['m'], clase: Clase) => (t: Termino) => t.m === m && 'clase' in t && t.clase === clase && !('cliente' in t && t.cliente);
const centavos = (h: HechoCertificado | undefined) => (h?.valor.tipo === 'centavos' ? h.valor.v : null);
const conteo = (h: HechoCertificado | undefined) => (h?.valor.tipo === 'conteo' ? h.valor.v : null);
const transicion = (t: Termino) => ('desde' in t ? `entre ${etiqueta(t.desde)} y ${etiqueta(t.hasta)}` : '');
const Mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function narraPuente(c: Certificado): string {
  const total = hecho(c, deClase('dR', 'T'));
  const dT = centavos(total) ?? 0;
  const lineas = ['N', 'K_exp', 'K_con', 'K_flat', 'L', 'Z', 'A'].flatMap((k) => {
    const d = centavos(hecho(c, deClase('dR', k as Clase)));
    const n = conteo(hecho(c, deClase('n', k as Clase)));
    if (d === null || (d === 0 && !n)) return [];
    return [`· ${k === 'A' ? NOMBRE.A : `${n} ${NOMBRE[k]}`}: ${formatoPesos(d)}`];
  });
  const metrica = total && 'metrica' in total.termino ? total.termino.metrica : 'neto';
  const clasico = c.afirmacion.regla === 'teorema'
    ? 'Aquí vale la forma clásica: lo de los nuevos, menos lo que compraban los perdidos, más el cambio de los que se quedaron.'
    : 'La forma clásica no aplica en esta transición: un cliente perdido o sin compras recibió una nota de crédito o un pago, así que se usó la suma general sobre la partición.';
  return [
    `${Mayuscula(transicion(total!.termino))} el ingreso ${metrica} ${dT >= 0 ? 'creció' : 'cayó'} ${formatoPesos(Math.abs(dT))}.`,
    'De dónde salió, clase por clase (las clases no se traslapan y cubren a todos, así que la suma cierra al centavo):',
    ...lineas, clasico,
  ].join('\n');
}

export function narraProporcion(c: Certificado, e: Especificacion): string {
  const num = hecho(c, deClase('dR', 'K_exp'));
  const den = hecho(c, deClase('dR', 'T'));
  const r = c.derivados.find((d) => d.enunciado.includes(' / '))!;
  const umbral = c.derivados.find((d) => d.enunciado.startsWith('umbral'))!;
  const pct = redondea(BigInt(r.num) * BigInt(100), BigInt(r.den), 1);
  const cumple = c.afirmacion.enunciado.includes('>=');
  return `${cumple ? 'Sí' : 'No'}: ${transicion(den!.termino)} la expansión de los clientes que se quedaron sumó ${formatoPesos(centavos(num)!)}, el ${pct} % del cambio total (${formatoPesos(centavos(den)!)}). `
    + `${cumple ? 'Es al menos' : 'Es como mucho'} el ${redondea(BigInt(umbral.num) * BigInt(100), BigInt(1000), 0)} % que preguntaste. La proporción solo se calcula si el cambio total supera la materialidad de ${formatoPesos(e.materialidadCentavos)} y tiene el mismo signo.`;
}

export function narraClase(c: Certificado): string {
  const afirmado = c.hechos.find((h) => h.nombre === c.afirmacion.enunciado)!;
  const clase = 'clase' in afirmado.termino ? afirmado.termino.clase : 'L';
  const n = conteo(hecho(c, deClase('n', clase)));
  const top = c.hechos.find((h) => h.termino.m === 'top');
  const detalle = top?.valor.tipo === 'lista' ? top.valor.items.map((i) => `${i.cliente} (${formatoPesos(i.centavos)})`).join(', ') : '';
  const etiquetaClase = clase === 'L' ? 'clientes que dejaron de comprar' : 'clientes nuevos';
  return `${Mayuscula(transicion(afirmado.termino))} hubo ${n} ${etiquetaClase}; su efecto en el ingreso fue de ${formatoPesos(centavos(afirmado)!)}.`
    + (detalle ? ` Los de mayor peso (seudónimos): ${detalle}.` : '');
}

export function narraTicket(c: Certificado): string {
  const tickets = c.hechos.filter((h) => h.termino.m === 'ticket');
  const de = (en: string) => tickets.find((h) => 'en' in h.termino && h.termino.en === en)!;
  const valor = (h: HechoCertificado) => (h.valor.tipo === 'fraccion' ? pesosDe(BigInt(h.valor.num), BigInt(h.valor.den)) : '?');
  const r = c.derivados.find((d) => d.enunciado.startsWith('('))!;
  const pct = redondea(BigInt(r.num) * BigInt(100), BigInt(r.den), 1);
  const signo = BigInt(r.num) >= BigInt(0);
  return `${Mayuscula(transicion(de('desde').termino))} el ticket promedio pasó de ${valor(de('desde'))} a ${valor(de('hasta'))}: ${signo ? 'subió' : 'bajó'} ${pct.replace('-', '')} %. Es un promedio exacto (ingreso entre transacciones), no una muestra.`;
}

export function narraPalancas(c: Certificado): string {
  const aportes = c.hechos.filter((h) => h.termino.m === 'nft');
  const nombre: Readonly<Record<string, string>> = { N: 'número de clientes', F: 'frecuencia de compra', T: 'ticket promedio', Tx: 'número de transacciones' };
  const total = c.hechos.find((h) => h.termino.m === 'dR')!;
  const lineas = aportes.map((h) => `· ${nombre[h.termino.m === 'nft' ? h.termino.factor : 'T']}: ${formatoPesos(centavos(h)!)}`);
  return [`${Mayuscula(transicion(total.termino))} el cambio de ${formatoPesos(centavos(total)!)} se reparte así entre las palancas (descomposición logarítmica, cerrada al centavo):`, ...lineas].join('\n');
}

export function narraPrueba(c: Certificado, e: Especificacion): string {
  const h = c.hechos.find((x) => x.termino.m === 'prueba')!;
  if (h.valor.tipo !== 'prueba') return '';
  const r = h.valor.r;
  const p = redondea(BigInt(r.exitos + 1), BigInt(r.iteraciones + 1), 4);
  const unidad = h.termino.m === 'prueba' && h.termino.diseno === 'pareada' ? 'clientes' : 'tickets en el grupo menor';
  return `Sí: ${transicion(h.termino)} la diferencia no parece ruido. Una prueba de permutación con semilla fija da p = ${p}, por debajo de α = ${redondea(BigInt(e.inferencia.alfaPorMil), BigInt(1000), 2)}, con n = ${r.n} ${unidad}. Dice que la diferencia existe, no por qué.`;
}

export function narraNoDemostrable(v: Veredicto, e: Especificacion): string {
  if (v.estado === 'evidencia_insuficiente') {
    if (!v.p) return `No se puede saber con estos datos: la prueba tiene n = ${v.n} y la spec pide al menos ${e.inferencia.nMinimo} para distinguir una señal del ruido. No es un defecto del sistema: es lo que tus datos permiten afirmar.`;
    return `No se distingue del ruido: p = ${redondea(BigInt(v.p.num), BigInt(v.p.den), 4)}, que no queda por debajo de α = ${redondea(BigInt(e.inferencia.alfaPorMil), BigInt(1000), 2)}, con n = ${v.n}. Decidir sobre esta diferencia sería decidir sobre ruido.`;
  }
  if (v.estado === 'hipotesis') {
    const x = v.experimento as { duracionSemanas: number; grupoControl: string; criterio: string };
    return `Eso no se puede demostrar con tus datos: es una pregunta causal, y el historial solo describe lo que pasó. Queda como HIPÓTESIS. Para ponerla a prueba: un experimento escalonado con ${x.grupoControl} como grupo de control, durante ${x.duracionSemanas} semanas, midiendo ${x.criterio}. Si el resultado aguanta, entonces sí sabrás si el cambio aumentará tu margen.`;
  }
  return 'No hay una respuesta demostrada para esta pregunta.';
}
