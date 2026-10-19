/**
 * @tu-scope/clinica-dental/servidor — lo de Node: seudonimos HMAC, el libro sha256 (JCS + Merkle + sello
 * Ed25519), los almacenes, los canales (correo y Telegram con sus simuladores, WhatsApp sobre el de
 * ventas-whatsapp, y sus adaptadores reales con gate POR CANAL), el portal armado y el canal de WhatsApp
 * (vinculacion, entrada, receptor del webhook y endpoint de los Flows).
 */
export * from './index.js';
export * from './seudonimo.js';
export * from './jcs.js';
export * from './merkle.js';
export * from './libro.js';
export * from './almacen.js';
export * from './almacenes/archivo.js';
export * from './canales/gate.js';
export * from './canales/ics.js';
export * from './canales/correo.js';
export * from './canales/telegram.js';
export * from './canales/whatsapp.js';
export * from './portal/index.js';
export * from './whatsapp/tipos.js';
export * from './whatsapp/numero.js';
export * from './whatsapp/plantillas.js';
export * from './whatsapp/firma.js';
export * from './whatsapp/flows-json.js';
export * from './whatsapp/flows.js';
export * from './whatsapp/vinculo.js';
export * from './whatsapp/entrada.js';
export * from './whatsapp/receptor.js';
