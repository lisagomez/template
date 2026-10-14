/**
 * Las 11 reglas del kernel, una función cada una. Cada regla recibe las proposiciones ya
 * establecidas y, o establece una nueva, o CORTA con un veredicto tipado. Ningún valor se toma de
 * la derivación: los hechos se recalculan sobre Γ, y la aritmética es racional exacta.
 */
import { canoniza, type Canonizable } from '../comun/canonico.js';
import { formatoPesos } from '../comun/dinero.js';
import type { Gamma } from '../datos/gamma.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import { particionDe, valorDe, type Valor } from '../motor/evalua.js';
import { indiceDe } from '../motor/indice.js';
import { hechoDe } from '../motor/plan.js';
import { nombreDe, type Clase, type Termino } from '../motor/terminos.js';
import type { Derivacion, Paso } from './derivacion.js';
import { absoluto, compara, cumple, decimal, divide, entero, escalarDe, porMil, resta, signo, suma, type Escalar } from './escalar.js';
import { Corte, rechaza } from './veredicto.js';
import { teoremaLmdi, teoremaPuente } from './teoremas.js';

export type Prop =
  | { readonly k: 'hecho'; readonly enunciado: string; readonly termino: Termino; readonly valor: Valor; readonly escalar: Escalar | null }
  | { readonly k: 'particion'; readonly enunciado: string; readonly paso: Extract<Paso, { regla: 'particion' }> }
  | { readonly k: 'escalar'; readonly enunciado: string; readonly escalar: Escalar }
  | { readonly k: 'verdad'; readonly enunciado: string; readonly escalar: Escalar | null }
  | { readonly k: 'no_es_ruido'; readonly enunciado: string; readonly n: number; readonly p: { num: number; den: number } }
  | { readonly k: 'supuesto'; readonly enunciado: string }
  | { readonly k: 'hipotesis'; readonly enunciado: string; readonly experimento: unknown };

export interface Estado {
  readonly g: Gamma;
  readonly e: Especificacion;
  readonly d: Derivacion;
  readonly props: Map<string, Prop>;
}

type De<R extends Paso['regla']> = Extract<Paso, { regla: R }>;

export function prop(s: Estado, id: string, desde: string): Prop {
  const p = s.props.get(id);
  return p ?? rechaza('paso_desconocido', desde, `el paso ${desde} cita «${id}», que no existe antes que él`);
}

function escalar(s: Estado, id: string, desde: string): Escalar {
  const p = prop(s, id, desde);
  const e = 'escalar' in p ? p.escalar : null;
  return e ?? rechaza('tipo_incompatible', desde, `«${id}» no es un número: no se puede operar`);
}

export const muestra = (e: Escalar): string => (e.den === BigInt(1) && e.unidad === 'centavos' ? formatoPesos(Number(e.num)) : e.den === BigInt(1) ? String(e.num) : decimal(e));

export function cita(s: Estado, p: De<'cita'>): Prop {
  const real = valorDe(s.g, s.e, p.termino);
  if (canoniza(real as unknown as Canonizable) !== canoniza(p.valor as unknown as Canonizable)) {
    rechaza('valor_alterado', p.id, `${nombreDe(p.termino)}: la derivación dice ${canoniza(p.valor as unknown as Canonizable)} y Γ dice ${canoniza(real as unknown as Canonizable)}`);
  }
  const faltan = hechoDe(s.g, s.e, p.termino).exige.filter((sa) => !s.d.supuestos.includes(sa));
  if (faltan.length) throw new Corte({ estado: 'requiere_entrada', faltan, paso: p.id, detalle: `${nombreDe(p.termino)} no se puede citar sin declarar ${faltan.join(', ')}` });
  return { k: 'hecho', enunciado: nombreDe(p.termino), termino: p.termino, valor: real, escalar: escalarDe(real) };
}

