/**
 * «Como me va», puro y con la fecha de hoy inyectada: dictados y palabras por dia y por semana,
 * racha de dias, latencias p50/p95, motor mas usado, y lo que solo saben las trayectorias de forma
 * (sin voz, repeticiones con el respaldo, microfono saturado o flojo). Cifras con su fuente;
 * nunca un puntaje.
 */
import { diaLocal } from './busqueda.ts';
import type { Dictado, TrayectoriaResumen } from './tipos.ts';

export const cuentaPalabras = (texto: string): number => texto.trim().split(/\s+/).filter((p) => p.length > 0).length;

export const percentil = (xs: readonly number[], p: number): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? null;
};

export interface DiaResumen {
  dia: string;
  dictados: number;
  palabras: number;
}

/** Un resumen por dia, del mas antiguo al mas reciente, solo los dias con algo. */
export function porDia(entradas: readonly Dictado[]): DiaResumen[] {
  const mapa = new Map<string, DiaResumen>();
  for (const e of entradas) {
    const dia = diaLocal(e.fecha);
    const r = mapa.get(dia) ?? { dia, dictados: 0, palabras: 0 };
    r.dictados += 1;
    r.palabras += cuentaPalabras(e.texto);
    mapa.set(dia, r);
  }
  return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

const diaMas = (dia: string, n: number): string => {
  const [a, m, d] = dia.split('-').map(Number);
  const f = new Date(a ?? 0, (m ?? 1) - 1, (d ?? 1) + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

/** Los ultimos `n` dias hasta `hoy` inclusive, con ceros donde no hubo nada (para pintar barras). */
export function ultimosDias(entradas: readonly Dictado[], hoy: string, n = 14): DiaResumen[] {
  const con = new Map(porDia(entradas).map((r) => [r.dia, r]));
  const salida: DiaResumen[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const dia = diaMas(hoy, -k);
    salida.push(con.get(dia) ?? { dia, dictados: 0, palabras: 0 });
  }
  return salida;
}

export interface Racha {
  dias: number;
  /** Si el ultimo dia de la racha es hoy; si no, llega hasta ayer. */
  hastaHoy: boolean;
}

/** Dias seguidos con al menos un dictado, contando hacia atras desde hoy (o desde ayer si hoy no hay). */
export function racha(entradas: readonly Dictado[], hoy: string): Racha {
  const dias = new Set(porDia(entradas).map((r) => r.dia));
  const hastaHoy = dias.has(hoy);
  let cursor = hastaHoy ? hoy : diaMas(hoy, -1);
  let n = 0;
  while (dias.has(cursor)) {
    n += 1;
    cursor = diaMas(cursor, -1);
  }
  return { dias: n, hastaHoy };
}

export interface ResumenLatencia {
  p50: number | null;
  p95: number | null;
  medidas: number;
}

export function latencias(entradas: readonly Dictado[]): ResumenLatencia {
  const xs = entradas.map((e) => e.latenciaMs).filter((x): x is number => x !== null && Number.isFinite(x));
  return { p50: percentil(xs, 0.5), p95: percentil(xs, 0.95), medidas: xs.length };
}

export function motorMasUsado(entradas: readonly Dictado[]): { motor: string; dictados: number } | undefined {
  const cuenta = new Map<string, number>();
  for (const e of entradas) cuenta.set(e.motor, (cuenta.get(e.motor) ?? 0) + 1);
  let mejor: { motor: string; dictados: number } | undefined;
  for (const [motor, dictados] of cuenta) if (!mejor || dictados > mejor.dictados) mejor = { motor, dictados };
  return mejor;
}

export interface ResumenTrayectorias {
  sesiones: number;
  turnos: number;
  sinVoz: number;
  respaldo: number;
  muertesCaptura: number;
  saturaciones: number;
  flojos: number;
  latenciaP50Ms: number | null;
}

/** Lo que las trayectorias de forma saben y el historial no. */
export function resumeTrayectorias(ts: readonly TrayectoriaResumen[]): ResumenTrayectorias {
  const suma = (f: (t: TrayectoriaResumen) => number) => ts.reduce((s, t) => s + f(t), 0);
  return {
    sesiones: ts.length,
    turnos: suma((t) => t.turnos),
    sinVoz: suma((t) => t.sinVoz),
    respaldo: suma((t) => t.respaldo),
    muertesCaptura: suma((t) => t.muertesCaptura),
    saturaciones: ts.filter((t) => t.picoDbMax !== null && t.picoDbMax > -3).length,
    flojos: ts.filter((t) => t.picoDbMin !== null && t.picoDbMin < -45).length,
    latenciaP50Ms: percentil(ts.map((t) => t.latenciaP50Ms).filter((x): x is number => x !== null), 0.5),
  };
}

export interface Estadisticas {
  hoy: string;
  total: number;
  palabrasTotales: number;
  ultimosDias: DiaResumen[];
  semana: { dictados: number; palabras: number; latencia: ResumenLatencia };
  semanaAnterior: { dictados: number; palabras: number };
  racha: Racha;
  latenciaTotal: ResumenLatencia;
  motor: { motor: string; dictados: number } | undefined;
  trayectorias: ResumenTrayectorias;
}

const enRango = (entradas: readonly Dictado[], desde: string, hasta: string): Dictado[] => entradas.filter((e) => { const d = diaLocal(e.fecha); return d >= desde && d <= hasta; });

export function calculaEstadisticas(entradas: readonly Dictado[], trayectorias: readonly TrayectoriaResumen[], hoy: string): Estadisticas {
  const semana = enRango(entradas, diaMas(hoy, -6), hoy);
  const anterior = enRango(entradas, diaMas(hoy, -13), diaMas(hoy, -7));
  const palabras = (xs: readonly Dictado[]) => xs.reduce((s, e) => s + cuentaPalabras(e.texto), 0);
  return {
    hoy,
    total: entradas.length,
    palabrasTotales: palabras(entradas),
    ultimosDias: ultimosDias(entradas, hoy, 14),
    semana: { dictados: semana.length, palabras: palabras(semana), latencia: latencias(semana) },
    semanaAnterior: { dictados: anterior.length, palabras: palabras(anterior) },
    racha: racha(entradas, hoy),
    latenciaTotal: latencias(entradas),
    motor: motorMasUsado(entradas),
    trayectorias: resumeTrayectorias(trayectorias),
  };
}
