/**
 * Anuncios desde la EXPORTACIÓN del Administrador de anuncios (Meta, Google o TikTok). Adaptado de
 * `ad-manager` en su «modo CSV», que aquí es el único: se diagnostica y se recomienda, y el dueño
 * hace el clic. Reglas de la fuente (`reference/diagnostics.md`, `change_playbook.md`):
 *  - semáforo contra el promedio PROPIO, no contra referencias de internet;
 *  - mínimos antes de concluir: campaña nueva 7 días; pausar con 30 días o 50 resultados;
 *  - «sin veredicto» es un estado real (sin medición de conversiones o bajo el mínimo);
 *  - «Resultados» de distinto tipo no se suman;
 *  - dinero en monto MENSUAL absoluto; subir como máximo 20 % por paso.
 */
import { columna, leeCsv } from '../comun/csv.js';
import { leeImporte } from '../comun/dinero.js';
import { diasEntre, leeDia, ordenDeFechas, sumaDias, type Dia } from '../comun/fechas.js';
import { revisaTextoDeTerceros } from '../comun/no-confiable.js';

export type Veredicto = 'funciona' | 'vigilar' | 'problema' | 'sin-veredicto';

export interface Campana {
  readonly nombre: string;
  readonly gasto: number;
  readonly impresiones: number | null;
  readonly clics: number | null;
  /** `null` si la exportación no trae resultados: NO es cero. */
  readonly resultados: number | null;
  readonly tiposDeResultado: readonly string[];
  readonly frecuencia: number | null;
  readonly desde: Dia | null;
  readonly hasta: Dia | null;
  readonly dias: number;
  readonly costoPorResultado: number | null;
  readonly costoReciente: number | null;
  readonly diasSinResultados: number;
  readonly veredicto: Veredicto;
  readonly porque: string;
}

export interface Fila { readonly campana: string; readonly dia: Dia | null; readonly hasta: Dia | null; readonly gasto: number; readonly impresiones: number | null; readonly clics: number | null; readonly resultados: number | null; readonly tipo: string; readonly frecuencia: number | null }

export interface LecturaDeAnuncios {
  readonly filas: readonly Fila[];
  readonly moneda: string;
  readonly faltan: readonly string[];
  readonly rechazadas: readonly { readonly linea: number; readonly motivo: string }[];
}

const SIN = {
  campana: ['nombre de la campana', 'campana', 'campaign name', 'campaign'],
  gasto: ['importe gastado', 'gasto', 'costo', 'amount spent', 'cost', 'total spent'],
  impresiones: ['impresiones', 'impressions', 'impr'],
  clics: ['clics en el enlace', 'clics', 'link clicks', 'clicks'],
  resultados: ['resultados', 'conversiones', 'results', 'conversions', 'leads', 'compras'],
  tipo: ['tipo de resultado', 'indicador de resultado', 'result type', 'result indicator'],
  frecuencia: ['frecuencia', 'frequency'],
  dia: ['dia', 'fecha', 'inicio del informe', 'reporting starts', 'day', 'semana', 'week'],
  fin: ['fin del informe', 'reporting ends'],
} as const;