export function particion(s: Estado, p: De<'particion'>): Prop {
  const P = particionDe(indiceDe(s.g), s.e, p.metrica, p, p.segmento);
  const universo = new Set(P[p.universo]);
  const vistos = new Map<string, Clase>();
  for (const c of p.clases) for (const x of P[c]) {
    const previa = vistos.get(x);
    if (previa) rechaza('particion_no_disjunta', p.id, `un miembro está en ${previa} y en ${c}: las clases no son disjuntas`);
    vistos.set(x, c);
  }
  const fuera = [...universo].filter((x) => !vistos.has(x)).length;
  const sobran = [...vistos.keys()].filter((x) => !universo.has(x)).length;
  if (fuera || sobran) rechaza('particion_no_exhaustiva', p.id, `${fuera} miembro(s) de ${p.universo} sin clase y ${sobran} fuera del universo: no es exhaustiva`);
  return { k: 'particion', enunciado: `{${p.clases.join(', ')}} parte ${p.universo} (${p.metrica}, ${p.desde}→${p.hasta})`, paso: p };
}

export function sumaParticion(s: Estado, p: De<'suma_particion'>): Prop {
  const base = prop(s, p.particion, p.id);
  if (base.k !== 'particion') return rechaza('tipo_incompatible', p.id, `«${p.particion}» no es una partición`);
  const q = base.paso;
  const dR = (clase: Clase): bigint => {
    const v = valorDe(s.g, s.e, { m: 'dR', metrica: q.metrica, clase, desde: q.desde, hasta: q.hasta, ...(q.segmento ? { segmento: q.segmento } : {}) });
    return v.tipo === 'centavos' ? BigInt(v.v) : rechaza('falla_del_motor', p.id, 'ΔR no es un importe');
  };
  const total = dR(q.universo);
  const partes = q.clases.reduce((acc, c) => acc + dR(c), BigInt(0));
  if (total !== partes) rechaza('falla_del_motor', p.id, `Σ ΔR de las partes (${partes}) ≠ ΔR del universo (${total}): la suma sobre una partición no cierra`);
  return { k: 'escalar', enunciado: `ΔR[${q.metrica}](${q.universo}) = Σ ΔR[${q.metrica}](${q.clases.join(' + ')})`, escalar: entero(total, 'centavos') };
}

export function teorema(s: Estado, p: De<'teorema'>): Prop {
  const usados = p.usa.map((id) => prop(s, id, p.id));
  return p.nombre === 'puente_clasico' ? teoremaPuente(s, p.id, usados) : teoremaLmdi(s, p.id, usados);
}

export function aritmetica(s: Estado, p: De<'aritmetica'>): Prop {
  const [primero, ...resto] = p.de.map((id) => escalar(s, id, p.id));
  const r = resto.reduce((acc, x) => (p.op === 'suma' ? suma(acc, x) : resta(acc, x)), primero!);
  const nombres = p.de.map((id) => prop(s, id, p.id).enunciado);
  return { k: 'escalar', enunciado: nombres.join(p.op === 'suma' ? ' + ' : ' − '), escalar: r };
}

export function comparaPaso(s: Estado, p: De<'compara'>): Prop {
  const a = escalar(s, p.a, p.id);
  const b = typeof p.b === 'string' ? escalar(s, p.b, p.id) : entero(p.b.constante, a.unidad);
  const nombreB = typeof p.b === 'string' ? prop(s, p.b, p.id).enunciado : String(p.b.constante);
  if (!cumple(a, p.op, b)) rechaza('afirmacion_falsa', p.id, `${prop(s, p.a, p.id).enunciado} = ${muestra(a)} no es ${p.op} ${muestra(b)}`);
  return { k: 'verdad', enunciado: `${prop(s, p.a, p.id).enunciado} ${p.op} ${nombreB}`, escalar: null };
}

/** Una proporción solo es un número si su denominador es material y los signos coinciden. */
function guardaDenominador(s: Estado, id: string, num: Escalar, den: Escalar): void {
  if (den.num === BigInt(0)) rechaza('proporcion_indeterminada', id, 'el denominador es cero');
  if (den.unidad === 'centavos' && compara(absoluto(den), entero(s.e.materialidadCentavos, 'centavos')) < 0) {
    rechaza('proporcion_indeterminada', id, `|denominador| = ${muestra(absoluto(den))} < materialidad ${formatoPesos(s.e.materialidadCentavos)}: la proporción es ruido`);
  }
  if (signo(num) * signo(den) < 0) rechaza('proporcion_indeterminada', id, 'numerador y denominador de signo contrario: no es una parte del total');
}

