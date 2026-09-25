/**
 * Presentacion pura: textos y colores de estados, reglas, semaforo. Sin React.
 */
import type { EstadoFila, EstadoRevision, EstadoSemaforo, Regla } from './nucleo.ts';

export const COLOR_SEMAFORO: Record<EstadoSemaforo, string> = {
  vigente: 'bg-emerald-600 text-white',
  alerta: 'bg-amber-400 text-neutral-950',
  retiro: 'bg-red-600 text-white',
  vencido: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
};

export const PUNTO_REVISION: Record<EstadoRevision, string> = {
  ok: 'bg-emerald-600',
  aviso: 'bg-amber-500',
  error: 'bg-red-600',
  info: 'border-2 border-neutral-400 bg-transparent',
};

export const TEXTO_REGLA: Record<Regla, string> = {
  fabricante: 'Del fabricante (se conserva)',
  propio: 'Marca propia: asignado con el prefijo de la casa',
  'propio-existente': 'Marca propia (ya lo tenía)',
  'derivado-caja': 'Caja de marca propia (indicador 1-8)',
  'igual-unidad': 'La caja es la unidad de venta',
  interno: 'Interno: circulación restringida, solo en la cadena',
  'interno-existente': 'Interno (ya lo tenía)',
};

export const COLOR_FILA: Record<EstadoFila, string> = {
  nuevo: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  cambiado: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  'sin-cambio': 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  conflicto: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  invalido: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
};

export const TEXTO_FILA: Record<EstadoFila, string> = {
  nuevo: 'Nuevo', cambiado: 'Cambia', 'sin-cambio': 'Sin cambio', conflicto: 'Conflicto', invalido: 'Inválido',
};

/** «0 9521234 00002 0» para leer un GTIN-14 a ojo. */
export function gtinLegible(g: string | undefined): string {
  if (!g) return '—';
  return g.length === 14 ? `${g[0]} ${g.slice(1, 8)} ${g.slice(8, 13)} ${g[13]}` : g;
}

/** Hoy en la zona del navegador, AAAA-MM-DD. */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function resumenLegible(resumen: Readonly<Record<string, number>>): { clave: string; texto: string; n: number }[] {
  const nombres: Record<string, string> = {
    filas: 'filas leídas', 'codigos-validados': 'códigos validados', nuevo: 'nuevos', cambiado: 'cambian', 'sin-cambio': 'sin cambio',
    conflicto: 'conflictos', invalido: 'inválidos', 'filas-con-error': 'filas con error',
  };
  return Object.entries(resumen).filter(([, n]) => n > 0).map(([clave, n]) => {
    const [tipo, regla] = clave.split(':') as [string, Regla | undefined];
    const texto = regla ? `${tipo === 'asignado' ? 'asignados' : 'registrados'} · ${TEXTO_REGLA[regla] ?? regla}` : nombres[clave] ?? clave;
    return { clave, texto, n };
  });
}
