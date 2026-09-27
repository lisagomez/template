/**
 * Pulso de crecimiento (adaptado de `growth-pulse`): ¿funciona el motor? Vistas con los umbrales
 * de `reference/thresholds.md` (defaults de pyme, ajustables). Una vista sin datos se NOMBRA como
 * «n/a», nunca desaparece. Máximo tres acciones por impacto; «nada urgente» es una respuesta válida.
 * Los anuncios se juzgan contra el promedio PROPIO (regla de `ad-manager`), no con un ROAS genérico.
 */
import { esOk, type Dato } from '../comun/dato.js';
import { formatoPesosRedondo } from '../comun/dinero.js';
import { sumaDias, type Dia } from '../comun/fechas.js';
import type { AccionSugerida, SeccionDelLunes } from '../comun/lunes.js';
import type { ResumenDeVentas } from '../ventas/resumen.js';
import type { VentasNormalizadas } from '../ventas/tipos.js';
import type { AnalisisDeResenas } from '../resenas/index.js';
import type { Campana } from './anuncios.js';

export type EstadoDeVista = 'bien' | 'revisar' | 'problema' | 'n/a';

export interface Vista {
  readonly nombre: 'Ventas por canal' | 'Prospectos' | 'Anuncios' | 'Productos' | 'Sentimiento';
  readonly estado: EstadoDeVista;
  readonly lineas: readonly string[];
  /** En n/a: qué la arreglaría. */
  readonly motivo: string | null;
}

