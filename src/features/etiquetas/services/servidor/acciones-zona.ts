/**
 * Escanear por zona, la ronda del dia, el tablero del supervisor y la pieza suelta (servidor).
 *
 * - `escanea` corre ENTERO en una transaccion: la ronda de hoy (si no existe, se genera y se
 *   guarda), el escaneo en su zona con su rol, y la respuesta guardada por su `idCliente`: si la
 *   cola sin señal reintenta, el mismo escaneo no se aplica dos veces.
 * - Al ALMACENISTA la vista le llega sin cantidades del sistema (`vistaSinCantidades`).
 * - La foto de la pieza suelta se lee FUERA de la transaccion (el motor tarda).
 */
import {
  aseguraRonda, concilia, conteoDe, deshazMovimiento, diaDelSitio, ejecutaEscaneo, estadoDeTareas, identificaPieza, leeYPropone, proponCaducidad, registraHallazgo, rondaDe, vistaSinCantidades,
  type EstadoAlmacen, type RolZona,
} from '../nucleo.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { avisaCabezas, seudonimosDelServidor } from './expediente.ts';
import { fotoGuardada, fotosDelServidor, imagenes, motorDelServidor } from './fotos.ts';
import type { Rol } from './roles.ts';

type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });
const mal = (status: number, error: string): Respuesta => ({ status, cuerpo: { error } });
type Accion<N extends string> = Extract<AccionEtiquetas, { accion: N }>;

export const ACCIONES_ZONA: ReadonlySet<string> = new Set(['escanea', 'deshaz', 'ronda', 'dia', 'identifica-pieza', 'registra-hallazgo']);

/** Hora local `HH:MM` en la zona de la operacion. */
export function horaLocal(zona = process.env['ETIQUETAS_ZONA'] || 'America/Mexico_City'): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}

const rolZona = (rol: Rol): RolZona | undefined => (rol === 'operacion' || rol === 'recibo' || rol === 'almacenista' ? rol : undefined);
const MAX_IDEMPOTENCIA = 1000;

function recuerda(e: EstadoAlmacen, clave: string, respuesta: unknown, cuando: string): EstadoAlmacen {
  const todas = Object.entries({ ...(e.idempotencia ?? {}), [clave]: { fecha: cuando, respuesta } }).sort((a, b) => b[1].fecha.localeCompare(a[1].fecha)).slice(0, MAX_IDEMPOTENCIA);
  return { ...e, idempotencia: Object.fromEntries(todas) };
}

async function escanea(a: Accion<'escanea'>, operador: string, rol: Rol): Promise<Respuesta> {
  const rz = rolZona(rol);
  if (!rz) return mal(403, 'este dispositivo no escanea por zona');
  const op = await seudonimosDelServidor().de(operador);
  const cuando = new Date().toISOString();
  const hoy = hoyIso();
  const clave = `${a.sitio}|${a.idCliente}`;
  type Salida = { respuesta: unknown; eventos: number; repetido: boolean };
  const r = await almacenDelServidor().transaccion<Salida>((e0) => {
    const previa = e0.idempotencia?.[clave];
    if (previa) return { estado: e0, resultado: { respuesta: previa.respuesta, eventos: 0, repetido: true } };
    const g = aseguraRonda(e0, a.sitio, hoy, { ahora: cuando });
    const x = ejecutaEscaneo(g.estado, { sitio: a.sitio, zona: a.zona, ...(a.posicion ? { posicion: a.posicion } : {}), texto: a.texto, ...(a.veces ? { veces: a.veces } : {}), ...(a.todas ? { todas: true } : {}), ...(a.motivo ? { motivo: a.motivo } : {}), rol: rz, operador: op, hoy, cuando, id: `esc-${Date.now()}`, hora: horaLocal() }, g.ronda);
    const vista = rz === 'almacenista' ? vistaSinCantidades(x.vista) : x.vista;
    const respuesta = { ok: x.vista.tipo !== 'error', vista, eventos: x.eventos.map((v) => ({ seq: v.seq, tipo: v.tipo, hash: v.hash })) };
    return { estado: recuerda(x.estado, clave, respuesta, cuando), resultado: { respuesta, eventos: x.eventos.length, repetido: false } };
  });
  if (r.eventos) await avisaCabezas(await almacenDelServidor().lee(), [a.sitio]);
  return ok({ ...(r.respuesta as object), ...(r.repetido ? { repetido: true } : {}) });
}

async function deshaz(a: Accion<'deshaz'>, operador: string): Promise<Respuesta> {
  const op = await seudonimosDelServidor().de(operador);
  const r = await almacenDelServidor().transaccion((e) => { const p = deshazMovimiento(e, a.sitio, a.evento, op, new Date().toISOString(), `dsh-${Date.now()}`); return { estado: p.estado, resultado: p.resultado }; });
  if (!r.ok) return ok({ ok: false, motivo: r.motivo });
  await avisaCabezas(await almacenDelServidor().lee(), [a.sitio]);
  return ok({ ok: true, evento: { seq: r.eventos[0]!.seq, tipo: 'CORRECCION', hash: r.eventos[0]!.hash } });
}

