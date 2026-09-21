/**
 * Voz picking: la maquina lee la linea del pedido, la persona confirma de viva voz. Reglas puras,
 * sin modelo: la cantidad se entiende con la gramatica unica de `tools/dictado` (cifras, palabras,
 * decimales, colectivos, unidad), y la sesion lleva la cuenta: tres intentos por linea y, si no
 * sale, la linea pasa «a mano» con su incidencia. Un «no» con cantidad («no, faltan dos»; «no, son
 * cuatro») se registra como incidencia y NO confirma: confirmar mal es el unico error que aqui no
 * se perdona.
 */
import { parseaCantidad } from '../../../../tools/dictado/dist/index.js';
import { quitaAcentos } from './texto.ts';

export interface LineaPedido {
  ubicacion: string;
  producto: string;
  cantidad: number;
  /** Unidad de la linea (unidad, caja, kilo…), en singular. */
  unidad?: string;
}

export type VeredictoConfirmacion =
  | { tipo: 'ok'; oido: number }
  | { tipo: 'no'; oido?: number }
  | { tipo: 'cantidad-distinta'; oido: number }
  | { tipo: 'unidad-distinta'; oido: number; unidad: string }
  | { tipo: 'repetir' }
  | { tipo: 'no-entendi' }
  /** «sí» sin cantidad: no confirma, se pide la cantidad. */
  | { tipo: 'sin-cantidad' };

const PLURAL: Record<string, string> = { unidad: 'unidades', caja: 'cajas', pieza: 'piezas', kilo: 'kilos', litro: 'litros', metro: 'metros', par: 'pares', bolsa: 'bolsas', paquete: 'paquetes', rollo: 'rollos', tarima: 'tarimas', charola: 'charolas', botella: 'botellas', lata: 'latas', saco: 'sacos', tramo: 'tramos', gramo: 'gramos' };

export const nombraCantidad = (cantidad: number, unidad = 'unidad'): string => `${cantidad} ${cantidad === 1 ? unidad : (PLURAL[unidad] ?? `${unidad}s`)}`;

/** Lo que la maquina lee en voz alta: ubicacion, producto y cantidad, y pide confirmar. */
export function fraseParaLeer(linea: LineaPedido, numero: number, total: number): string {
  return `Línea ${numero} de ${total}. ${linea.ubicacion}. ${linea.producto}. ${nombraCantidad(linea.cantidad, linea.unidad)}. Confirma la cantidad.`;
}

const NEGACION = /\b(no|falta|faltan|sobra|sobran|incorrecto|mal|equivocad[oa])\b/;
/** Confirmaciones sin cantidad: se reconocen para decir POR QUE no bastan, nunca para confirmar. */
const SI_A_SECAS = /^\s*(si|sí|correcto|confirmo|confirmado|exacto|ok|okey|listo|dale|va|afirmativo|asi es|eso es)\s*[.!]?\s*$/;

export function evaluaConfirmacion(dicho: string, linea: LineaPedido): VeredictoConfirmacion {
  const t = quitaAcentos(dicho.toLowerCase()).replace(/[¿?¡!]/g, '').trim();
  if (/\b(repite|repetir|otra vez|de nuevo|repiteme)\b/.test(t)) return { tipo: 'repetir' };
  const cantidad = parseaCantidad(t);
  if (NEGACION.test(t)) return cantidad ? { tipo: 'no', oido: cantidad.valor } : { tipo: 'no' };
  if (!cantidad) return SI_A_SECAS.test(t) ? { tipo: 'sin-cantidad' } : { tipo: 'no-entendi' };
  if (cantidad.valor !== linea.cantidad) return { tipo: 'cantidad-distinta', oido: cantidad.valor };
  const unidadLinea = linea.unidad ?? 'unidad';
  if (cantidad.unidad && cantidad.unidad !== unidadLinea && !(unidadLinea === 'unidad' && cantidad.unidad === 'pieza')) return { tipo: 'unidad-distinta', oido: cantidad.valor, unidad: cantidad.unidad };
  return { tipo: 'ok', oido: cantidad.valor };
}

