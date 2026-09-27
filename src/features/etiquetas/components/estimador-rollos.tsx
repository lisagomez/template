'use client';

/**
 * Estimador de gasto en rollos: lineas de etiquetas por mes, cada una con su rollo, mas la merma.
 * Arranca con el escenario de ejemplo (dulceria ficticia) y se edita en pantalla: nada se guarda.
 */
import { useState } from 'react';
import { costoPorEtiqueta, estima, type Escenario, type LineaEscenario, type Rollo } from '../services/nucleo.ts';
import { campo, tarjeta } from './marco.tsx';

const campoCorto = campo.replace('w-full ', '');

export const pesos = (n: number, dec = 2) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: dec, maximumFractionDigits: dec });
const entero = (n: number) => Math.round(n).toLocaleString('es-MX');

export function EstimadorRollos({ escenarios, rollos }: { escenarios: readonly Escenario[]; rollos: readonly Rollo[] }) {
  const base = escenarios[0];
  const [lineas, setLineas] = useState<LineaEscenario[]>(() => [...(base?.lineas ?? [])]);
  const [merma, setMerma] = useState(base?.mermaPct ?? 3);
  if (!base) return null;
  const e = estima({ ...base, lineas, mermaPct: merma }, rollos);
  const pon = (i: number, x: Partial<LineaEscenario>) => setLineas((v) => v.map((l, j) => (j === i ? { ...l, ...x } : l)));

  return (
    <section className={`${tarjeta} space-y-3`} data-prueba="estimador">
      <h2 className="text-base font-semibold">Estimación: {base.nombre}</h2>
      <p className="text-2xl font-bold" data-prueba="estimado-mes">{pesos(e.costoMes)} al mes <span className="text-base font-normal text-neutral-500">· {pesos(e.costoAnio, 0)} al año · {entero(e.etiquetasMes)} etiquetas</span></p>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">{base.supuestos}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-neutral-500"><tr><th className="py-1">Concepto</th><th>Rollo</th><th className="text-right">Etiquetas/mes</th><th className="text-right">Con merma</th><th className="text-right">Rollos</th><th className="text-right">$ por etiqueta</th><th className="text-right">Costo/mes</th></tr></thead>
          <tbody>
            {e.lineas.map((l, i) => (
              <tr key={i} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-2">{l.concepto}</td>
                <td className="pr-2"><select className={campo} value={lineas[i]!.rollo} onChange={(x) => pon(i, { rollo: x.target.value })} aria-label={`Rollo de ${l.concepto}`}>{rollos.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></td>
                <td className="text-right"><input className={`${campoCorto} w-24 text-right`} type="number" min={0} value={lineas[i]!.etiquetasMes} onChange={(x) => pon(i, { etiquetasMes: Math.max(0, Number(x.target.value) || 0) })} aria-label={`Etiquetas por mes de ${l.concepto}`} /></td>
                <td className="text-right tabular-nums">{entero(l.etiquetas)}</td>
                <td className="text-right tabular-nums">{l.rollos.toFixed(2)}</td>
                <td className="text-right tabular-nums">{l.rollo ? pesos(costoPorEtiqueta(l.rollo), 4) : '—'}</td>
                <td className="text-right font-semibold tabular-nums">{l.costo === null ? 'sin precio' : pesos(l.costo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm">Merma (calibración, reimpresiones) <input className={`${campoCorto} w-20`} type="number" min={0} max={50} value={merma} onChange={(x) => setMerma(Math.min(50, Math.max(0, Number(x.target.value) || 0)))} /> %</label>
      {e.sinPrecio ? <p className="text-xs text-amber-700">{e.sinPrecio} línea(s) sin precio no se suman: el total está incompleto, no en cero.</p> : null}
      <p className="text-xs text-neutral-500">No incluye IVA (las tiendas no lo aclaran), desgaste del cabezal, energía ni envío. Cambia el rollo de una línea para comparar, por ejemplo 1000D contra 2000D en las bolsas.</p>
    </section>
  );
}
