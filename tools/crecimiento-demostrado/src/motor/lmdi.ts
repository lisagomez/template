/**
 * Ingreso = Clientes × Frecuencia × Ticket, exacto: N · (tx/N) · (R/tx) = R. En logaritmos,
 * Δln R = Δln N + Δln F + Δln T sin residuo. Para llevarlo a PESOS se usa LMDI (Ang, 2004): con el
 * peso L = (R₁ − R₀) / (ln R₁ − ln R₀), cada factor aporta L · Δln(factor), y la suma es ΔR
 * exactamente en los reales.
 *
 * En flotantes no es exacto, y aquí se declara cómo se cierra: cada aporte se lleva a centavos por
 * MAYOR RESIDUO (piso de cada uno y los centavos que faltan a los de mayor fracción, desempate por
 * el orden N, F, T). Así la suma de los aportes es ΔR al centavo, y cada aporte difiere de su valor
 * real en menos de un centavo.
 *
 * Solo aplica si R, N y tx son positivos en ambos periodos; si no, no hay logaritmo, y se dice.
 */

export interface Factores { readonly R: number; readonly N: number; readonly tx: number }

export type Aportes = { aplica: true; aportes: readonly number[] } | { aplica: false; motivo: string };

function pesoLogaritmico(r0: number, r1: number): number {
  return r0 === r1 ? r0 : (r1 - r0) / (Math.log(r1) - Math.log(r0));
}

/** Reparte por mayor residuo: enteros que suman `total` exactamente. */
export function mayorResiduo(reales: readonly number[], total: number): number[] {
  const pisos = reales.map((x) => Math.floor(x));
  let faltan = total - pisos.reduce((s, x) => s + x, 0);
  const orden = reales.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const fuera = [...pisos];
  for (let k = 0; faltan !== 0 && k < orden.length * 4; k++) {
    const j = orden[k % orden.length]!.i;
    fuera[j]! += Math.sign(faltan);
    faltan -= Math.sign(faltan);
  }
  return fuera;
}

/** Aportes de [N, F, T] (identificados) o de [Tx, T] (todos, sin N). */
export function aportesLmdi(f0: Factores, f1: Factores, conClientes: boolean): Aportes {
  const positivos = f0.R > 0 && f1.R > 0 && f0.tx > 0 && f1.tx > 0 && (!conClientes || (f0.N > 0 && f1.N > 0));
  if (!positivos) return { aplica: false, motivo: 'R, tx o N no son positivos en ambos periodos: sin logaritmo no hay descomposición multiplicativa' };
  const L = pesoLogaritmico(f0.R, f1.R);
  const ln = (a: number, b: number) => Math.log(b) - Math.log(a);
  const tickets = ln(f0.R / f0.tx, f1.R / f1.tx);
  const reales = conClientes
    ? [L * ln(f0.N, f1.N), L * ln(f0.tx / f0.N, f1.tx / f1.N), L * tickets]
    : [L * ln(f0.tx, f1.tx), L * tickets];
  return { aplica: true, aportes: mayorResiduo(reales, f1.R - f0.R) };
}