export const INTENTOS_POR_LINEA = 3;

export interface Incidencia {
  linea: number;
  producto: string;
  motivo: 'a-mano' | 'no' ;
  dicho: string;
  oido?: number;
}

export interface EntradaHistorial {
  linea: number;
  dicho: string;
  veredicto: VeredictoConfirmacion['tipo'];
}

export interface EstadoPicking {
  /** Indice de la linea actual (0-based); `pedido.length` cuando termino. */
  indice: number;
  intentos: number;
  confirmadas: number;
  aMano: number[];
  incidencias: Incidencia[];
  historial: EntradaHistorial[];
  terminado: boolean;
}

export interface PasoPicking {
  estado: EstadoPicking;
  veredicto: VeredictoConfirmacion;
  /** Lo que la maquina dice a continuacion (mensaje + siguiente linea si toca). */
  dice: string;
  avanzo: boolean;
}

export interface SesionPicking {
  readonly estado: EstadoPicking;
  readonly pedido: readonly LineaPedido[];
  readonly lineaActual: LineaPedido | undefined;
  /** Lo que la maquina lee para la linea actual. */
  lee(): string;
  confirma(dicho: string): PasoPicking;
  reinicia(): void;
}

/** La conversacion completa de un pedido, pura: recibe lo dicho, devuelve el estado y lo que responder. */
export function creaSesionPicking(pedido: readonly LineaPedido[]): SesionPicking {
  let estado: EstadoPicking = { indice: 0, intentos: 0, confirmadas: 0, aMano: [], incidencias: [], historial: [], terminado: pedido.length === 0 };
  const total = pedido.length;
  const lecturaDe = (i: number) => (pedido[i] ? fraseParaLeer(pedido[i] as LineaPedido, i + 1, total) : 'Pedido completo.');
  const avanza = (): string => {
    estado = { ...estado, indice: estado.indice + 1, intentos: 0, terminado: estado.indice + 1 >= total };
    return estado.terminado ? `Pedido completo: ${estado.confirmadas} de ${total} confirmadas${estado.aMano.length ? `, ${estado.aMano.length} a mano` : ''}.` : lecturaDe(estado.indice);
  };
  return {
    get estado() {
      return estado;
    },
    pedido,
    get lineaActual() {
      return pedido[estado.indice];
    },
    lee: () => lecturaDe(estado.indice),
    reinicia() {
      estado = { indice: 0, intentos: 0, confirmadas: 0, aMano: [], incidencias: [], historial: [], terminado: total === 0 };
    },
    confirma(dicho) {
      const linea = pedido[estado.indice];
      if (!linea || estado.terminado) return { estado, veredicto: { tipo: 'no-entendi' }, dice: 'Pedido completo.', avanzo: false };
      const v = evaluaConfirmacion(dicho, linea);
      const numero = estado.indice + 1;
      estado = { ...estado, historial: [...estado.historial, { linea: numero, dicho, veredicto: v.tipo }] };
      if (v.tipo === 'repetir') return { estado, veredicto: v, dice: lecturaDe(estado.indice), avanzo: false };
      // `dice` se calcula ANTES de armar el objeto: `avanza()` cambia `estado`, y en un literal las
      // propiedades se evaluan en orden (el panel se quedo en la linea 1 por esto, medido el 2026-09-20).
      if (v.tipo === 'ok') {
        estado = { ...estado, confirmadas: estado.confirmadas + 1 };
        const dice = `Confirmado: ${nombraCantidad(linea.cantidad, linea.unidad)}. ${avanza()}`;
        return { estado, veredicto: v, dice, avanzo: true };
      }
      if (v.tipo === 'no') {
        estado = { ...estado, aMano: [...estado.aMano, numero], incidencias: [...estado.incidencias, { linea: numero, producto: linea.producto, motivo: 'no', dicho, ...(v.oido !== undefined ? { oido: v.oido } : {}) }] };
        const dice = `Anotado: la línea ${numero} queda a mano${v.oido !== undefined ? ` (dijiste ${v.oido})` : ''}. ${avanza()}`;
        return { estado, veredicto: v, dice, avanzo: true };
      }
      const intentos = estado.intentos + 1;
      estado = { ...estado, intentos };
      if (intentos >= INTENTOS_POR_LINEA) {
        estado = { ...estado, aMano: [...estado.aMano, numero], incidencias: [...estado.incidencias, { linea: numero, producto: linea.producto, motivo: 'a-mano', dicho, ...('oido' in v ? { oido: v.oido } : {}) }] };
        const dice = `Tres intentos: la línea ${numero} queda a mano. ${avanza()}`;
        return { estado, veredicto: v, dice, avanzo: true };
      }
      const pista = v.tipo === 'cantidad-distinta' ? `Oí ${v.oido}, pero la línea pide ${nombraCantidad(linea.cantidad, linea.unidad)}.` : v.tipo === 'unidad-distinta' ? `Oí ${v.oido} ${v.unidad}, pero la línea es en ${PLURAL[linea.unidad ?? 'unidad'] ?? linea.unidad}.` : v.tipo === 'sin-cantidad' ? 'Un «sí» a secas no basta: di la cantidad.' : 'No entendí una cantidad.';
      return { estado, veredicto: v, dice: `${pista} Intento ${intentos} de ${INTENTOS_POR_LINEA}. Di la cantidad, o «no» si no cuadra.`, avanzo: false };
    },
  };
}

