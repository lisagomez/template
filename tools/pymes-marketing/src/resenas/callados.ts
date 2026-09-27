/**
 * Clientes que se callaron (`review-reputation/reference/churn-signals.md`): el ritmo es el de CADA
 * cliente, no uno general. Con 3 compras o más: intervalo normal = mediana de sus propios huecos;
 * callado si el hueco actual pasa de 2×, perdido si pasa de 3×. Con menos compras se compara con la
 * mediana del negocio y se marca como estimación. Se ordena por lo que ha gastado. Solo alias:
 * nunca nombre ni RFC. Aquí no se redacta ningún mensaje: primero el dueño dice qué puede ofrecer.
 */
import { diasEntre, type Dia } from '../comun/fechas.js';
import type { LineaDeVenta } from '../ventas/tipos.js';

export interface ClienteCallado {
  readonly alias: string;
  readonly compras: number;
  readonly gastoCentavos: number;
  readonly ultimaCompra: Dia;
  readonly diasSinComprar: number;
  readonly intervaloNormal: number;
  readonly estado: 'callado' | 'perdido';
  readonly estimacion: boolean;
}

function mediana(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function clientesCallados(lineas: readonly LineaDeVenta[], hoy: Dia): ClienteCallado[] {
  const porCliente = new Map<string, { dias: Set<Dia>; gasto: number }>();
  for (const l of lineas) {
    if (!l.cliente) continue;
    const c = porCliente.get(l.cliente) ?? { dias: new Set<Dia>(), gasto: 0 };
    c.dias.add(l.dia);
    c.gasto += l.importe.moneda === 'MXN' ? l.importe.centavos : 0;
    porCliente.set(l.cliente, c);
  }
  const huecosPropios = new Map<string, number[]>();
  for (const [id, c] of porCliente) {
    const d = [...c.dias].sort();
    huecosPropios.set(id, d.slice(1).map((x, i) => diasEntre(d[i]!, x)));
  }
  const delNegocio = mediana([...huecosPropios.values()].flat());
  const salida: ClienteCallado[] = [];
  for (const [id, c] of porCliente) {
    const d = [...c.dias].sort(), ultima = d[d.length - 1]!;
    const propia = c.dias.size >= 3;
    const intervalo = propia ? mediana(huecosPropios.get(id)!) : delNegocio;
    if (intervalo <= 0) continue;
    const sin = diasEntre(ultima, hoy);
    const estado = sin > 3 * intervalo ? 'perdido' : sin > 2 * intervalo ? 'callado' : null;
    if (estado) salida.push({ alias: `Cliente ${id.slice(0, 4)}`, compras: c.dias.size, gastoCentavos: c.gasto, ultimaCompra: ultima, diasSinComprar: sin, intervaloNormal: Math.round(intervalo), estado, estimacion: !propia });
  }
  return salida.sort((a, b) => b.gastoCentavos - a.gastoCentavos || b.compras - a.compras).slice(0, 15);
}
