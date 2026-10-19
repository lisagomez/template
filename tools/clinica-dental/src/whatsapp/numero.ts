/**
 * Los numeros de Mexico en WhatsApp. La Cloud API documenta que «para Brasil y Mexico, el prefijo adicional puede
 * ser modificado por la Cloud API» (developers.facebook.com/documentation/business-messaging/whatsapp/messages/
 * send-messages, consultado el 2026-10-19): un mismo celular llega como `521` + 10 digitos o como `52` + 10. La
 * LLAVE de una persona en Mexico son los ultimos 10 digitos; el telefono crudo no sirve para comparar.
 */

/** Solo digitos; `521` + 10 → `52` + 10 (la misma regla que `normalizaWaId` de ventas-whatsapp). */
export function normalizaWaId(entrada: string): string {
  const d = entrada.replace(/\D/g, '');
  return d.length === 13 && d.startsWith('521') ? `52${d.slice(3)}` : d;
}

/** La llave de comparacion: en Mexico, los 10 digitos nacionales; fuera, el numero entero normalizado. */
export function llaveTelefono(entrada: string): string {
  const d = normalizaWaId(entrada);
  return d.length === 12 && d.startsWith('52') ? d.slice(2) : d;
}

export const mismoTelefono = (a: string, b: string): boolean => a !== '' && b !== '' && llaveTelefono(a) === llaveTelefono(b);

/** Lo unico que se le muestra a nadie de un numero: sus ultimos 4 digitos. */
export const ultimos4 = (waId: string): string => normalizaWaId(waId).slice(-4);