export const PEDIDO_MUESTRA: LineaPedido[] = [
  { ubicacion: 'Pasillo A, estante 12', producto: 'Tornillos M8', cantidad: 3 },
  { ubicacion: 'Pasillo B, estante 4', producto: 'Cinta aislante negra', cantidad: 12 },
  { ubicacion: 'Pasillo C, estante 21', producto: 'Guantes de nitrilo talla M', cantidad: 25, unidad: 'par' },
  { ubicacion: 'Pasillo A, estante 3', producto: 'Cable calibre 12', cantidad: 50, unidad: 'metro' },
  { ubicacion: 'Pasillo D, estante 7', producto: 'Pintura blanca', cantidad: 4, unidad: 'litro' },
  { ubicacion: 'Pasillo B, estante 9', producto: 'Clavos de dos pulgadas', cantidad: 2, unidad: 'kilo' },
  { ubicacion: 'Pasillo E, estante 1', producto: 'Cajas de cartón medianas', cantidad: 100 },
  { ubicacion: 'Pasillo C, estante 15', producto: 'Tubo PVC de media', cantidad: 8, unidad: 'tramo' },
  { ubicacion: 'Pasillo A, estante 20', producto: 'Focos LED 9 W', cantidad: 36 },
  { ubicacion: 'Pasillo D, estante 2', producto: 'Detergente industrial', cantidad: 6, unidad: 'botella' },
  { ubicacion: 'Pasillo F, estante 11', producto: 'Papel bond carta', cantidad: 10, unidad: 'paquete' },
  { ubicacion: 'Pasillo B, estante 18', producto: 'Brocas de un cuarto', cantidad: 15 },
  { ubicacion: 'Pasillo E, estante 6', producto: 'Cemento gris', cantidad: 20, unidad: 'saco' },
  { ubicacion: 'Pasillo C, estante 8', producto: 'Silicón transparente', cantidad: 24 },
  { ubicacion: 'Pasillo A, estante 14', producto: 'Abrazaderas de acero', cantidad: 60 },
  { ubicacion: 'Pasillo F, estante 3', producto: 'Aceite hidráulico', cantidad: 1, unidad: 'tarima' },
  { ubicacion: 'Pasillo D, estante 19', producto: 'Lija grano 120', cantidad: 45 },
  { ubicacion: 'Pasillo B, estante 1', producto: 'Manguera de jardín', cantidad: 30, unidad: 'metro' },
  { ubicacion: 'Pasillo E, estante 13', producto: 'Conservas de atún', cantidad: 120, unidad: 'lata' },
  { ubicacion: 'Pasillo C, estante 2', producto: 'Bolsas de basura', cantidad: 7, unidad: 'rollo' },
];
