/**
 * Roles del dispositivo. El rol lo decide el SERVIDOR por el codigo con que se empareja el
 * dispositivo, nunca el navegador: un `x-rol` que el contador pudiera cambiar no seria un rol.
 *
 * - `operacion` (`ETIQUETAS_TOKEN`): el SUPERVISOR. Todo: abre, concilia y autoriza conteos, ve
 *   el tablero del dia.
 * - `recibo` (`ETIQUETAS_TOKEN_RECIBO`): recibir (directo o con foto) y confirmar.
 * - `almacenista` (`ETIQUETAS_TOKEN_ALMACEN`): la ronda, ubicar, mover, piso, merma y CONTAR A
 *   CIEGAS. Nunca recibe cantidades del sistema (decision del laboratorio): cuenta ciego.
 * - `conteo` (`ETIQUETAS_TOKEN_CONTEO`): solo contar. No recibe existencias, ni lo esperado, ni
 *   la conciliacion, ni el tamano de una tarima: nada que diga cuanto hay segun el sistema.
 *
 * Puro (sin Next) para probarlo con node --test.
 */
import { timingSafeEqual } from 'node:crypto';
import { concilia, vistaConteoSinCantidades, type Conteo, type EstadoAlmacen } from '../nucleo.ts';

export type Rol = 'operacion' | 'recibo' | 'almacenista' | 'conteo';

/** Lo unico que un dispositivo de conteo puede pedir. */
export const ACCIONES_CONTEO: ReadonlySet<string> = new Set(['conteos', 'conteo-lee', 'conteo-cierra']);

/** Lo que puede pedir cada rol que no es el supervisor. Lo que no esta aqui, 403. */
export const ACCIONES_DEL_ROL: Readonly<Record<Exclude<Rol, 'operacion'>, ReadonlySet<string>>> = {
  conteo: ACCIONES_CONTEO,
  recibo: new Set(['escanea', 'deshaz', 'ronda', 'recepcion', 'lee-caducidad', 'revision-confirma', 'revision-descarta', 'revisiones', 'vincula-gtin', 'foto-articulo', 'ticket', 'consumo']),
  almacenista: new Set(['escanea', 'deshaz', 'ronda', 'identifica-pieza', 'registra-hallazgo', 'foto-articulo', 'conteos', 'conteo-lee', 'conteo-cierra']),
};

export const permitida = (rol: Rol, accion: string): boolean => rol === 'operacion' || ACCIONES_DEL_ROL[rol].has(accion);

/**
 * Quien sube fotos: el supervisor, recibo (recepcion con foto) y el almacenista (la pieza suelta y
 * su hallazgo). El dispositivo de conteo no sube nada.
 */
export const subeFotos = (rol: Rol): boolean => rol !== 'conteo';

/** Quien cuenta a ciegas: no recibe cantidades del sistema en NINGUNA respuesta. */
export const cuentaACiegas = (rol: Rol): boolean => rol === 'conteo' || rol === 'almacenista';

const igual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Que rol abre el codigo dado. Se comparan los dos en tiempo constante, siempre. */
export interface Tokens {
  readonly operacion?: string | undefined;
  readonly conteo?: string | undefined;
  readonly recibo?: string | undefined;
  readonly almacenista?: string | undefined;
}

export function rolDeToken(dado: string, tokens: Tokens): Rol | undefined {
  const valido = (t: string | undefined): t is string => typeof t === 'string' && t.length >= 16;
  // Se comparan TODOS, siempre, en tiempo constante; un codigo repetido vale solo como el de mas poder.
  const pruebas: [Rol, string | undefined][] = [['operacion', tokens.operacion], ['recibo', tokens.recibo], ['almacenista', tokens.almacenista], ['conteo', tokens.conteo]];
  const aciertos = pruebas.map(([rol, t]) => (valido(t) && igual(dado, t) ? rol : undefined));
  const usados = new Set<string>();
  for (const [i, [, t]] of pruebas.entries()) {
    if (aciertos[i] && t && !usados.has(t)) return aciertos[i];
    if (t) usados.add(t);
  }
  return undefined;
}

/**
 * Lo que se muestra de un conteo. Mientras se cuenta es ciego para todos; en la ronda 2 no se ve
 * la ronda 1. Al rol de conteo, ademas, nunca le llega la conciliacion: ni al cerrar, ni aplicado.
 */
export function vistaConteo(e: EstadoAlmacen, c: Conteo, rol: Rol, seudonimo?: string) {
  if (rol === 'almacenista') return vistaConteoSinCantidades(c, seudonimo);
  const { lecturas, recontar, aplicado, ...resto } = c;
  const recontarLegible = recontar.map((k) => { const [gtin = '', lote = '', caducidad = '', zona = '', sscc = ''] = k.split('|'); return { gtin, lote, caducidad, zona, ...(sscc ? { sscc } : {}) }; });
  const contando = c.estado === 'contando' || c.estado === 'reconteo';
  if (rol === 'conteo') {
    // Una tarima leida por su SSCC entra con la cantidad registrada: al contador no se le dice.
    const propias = contando ? lecturas.filter((x) => x.ronda === c.ronda).map((x) => (x.porRegistro ? { ...x, cajas: 0 } : x)) : [];
    return { ...resto, recontar: contando ? recontarLegible : [], lecturas: propias, ...(aplicado ? { aplicado: { fecha: aplicado.fecha } } : {}) };
  }
  if (contando) return { ...resto, recontar: recontarLegible, lecturas: lecturas.filter((x) => x.ronda === c.ronda) };
  // Aplicado: la foto que se sello en el acta. Recalcularla veria ya el ajuste en la cadena.
  return { ...resto, recontar: recontarLegible, lecturas, ...(aplicado ? { aplicado } : {}), conciliacion: aplicado?.renglones ?? (c.estado === 'cancelado' ? [] : concilia(e, c)) };
}