export function razon(s: Estado, p: De<'razon'>): Prop {
  const [num, den] = [escalar(s, p.num, p.id), escalar(s, p.den, p.id)];
  guardaDenominador(s, p.id, num, den);
  const r = divide(num, den);
  const enunciado = `${prop(s, p.num, p.id).enunciado} / ${prop(s, p.den, p.id).enunciado} ${p.op} ${decimal(porMil(p.umbralPorMil))}`;
  if (!cumple(r, p.op, porMil(p.umbralPorMil))) rechaza('afirmacion_falsa', p.id, `${enunciado} es falso: vale ${decimal(r)}`);
  return { k: 'verdad', enunciado, escalar: r };
}

export function cambioRelativo(s: Estado, p: De<'cambio_relativo'>): Prop {
  const [antes, despues] = [escalar(s, p.antes, p.id), escalar(s, p.despues, p.id)];
  if (signo(antes) <= 0) rechaza('proporcion_indeterminada', p.id, 'el valor de partida no es positivo: un cambio relativo no existe');
  guardaDenominador(s, p.id, antes, antes);
  const r = divide(resta(despues, antes), antes);
  const enunciado = `(${prop(s, p.despues, p.id).enunciado} − ${prop(s, p.antes, p.id).enunciado}) / ${prop(s, p.antes, p.id).enunciado} ${p.op} ${decimal(porMil(p.umbralPorMil))}`;
  if (!cumple(r, p.op, porMil(p.umbralPorMil))) rechaza('afirmacion_falsa', p.id, `${enunciado} es falso: vale ${decimal(r)}`);
  return { k: 'verdad', enunciado, escalar: r };
}

export function prueba(s: Estado, p: De<'prueba'>): Prop {
  const base = prop(s, p.cita, p.id);
  if (base.k !== 'hecho' || base.valor.tipo !== 'prueba') return rechaza('tipo_incompatible', p.id, `«${p.cita}» no cita una prueba`);
  const r = base.valor.r;
  const pv = { num: r.exitos + 1, den: r.iteraciones + 1 };
  if (r.n < s.e.inferencia.nMinimo) throw new Corte({ estado: 'evidencia_insuficiente', paso: p.id, n: r.n, p: null, detalle: `n = ${r.n} < ${s.e.inferencia.nMinimo} (mínimo de la spec): con tan pocos casos no se distingue una señal del ruido` });
  if (pv.num * 1000 >= s.e.inferencia.alfaPorMil * pv.den) throw new Corte({ estado: 'evidencia_insuficiente', paso: p.id, n: r.n, p: pv, detalle: `p = ${pv.num}/${pv.den} ≥ α = ${s.e.inferencia.alfaPorMil}/1000: no se distingue del ruido` });
  return { k: 'no_es_ruido', enunciado: `${base.enunciado}: no es ruido (p = ${pv.num}/${pv.den} < α, n = ${r.n})`, n: r.n, p: pv };
}

export function supuesto(s: Estado, p: De<'supuesto'>): Prop {
  if (!s.e.supuestos.some((x) => x.id === p.sa)) rechaza('supuesto_inexistente', p.id, `${p.sa} no existe en la spec`);
  if (!s.d.supuestos.includes(p.sa)) throw new Corte({ estado: 'requiere_entrada', faltan: [p.sa], paso: p.id, detalle: `el paso usa ${p.sa} y la derivación no lo declara` });
  return { k: 'supuesto', enunciado: p.sa };
}

export function hipotesis(_s: Estado, p: De<'hipotesis'>): Prop {
  return { k: 'hipotesis', enunciado: `«${p.intervencion}» hace que ${p.metrica} ${p.sentido === 'sube' ? 'suba' : 'baje'}`, experimento: p.experimento };
}