export interface Pulso {
  readonly desde: Dia;
  readonly hasta: Dia;
  readonly enUnaFrase: string;
  readonly vistas: readonly Vista[];
  readonly acciones: readonly AccionSugerida[];
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const na = (nombre: Vista['nombre'], motivo: string): Vista => ({ nombre, estado: 'n/a', lineas: [], motivo });

function ventasPorCanal(v: VentasNormalizadas, hasta: Dia, dias: number): { vista: Vista; cambio: number | null } {
  const ini = sumaDias(hasta, -(dias - 1)), iniPrev = sumaDias(ini, -dias);
  const pesos = v.lineas.filter((l) => l.importe.moneda === 'MXN');
  const ahora = pesos.filter((l) => l.dia >= ini && l.dia <= hasta).reduce((s, l) => s + l.importe.centavos, 0);
  const antes = pesos.filter((l) => l.dia >= iniPrev && l.dia < ini).reduce((s, l) => s + l.importe.centavos, 0);
  if (antes === 0) return { vista: { nombre: 'Ventas por canal', estado: 'n/a', lineas: [`${formatoPesosRedondo(ahora)} en ${dias} días`], motivo: 'no hay periodo anterior para comparar' }, cambio: null };
  const cambio = (ahora - antes) / antes;
  const canales = new Map<string, number>();
  for (const l of pesos.filter((x) => x.dia >= ini && x.dia <= hasta)) canales.set(l.canal, (canales.get(l.canal) ?? 0) + l.importe.centavos);
  const mayor = [...canales].sort((a, b) => b[1] - a[1])[0];
  const conc = mayor && ahora ? mayor[1] / ahora : 0;
  const estado: EstadoDeVista = cambio < -0.1 || conc > 0.8 ? 'problema' : cambio < 0 || conc > 0.6 ? 'revisar' : 'bien';
  const lineas = [`${formatoPesosRedondo(ahora)} en ${dias} días, ${pct(cambio)} contra los ${dias} anteriores (${formatoPesosRedondo(antes)})`];
  if (mayor && canales.size > 1) lineas.push(`${mayor[0]} es el ${Math.round(conc * 100)}% de la venta${conc > 0.8 ? ': frágil aunque vaya bien' : ''}`);
  if (canales.size === 1 && mayor) lineas.push(`un solo canal registrado (${mayor[0]}): no se puede ver la mezcla`);
  return { vista: { nombre: 'Ventas por canal', estado, lineas, motivo: null }, cambio };
}

function productos(r: Dato<ResumenDeVentas>): Vista {
  if (!esOk(r)) return na('Productos', r.motivo);
  const v = r.valor, c = v.concentracionTop, top = v.productos[0];
  const estado: EstadoDeVista = c > 0.5 ? 'problema' : c >= 0.3 ? 'revisar' : 'bien';
  const lineas = [
    `Arriba: ${v.productos.slice(0, 3).map((p) => `${p.producto} (${formatoPesosRedondo(p.importe)})`).join(', ')}`,
    `Abajo: ${v.productos.slice(-3).reverse().map((p) => `${p.producto} (${formatoPesosRedondo(p.importe)})`).join(', ')}`,
    ...[...v.subiendo, ...v.bajando].map((p) => `${p.producto} se movió ${pct(p.tendencia ?? 0)} en 30 días`),
  ];
  if (top && c >= 0.3) lineas.push(`${top.producto} es el ${Math.round(c * 100)}% de la venta`);
  return { nombre: 'Productos', estado, lineas, motivo: null };
}

function anuncios(cs: readonly Campana[] | null | undefined): Vista {
  if (!cs || cs.length === 0) return na('Anuncios', 'no se cargó la exportación del Administrador de anuncios');
  const peor = (['problema', 'vigilar', 'funciona'] as const).find((v) => cs.some((c) => c.veredicto === v));
  const estado: EstadoDeVista = peor === 'problema' ? 'problema' : peor === 'vigilar' ? 'revisar' : peor === 'funciona' ? 'bien' : 'n/a';
  const lineas = cs.map((c) => `${c.nombre}: ${formatoPesosRedondo(c.gasto)} gastados · ${c.resultados ?? 'sin medición de'} resultados${c.costoPorResultado ? ` a ${formatoPesosRedondo(c.costoPorResultado)} c/u` : ''} · ${c.veredicto} (${c.porque})`);
  return { nombre: 'Anuncios', estado, lineas: ['contra tu propio promedio, no contra referencias de internet', ...lineas], motivo: estado === 'n/a' ? 'ninguna campaña tiene medición suficiente' : null };
}

function sentimiento(a: AnalisisDeResenas | null | undefined, v: VentasNormalizadas | null): Vista {
  if (!a || a.calificaciones.length === 0) return na('Sentimiento', 'no se cargaron reseñas');
  let estado: EstadoDeVista = 'bien';
  const lineas: string[] = [];
  for (const c of a.calificaciones) {
    const e: EstadoDeVista = c.promedio === null ? 'n/a' : c.promedio < 3.8 || (c.cambio ?? 0) < -0.3 ? 'problema' : c.promedio < 4.3 || (c.cambio ?? 0) < 0 ? 'revisar' : 'bien';
    if (e === 'problema' || (e === 'revisar' && estado === 'bien')) estado = e;
    lineas.push(`${c.plataforma}: ${c.promedio ?? 'sin calificación'} de ${c.resenas} reseñas${c.cambio !== null ? ` (${c.cambio >= 0 ? '+' : ''}${c.cambio})` : ''} — no se promedian plataformas`);
  }
  const notas = v?.notasDeCredito?.cuantas ?? 0;
  const facturas = v ? new Set(v.lineas.map((l) => l.referencia)).size : 0;
  if (facturas > 0) {
    const tasa = notas / facturas;
    if (tasa > 0.01) estado = 'problema';
    lineas.push(`${notas} nota(s) de crédito en ${facturas} ventas (${(tasa * 100).toFixed(1)} %)`);
  }
  return { nombre: 'Sentimiento', estado, lineas, motivo: null };
}

export interface EntradaDePulso {
  readonly ventas: VentasNormalizadas | null;
  readonly resumen: Dato<ResumenDeVentas>;
  readonly anuncios?: readonly Campana[] | null;
  readonly resenas?: AnalisisDeResenas | null;
  /** 7 para el lunes, 30 para el mes. */
  readonly dias?: 7 | 30;
}

export function pulsoDeCrecimiento(e: EntradaDePulso): Pulso {
  const dias = e.dias ?? 7;
  const hasta = esOk(e.resumen) ? e.resumen.valor.hasta : sumaDias('2000-01-01', 0);
  const canal = e.ventas && esOk(e.resumen) ? ventasPorCanal(e.ventas, hasta, dias) : { vista: na('Ventas por canal', 'no hay ventas cargadas'), cambio: null };
  const vistas = [canal.vista, na('Prospectos', 'no hay hoja de prospectos: sube tu lista (fecha, origen, etapa) para ver el embudo'), anuncios(e.anuncios), productos(e.resumen), sentimiento(e.resenas, e.ventas)];
  const acciones: AccionSugerida[] = [];
  const prod = vistas[3]!;
  if (prod.estado === 'problema' && esOk(e.resumen)) acciones.push({ titulo: `Dale visibilidad a un segundo producto además de ${e.resumen.valor.productos[0]!.producto}`, porque: prod.lineas.at(-1) ?? '', impacto: null, prioridad: 2, fuente: 'ventas' });
  if (canal.cambio !== null && canal.cambio < -0.1) acciones.push({ titulo: 'Revisa qué cambió esta semana en tu venta', porque: canal.vista.lineas[0]!, impacto: null, prioridad: 1, fuente: 'ventas' });
  const sent = vistas[4]!;
  if (sent.estado === 'problema' && (canal.cambio ?? 0) >= -0.1) acciones.push({ titulo: 'Atiende lo que dicen las reseñas antes de que llegue a la venta', porque: 'las reseñas están en zona roja (promedio bajo 3.8, o bajando más de 0.3) con la venta estable: suele llegar a las ventas en unos dos meses', impacto: null, prioridad: 1, fuente: 'resenas' });
  const frase = canal.cambio === null ? 'Sin un periodo anterior no se puede decir hacia dónde va la venta.'
    : `La venta de los últimos ${dias} días va ${pct(canal.cambio)}${prod.estado === 'problema' ? ', y depende demasiado de un solo producto' : ''}.`;
  return { desde: sumaDias(hasta, -(dias - 1)), hasta, enUnaFrase: frase, vistas, acciones: acciones.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3) };
}

export function pulsoParaElLunes(p: Pulso): SeccionDelLunes {
  const v = p.vistas[0]!;
  if (v.estado === 'n/a' && v.lineas.length === 0) return { fuente: 'ventas', titulo: 'Cómo le fue al crecimiento', estado: 'sin-datos', motivo: v.motivo, hallazgos: [], acciones: [] };
  return { fuente: 'ventas', titulo: 'Cómo le fue al crecimiento', estado: 'ok', motivo: null, hallazgos: [p.enUnaFrase, ...v.lineas, ...p.vistas[3]!.lineas.slice(0, 2)], acciones: p.acciones };
}
