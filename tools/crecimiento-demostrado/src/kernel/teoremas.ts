/**
 * Los DOS teoremas del registro. Sus enunciados están demostrados en Lean (`lean/`) y aquí se
 * aplican solo si sus HIPÓTESIS se establecieron con hechos de Γ: el kernel no confía en que una
 * partición sea partición ni en que un cliente perdido tenga R = 0; lo exige citado.
 *
 * - puente_clasico:  {N, K…, L, Z, A} parte T  ∧  R_desde(N) = 0  ∧  R_hasta(L) = 0  ∧  ΔR(Z) = 0
 *                    ⟹  ΔR(T) = R_hasta(N) − R_desde(L) + Σ ΔR(K…) + ΔR(A)
 * - nft_lmdi:        R, N, tx > 0 en ambos periodos (si no, el motor dice «no aplica»)
 *                    ⟹  ΔR = Σ aportes (al centavo, por mayor residuo)
 */
import { formatoPesos } from '../comun/dinero.js';
import { valorDe } from '../motor/evalua.js';
import type { Clase, Termino } from '../motor/terminos.js';
import { entero } from './escalar.js';
import type { Estado, Prop } from './reglas.js';
import { rechaza } from './veredicto.js';

type Hecho = Extract<Prop, { k: 'hecho' }>;
const hechos = (usados: readonly Prop[]): Hecho[] => usados.filter((u): u is Hecho => u.k === 'hecho');

function centavos(s: Estado, id: string, t: Termino): bigint {
  const v = valorDe(s.g, s.e, t);
  return v.tipo === 'centavos' ? BigInt(v.v) : rechaza('falla_del_motor', id, `${t.m} no es un importe`);
}

export function teoremaPuente(s: Estado, id: string, usados: readonly Prop[]): Prop {
  const base = usados.find((u): u is Extract<Prop, { k: 'particion' }> => u.k === 'particion' && u.paso.universo === 'T');
  if (!base) return rechaza('hipotesis_del_teorema', id, 'puente_clasico necesita una partición de T entre lo que usa');
  const q = base.paso;
  const tiene = (c: Clase) => q.clases.includes(c);
  const conK = tiene('K') || (tiene('K_exp') && tiene('K_con') && tiene('K_flat'));
  if (!(tiene('N') && tiene('L') && tiene('Z') && tiene('A') && conK)) rechaza('hipotesis_del_teorema', id, 'la partición no es la del puente: {N, K…, L, Z, A}');
  const misma = (t: Termino) => 'metrica' in t && t.metrica === q.metrica && t.desde === q.desde && t.hasta === q.hasta && ('segmento' in t ? t.segmento : undefined) === q.segmento && !('cliente' in t && t.cliente);
  const exige = (m: 'R' | 'dR', clase: Clase, en: 'desde' | 'hasta' | null, que: string) => {
    const h = hechos(usados).find((x) => x.termino.m === m && 'clase' in x.termino && x.termino.clase === clase && misma(x.termino) && (en === null || ('en' in x.termino && x.termino.en === en)));
    if (!h) rechaza('hipotesis_del_teorema', id, `falta citar la hipótesis ${que}`);
    if (h!.escalar?.num !== BigInt(0)) rechaza('hipotesis_del_teorema', id, `la hipótesis ${que} es falsa: vale ${h!.valor.tipo === 'centavos' ? formatoPesos(h!.valor.v) : '?'}; use la forma general (suma_particion)`);
  };
  exige('R', 'N', 'desde', 'R_desde(N) = 0');
  exige('R', 'L', 'hasta', 'R_hasta(L) = 0');
  exige('dR', 'Z', null, 'ΔR(Z) = 0');
  const t = { metrica: q.metrica, desde: q.desde, hasta: q.hasta, ...(q.segmento ? { segmento: q.segmento } : {}) };
  const ks: Clase[] = tiene('K') ? ['K'] : ['K_exp', 'K_con', 'K_flat'];
  const izquierda = centavos(s, id, { m: 'dR', clase: 'T', ...t });
  const derecha = centavos(s, id, { m: 'R', clase: 'N', en: 'hasta', ...t }) - centavos(s, id, { m: 'R', clase: 'L', en: 'desde', ...t })
    + ks.reduce((acc, c) => acc + centavos(s, id, { m: 'dR', clase: c, ...t }), BigInt(0)) + centavos(s, id, { m: 'dR', clase: 'A', ...t });
  if (izquierda !== derecha) rechaza('falla_del_motor', id, `el puente no cierra: ${izquierda} ≠ ${derecha}`);
  return { k: 'escalar', enunciado: `ΔR[${q.metrica}](T) = R(N) − R(L) + ${ks.map((c) => `ΔR(${c})`).join(' + ')} + ΔR(A)`, escalar: entero(izquierda, 'centavos') };
}

export function teoremaLmdi(s: Estado, id: string, usados: readonly Prop[]): Prop {
  const factores = hechos(usados).filter((h) => h.termino.m === 'nft');
  const primero = factores[0]?.termino;
  if (!primero || primero.m !== 'nft') return rechaza('hipotesis_del_teorema', id, 'nft_lmdi necesita citar los aportes de cada factor');
  const iguales = factores.every((h) => h.termino.m === 'nft' && h.termino.metrica === primero.metrica && h.termino.desde === primero.desde && h.termino.hasta === primero.hasta && h.termino.alcance === primero.alcance);
  const esperados = primero.alcance === 'identificados' ? ['N', 'F', 'T'] : ['Tx', 'T'];
  const presentes = factores.map((h) => (h.termino.m === 'nft' ? h.termino.factor : '')).sort();
  if (!iguales || presentes.join() !== [...esperados].sort().join()) rechaza('hipotesis_del_teorema', id, `nft_lmdi necesita exactamente los factores ${esperados.join(', ')} de la misma transición`);
  const noAplica = factores.find((h) => h.valor.tipo === 'no_aplica');
  if (noAplica && noAplica.valor.tipo === 'no_aplica') rechaza('hipotesis_del_teorema', id, noAplica.valor.motivo);
  const clase: Clase = primero.alcance === 'identificados' ? 'U' : 'T';
  const total = centavos(s, id, { m: 'dR', metrica: primero.metrica, clase, desde: primero.desde, hasta: primero.hasta });
  const suma = factores.reduce((acc, h) => acc + (h.escalar?.num ?? BigInt(0)), BigInt(0));
  if (suma !== total) rechaza('falla_del_motor', id, `Σ aportes (${suma}) ≠ ΔR (${total})`);
  return { k: 'escalar', enunciado: `ΔR[${primero.metrica}](${clase}) = ${esperados.map((f) => `aporte(${f})`).join(' + ')}`, escalar: entero(total, 'centavos') };
}