function numero(t: string | undefined): number | null {
  if (t === undefined || t.trim() === '' || t.trim() === '-') return null;
  const n = Number(t.replace(/[,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function leeAnuncios(texto: string): LecturaDeAnuncios {
  const t = leeCsv(texto);
  const col = Object.fromEntries(Object.entries(SIN).map(([k, s]) => [k, columna(t.encabezados, s)])) as Record<keyof typeof SIN, number>;
  const moneda = /usd|us\$|dolar/i.test(t.encabezados[col.gasto] ?? '') ? 'USD' : 'MXN';
  const faltan = (Object.keys(SIN) as (keyof typeof SIN)[]).filter((k) => col[k] < 0 && k !== 'fin' && k !== 'tipo');
  if (col.campana < 0 || col.gasto < 0) return { filas: [], moneda, faltan, rechazadas: [] };
  const orden = ordenDeFechas(t.filas.map((f) => f.celdas[col.dia] ?? '')).orden;
  const rechazadas = [...t.rechazadas];
  const filas: Fila[] = [];
  for (const f of t.filas) {
    const nombre = f.celdas[col.campana] ?? '';
    // Las filas de «Total» se exportan con la palabra en CUALQUIER columna (en Meta, en la del día):
    // sumarlas duplica el gasto. Una fila sin nombre de campaña tampoco es una campaña.
    if (!nombre.trim() || f.celdas.some((c) => /^(total|totales|resultados totales|total general)$/i.test(c.trim()))) continue;
    const gasto = leeImporte(f.celdas[col.gasto] ?? '');
    if (!gasto.ok) { rechazadas.push({ linea: f.linea, motivo: gasto.motivo }); continue; }
    filas.push({
      campana: revisaTextoDeTerceros(nombre, 120).texto, dia: col.dia >= 0 ? leeDia(f.celdas[col.dia] ?? '', orden) : null, hasta: col.fin >= 0 ? leeDia(f.celdas[col.fin] ?? '', orden) : null,
      gasto: gasto.centavos, impresiones: col.impresiones >= 0 ? numero(f.celdas[col.impresiones]) : null, clics: col.clics >= 0 ? numero(f.celdas[col.clics]) : null,
      resultados: col.resultados >= 0 ? numero(f.celdas[col.resultados]) : null, tipo: col.tipo >= 0 ? (f.celdas[col.tipo] ?? '').trim() : '', frecuencia: col.frecuencia >= 0 ? numero(f.celdas[col.frecuencia]) : null,
    });
  }
  return { filas, moneda, faltan, rechazadas };
}

function suma(xs: readonly (number | null)[]): number | null {
  return xs.every((x) => x === null) ? null : xs.reduce<number>((s, x) => s + (x ?? 0), 0);
}

function veredicto(c: Omit<Campana, 'veredicto' | 'porque'>): { veredicto: Veredicto; porque: string } {
  if (c.resultados === null) return { veredicto: 'sin-veredicto', porque: 'la exportación no trae resultados: se sabe cuánto costó el tráfico, no lo que produjo' };
  if (c.tiposDeResultado.length > 1) return { veredicto: 'sin-veredicto', porque: `mezcla resultados de distinto tipo (${c.tiposDeResultado.join(', ')}): no se suman` };
  if (c.dias < 7) return { veredicto: 'sin-veredicto', porque: `lleva ${c.dias} día(s): una campaña nueva se juzga a los 7 días` };
  if (c.diasSinResultados >= 14 && c.gasto > 0) return { veredicto: 'problema', porque: `lleva ${c.diasSinResultados} días gastando sin un solo resultado` };
  if (c.frecuencia !== null && c.frecuencia > 3) return { veredicto: 'vigilar', porque: `frecuencia ${c.frecuencia.toFixed(1)}: la misma gente ya lo vio más de 3 veces` };
  if (c.costoPorResultado === null || c.costoReciente === null) return { veredicto: 'sin-veredicto', porque: 'sin resultados suficientes para calcular un costo' };
  const cambio = (c.costoReciente - c.costoPorResultado) / c.costoPorResultado;
  if (cambio > 0.4) return { veredicto: 'problema', porque: `cada resultado cuesta ${Math.round(cambio * 100)}% más que tu propio promedio` };
  if (cambio > 0.15) return { veredicto: 'vigilar', porque: `cada resultado cuesta ${Math.round(cambio * 100)}% más que tu propio promedio` };
  return { veredicto: 'funciona', porque: 'cuesta lo mismo o menos que tu propio promedio' };
}

/** Por campaña: el promedio propio es todo el archivo (hasta 90 días); lo reciente, los últimos 30. */
export function campanas(l: LecturaDeAnuncios): Campana[] {
  const nombres = [...new Set(l.filas.map((f) => f.campana))];
  return nombres.map((nombre) => {
    const fs = l.filas.filter((f) => f.campana === nombre);
    const dias = fs.map((f) => f.dia).filter((d): d is Dia => d !== null).sort();
    const hastas = fs.map((f) => f.hasta ?? f.dia).filter((d): d is Dia => d !== null).sort();
    const desde = dias[0] ?? null, hasta = hastas[hastas.length - 1] ?? null;
    const gasto = fs.reduce((s, f) => s + f.gasto, 0);
    const resultados = suma(fs.map((f) => f.resultados));
    const recientes = hasta ? fs.filter((f) => f.dia && f.dia > sumaDias(hasta, -30)) : [];
    const resRec = suma(recientes.map((f) => f.resultados));
    const conResultado = fs.filter((f) => (f.resultados ?? 0) > 0 && f.dia).map((f) => f.dia!).sort();
    const ultimoConResultado = conResultado[conResultado.length - 1] ?? desde;
    const base = {
      nombre, gasto, impresiones: suma(fs.map((f) => f.impresiones)), clics: suma(fs.map((f) => f.clics)), resultados,
      tiposDeResultado: [...new Set(fs.map((f) => f.tipo).filter(Boolean))], frecuencia: fs.some((f) => f.frecuencia !== null) ? Math.max(...fs.map((f) => f.frecuencia ?? 0)) : null,
      desde, hasta, dias: desde && hasta ? diasEntre(desde, hasta) + 1 : 0,
      costoPorResultado: resultados ? gasto / resultados : null,
      costoReciente: resRec ? recientes.reduce((s, f) => s + f.gasto, 0) / resRec : null,
      diasSinResultados: hasta && ultimoConResultado && resultados !== null ? diasEntre(resultados > 0 ? ultimoConResultado : desde ?? hasta, hasta) : 0,
    };
    return { ...base, ...veredicto(base) };
  }).sort((a, b) => b.gasto - a.gasto);
}