/** La ronda de hoy con el estado de cada tarea (se genera la primera vez que alguien la pide). */
async function ronda(a: Accion<'ronda'>): Promise<Respuesta> {
  const hoy = hoyIso();
  const g = await almacenDelServidor().transaccion((e) => { const x = aseguraRonda(e, a.sitio, hoy, { ahora: new Date().toISOString() }); return { estado: x.estado, resultado: x.ronda }; });
  const e = await almacenDelServidor().lee();
  const tareas = estadoDeTareas(e, g, horaLocal());
  return ok({ ronda: { id: g.id, sitio: g.sitio, fecha: g.fecha, generada: g.generada }, tareas, hora: horaLocal() });
}

async function dia(a: Accion<'dia'>): Promise<Respuesta> {
  const hoy = hoyIso();
  await almacenDelServidor().transaccion((e) => { const x = aseguraRonda(e, a.sitio, hoy, { ahora: new Date().toISOString() }); return { estado: x.estado, resultado: null }; });
  const e = await almacenDelServidor().lee();
  const fuera = (folio: string) => { const c = conteoDe(e, folio); return c ? concilia(e, c).filter((r) => !r.dentroTolerancia).length : 0; };
  return ok(diaDelSitio(e, a.sitio, hoy, horaLocal(), new Date().toISOString(), rondaDe(e, a.sitio, hoy), fuera));
}

async function identificaPiezaSuelta(a: Accion<'identifica-pieza'>, rol: Rol): Promise<Respuesta> {
  const fotos = await Promise.all([a.foto, ...a.tomas].map(fotoGuardada));
  if (fotos.some((f) => !f)) return mal(404, 'falta una de las fotos: vuelve a tomarla');
  const recortes = await Promise.all(fotos.map((f) => imagenes.recorta(f!.bytes, a.zona, f!)));
  const huellas = await Promise.all(recortes.map((x) => fotosDelServidor().guarda(x, 'png')));
  const e = await almacenDelServidor().lee();
  const motor = motorDelServidor();
  if (!motor) return ok({ ok: false, motivo: 'no hay motor de lectura instalado: lee la fecha de la pieza y elige el lote a mano' });
  const propuesta = await leeYPropone(motor, recortes.slice(0, 2), { hoy: hoyIso() }, fotos[0]!.bytes);
  const id = identificaPieza(e, a.sitio, a.sku, propuesta, hoyIso());
  // El almacenista no ve cantidades: la identificacion no las lleva (lote, fecha, semaforo, ubicacion).
  void rol;
  return ok({ ok: true, identificacion: id, recortes: huellas, textoLeido: propuesta.textoLeido, mensajePropuesta: propuesta.mensaje });
}

async function hallazgo(a: Accion<'registra-hallazgo'>, operador: string): Promise<Respuesta> {
  for (const h of [a.foto, ...a.recortes]) if (!(await fotosDelServidor().lee(h))) return mal(404, 'esa foto no se subió a este servidor');
  const op = await seudonimosDelServidor().de(operador);
  // Lo leido se vuelve a interpretar AQUI (el analizador es determinista): no se confia en una fecha que diga el navegador.
  const propuesta = proponCaducidad([{ motor: 'texto-del-cliente', ms: 0, lineas: a.textoLeido.map((texto) => ({ texto })) }], { hoy: hoyIso() });
  const folio = `HAL-${Date.now().toString(36).toUpperCase()}`;
  const r = await almacenDelServidor().transaccion((e) => { const p = registraHallazgo(e, { sitio: a.sitio, sku: a.sku, zona: 'piso', fotos: { completa: a.foto, recortes: a.recortes }, propuesta, ...(a.motivo ? { motivo: a.motivo } : {}) }, new Date().toISOString(), folio, op); return { estado: p.estado, resultado: p.resultado }; });
  if (!r.ok) return ok({ ok: false, motivo: r.motivo });
  await avisaCabezas(await almacenDelServidor().lee(), [a.sitio]);
  return ok({ ok: true, folio, evento: { seq: r.eventos[0]!.seq, tipo: 'HALLAZGO', hash: r.eventos[0]!.hash } });
}

export async function ejecutaZona(a: AccionEtiquetas, operador: string, rol: Rol): Promise<Respuesta> {
  switch (a.accion) {
    case 'escanea': return escanea(a, operador, rol);
    case 'deshaz': return deshaz(a, operador);
    case 'ronda': return ronda(a);
    case 'dia': return dia(a);
    case 'identifica-pieza': return identificaPiezaSuelta(a, rol);
    case 'registra-hallazgo': return hallazgo(a, operador);
    default: return mal(400, 'acción desconocida');
  }
}
