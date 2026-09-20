/**
 * Voz picking: la maquina lee la linea del pedido, la persona confirma la cantidad de viva voz.
 * Reglas: la confirmacion vale si el numero dicho coincide con la cantidad; «repite» vuelve a
 * leer; cualquier otra cosa se pide de nuevo. Determinista y sin modelo.
 */
import { primerNumero, quitaAcentos } from './texto.ts';

export interface LineaPedido {
  ubicacion: string;
  producto: string;
  cantidad: number;
}

export type VeredictoConfirmacion = { tipo: 'ok'; oido: number } | { tipo: 'cantidad-distinta'; oido: number } | { tipo: 'repetir' } | { tipo: 'no-entendi' };

/** Lo que la maquina lee en voz alta: ubicacion, producto y cantidad, y pide confirmar. */
export function fraseParaLeer(linea: LineaPedido, numero: number, total: number): string {
  return `Linea ${numero} de ${total}. ${linea.ubicacion}. ${linea.producto}. ${linea.cantidad} ${linea.cantidad === 1 ? 'unidad' : 'unidades'}. Confirma la cantidad.`;
}

export function evaluaConfirmacion(dicho: string, linea: LineaPedido): VeredictoConfirmacion {
  const t = quitaAcentos(dicho.toLowerCase());
  if (/\b(repite|repetir|otra vez|de nuevo)\b/.test(t)) return { tipo: 'repetir' };
  const oido = primerNumero(t);
  if (oido === undefined) return { tipo: 'no-entendi' };
  return oido === linea.cantidad ? { tipo: 'ok', oido } : { tipo: 'cantidad-distinta', oido };
}

export const PEDIDO_MUESTRA: LineaPedido[] = [
  { ubicacion: 'Pasillo A, estante 12', producto: 'Tornillos M8', cantidad: 3 },
  { ubicacion: 'Pasillo B, estante 4', producto: 'Cinta aislante negra', cantidad: 12 },
  { ubicacion: 'Pasillo C, estante 21', producto: 'Guantes de nitrilo talla M', cantidad: 25 },
];
