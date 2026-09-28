/**
 * Presentacion pura: textos y colores de estados, reglas, semaforo. Sin React.
 */
import type { EstadoFila, EstadoRevision, EstadoSemaforo, Evento, Regla, TipoEvento } from './nucleo.ts';

export const COLOR_SEMAFORO: Record<EstadoSemaforo, string> = {
  vigente: 'bg-emerald-600 text-white',
  alerta: 'bg-amber-400 text-neutral-950',
  promocion: 'bg-orange-500 text-white',
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

/** Del peor al mejor, para leyendas y totales. */
export const ORDEN_SEMAFORO: readonly EstadoSemaforo[] = ['vencido', 'retiro', 'promocion', 'alerta', 'vigente'];

/** «sha256:3f9a…c21e» para leer un hash a ojo sin perder las puntas. */
export function hashCorto(h: string | undefined | null): string {
  if (!h) return '—';
  const x = h.replace(/^sha256:/, '');
  return `${x.slice(0, 8)}…${x.slice(-4)}`;
}

/** «26/09 14:05» en la zona del navegador. */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

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

export const TEXTO_EVENTO: Record<TipoEvento, string> = {
  RECIBIDO: 'Recibido', RECHAZADO: 'Rechazado', UBICADO: 'Ubicado', MOVIDO: 'Movido', TRANSFERIDO: 'Transferido', VENDIDO: 'Vendido', DEVUELTO: 'Devuelto',
  DONADO: 'Donado', MERMA: 'Merma', RECOMENDACION: 'Recomendación del agente', RECOMENDACION_EJECUTADA: 'Recomendación ejecutada',
  RECOMENDACION_DESCARTADA: 'Recomendación descartada', CORRECCION: 'Corrección', CONTEO: 'Conteo físico', EN_REVISION: 'Caducidad por confirmar (foto)', TAREA_CERRADA: 'Tarea de la ronda', HALLAZGO: 'Hallazgo en piso',
};

export const COLOR_EVENTO: Partial<Record<TipoEvento, string>> = {
  RECHAZADO: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200', CORRECCION: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  RECOMENDACION: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200', RECOMENDACION_EJECUTADA: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  RECOMENDACION_DESCARTADA: 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200', MERMA: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
  CONTEO: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200', EN_REVISION: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  TAREA_CERRADA: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200', HALLAZGO: 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200',
};

export const TEXTO_CLASE: Record<string, string> = { cuadra: 'Cuadra', faltante: 'Faltante', sobrante: 'Sobrante', desconocido: 'Lote desconocido' };
export const COLOR_CLASE: Record<string, string> = {
  cuadra: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200', faltante: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  sobrante: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200', desconocido: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
};

const ZONA_LEGIBLE: Record<string, string> = { recibo: 'recibo', almacen: 'almacén', piso: 'piso de venta', merma: 'merma' };

/** Lo que dice un evento, en una linea, a partir de sus datos. */
/** La foto del inventario de una recepcion, en una linea: el articulo en el sitio y el lote. */
export function textoInventario(i: { antes: { lote: number; articulo: number }; despues: { lote: number; articulo: number } }): string {
  return `existencia en el sitio: ${i.antes.articulo} → ${i.despues.articulo} caja(s) del artículo (de este lote: ${i.antes.lote} → ${i.despues.lote})`;
}

const esInventario = (x: unknown): x is Parameters<typeof textoInventario>[0] =>
  typeof x === 'object' && x !== null && typeof (x as { antes?: { articulo?: unknown } }).antes?.articulo === 'number' && typeof (x as { despues?: { articulo?: unknown } }).despues?.articulo === 'number';

export function describeEvento(ev: Evento): string {
  const d = ev.datos;
  const n = (k: string) => (typeof d[k] === 'number' ? Number(d[k]) : undefined);
  const t = (k: string) => (typeof d[k] === 'string' ? String(d[k]) : undefined);
  const cajas = n('cajas') !== undefined ? `${n('cajas')} caja(s)` : '';
  switch (ev.tipo) {
    case 'EN_REVISION': {
      const p = (d['propuesta'] ?? {}) as { estado?: string; fecha?: string; lote?: string; motor?: string };
      return [`${cajas} por confirmar (folio ${ev.lote.lote})`, p.fecha ? `la máquina propuso ${p.fecha}${p.lote ? ` · lote ${p.lote}` : ''}` : `la máquina no propuso fecha (${p.estado})`, p.motor ? `motor ${p.motor}` : '', t('reemplaza') ? 'otra toma de la misma recepción' : ''].filter(Boolean).join(' · ');
    }
    case 'RECIBIDO': return [`${cajas} en ${ZONA_LEGIBLE[t('zona') ?? ''] ?? t('zona')}`, esInventario(d['existencia']) ? textoInventario(d['existencia']) : '', lecturaLegible(d['lectura']), t('desde') ? `transferidas desde ${t('desde')}` : '', d['apertura'] ? 'inventario inicial (apertura)' : '', n('diasRestantes') !== undefined ? `le quedaban ${n('diasRestantes')} días (mínimo ${n('minimoDias')})` : ''].filter(Boolean).join(' · ');
    case 'RECHAZADO': return d['descartada'] ? `${cajas} · revisión descartada: ${t('motivo')}` : `${cajas} · ${t('regla')} · le quedaban ${n('diasRestantes')} días · devolución ${t('devolucion')}${d['lectura'] && typeof d['lectura'] === 'object' ? ` · ${lecturaLegible(d['lectura'])}` : ''}`;
    case 'UBICADO': return `${cajas} en rack ${t('posicion')}`;
    case 'MOVIDO': return `${cajas} a ${ZONA_LEGIBLE[t('a') ?? ''] ?? t('a')}${t('sscc') ? ` (tarima ${t('sscc')})` : ''}`;
    case 'TRANSFERIDO': return `${cajas} a ${t('destino')}${t('recomendacion') ? ' (por recomendación del agente)' : ''}`;
    case 'VENDIDO': return `${cajas}${t('canal') === 'liquidacion' ? ` en liquidación, autorizó ${t('autoriza')}` : ''}`;
    case 'DONADO': return `${cajas} · autorizó ${t('autoriza')}`;
    case 'DEVUELTO': case 'MERMA': return [cajas, t('motivo')].filter(Boolean).join(' · ');
    case 'RECOMENDACION': return t('texto') ?? '';
    case 'RECOMENDACION_EJECUTADA': return `ejecutó ${ev.operador}${t('nota') ? ` · ${t('nota')}` : ''}`;
    case 'RECOMENDACION_DESCARTADA': return `descartó ${ev.operador} · ${t('motivo')}`;
    case 'CONTEO': {
      const rs = Array.isArray(d['renglones']) ? (d['renglones'] as { zona?: string; contado?: number; diferencia?: number }[]) : [];
      const dif = rs.reduce((s, r) => s + (r.diferencia ?? 0), 0);
      return `inventario físico ${t('folio')} · contadas ${rs.reduce((s, r) => s + (r.contado ?? 0), 0)} caja(s) · ${dif === 0 ? 'cuadra' : `diferencia ${dif > 0 ? '+' : ''}${dif}`}${t('autoriza') ? ` · autorizó ${t('autoriza')}` : ''}`;
    }
    case 'TAREA_CERRADA': return `${t('tipoTarea')} cerrada con un escaneo en ${t('ubicacion')} (ronda ${t('ronda')})`;
    case 'HALLAZGO': {
      const l = (d['leido'] ?? {}) as { fecha?: string; lote?: string };
      return `pieza en ${t('ubicacion')} que no cuadra con ningún lote del sitio · leído ${l.fecha ?? 'sin fecha'}${l.lote ? `, lote ${l.lote}` : ''} · ${t('motivo')}`;
    }
    case 'CORRECCION': return [`corrige el evento #${n('seqCorregido')}: ${t('motivo')}`, d['ajuste'] ? `ajuste de cajas` : '', t('caducidadNueva') ? `caducidad ${t('caducidadAnterior')} → ${t('caducidadNueva')}` : '', d['evidencia'] ? 'con foto de evidencia' : ''].filter(Boolean).join(' · ');
  }
}

/** «leyó 30/05/27 · confirmada 31/05/27 (corregida)» a partir de `datos.lectura` de un RECIBIDO por foto. */
export function lecturaLegible(l: unknown): string {
  if (!l || typeof l !== 'object') return '';
  const x = l as { propuesta?: { fecha?: string }; confirmada?: { caducidad?: string; lote?: string; tipo?: string }; corregida?: { fecha?: boolean; lote?: boolean } };
  const leido = x.propuesta?.fecha ? `la máquina leyó ${x.propuesta.fecha}` : 'la máquina no propuso fecha';
  const corr = [x.corregida?.fecha ? 'fecha corregida' : '', x.corregida?.lote ? 'lote corregido' : ''].filter(Boolean).join(' y ');
  return `${leido} · confirmada ${x.confirmada?.caducidad ?? '?'}${x.confirmada?.tipo === 'consumo-preferente' ? ' (consumo preferente)' : ''}${corr ? ` (${corr})` : ' (tal cual)'}`;
}
