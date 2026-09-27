/**
 * Roles del dispositivo. El rol lo decide el SERVIDOR por el codigo con que se empareja el
 * dispositivo, nunca el navegador: un `x-rol` que el contador pudiera cambiar no seria un rol.
 *
 * - `operacion` (`ETIQUETAS_TOKEN`): todo, incluido abrir, conciliar y aplicar conteos.
 * - `conteo` (`ETIQUETAS_TOKEN_CONTEO`): solo contar. No recibe existencias, ni lo esperado, ni
 *   la conciliacion, ni el tamano de una tarima: nada que diga cuanto hay segun el sistema.
 *
 * Puro (sin Next) para probarlo con node --test.
 */
import { timingSafeEqual } from 'node:crypto';
import { concilia, type Conteo, type EstadoAlmacen } from '../nucleo.ts';

export type Rol = 'operacion' | 'conteo';

/** Lo unico que un dispositivo de conteo puede pedir. */
export const ACCIONES_CONTEO: ReadonlySet<string> = new Set(['conteos', 'conteo-lee', 'conteo-cierra']);

export const permitida = (rol: Rol, accion: string): boolean => rol === 'operacion' || ACCIONES_CONTEO.has(accion);

const igual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Que rol abre el codigo dado. Se comparan los dos en tiempo constante, siempre. */
export function rolDeToken(dado: string, tokens: { readonly operacion?: string | undefined; readonly conteo?: string | undefined }): Rol | undefined {
  const valido = (t: string | undefined): t is string => typeof t === 'string' && t.length >= 16;
  const esOperacion = valido(tokens.operacion) && igual(dado, tokens.operacion);
  const esConteo = valido(tokens.conteo) && tokens.conteo !== tokens.operacion && igual(dado, tokens.conteo);
  return esOperacion ? 'operacion' : esConteo ? 'conteo' : undefined;
}

/**
 * Lo que se muestra de un conteo. Mientras se cuenta es ciego para todos; en la ronda 2 no se ve
 * la ronda 1. Al rol de conteo, ademas, nunca le llega la conciliacion: ni al cerrar, ni aplicado.
 */
export function vistaConteo(e: EstadoAlmacen, c: Conteo, rol: Rol) {
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
