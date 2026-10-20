/**
 * La puerta de salida de OpenWA: la API de OpenWA 0.25.0 servida sobre el BSP oficial (Cloud API), su matriz de
 * compatibilidad generada del contrato pineado y el informe de migración. Compatible con la API de OpenWA; no es
 * OpenWA. Solo laboratorio hasta que el C3 y el CDC estén firmados.
 */
export * from './criterios.js';
export * from './matriz.js';
export * from './tipos.js';
export { creaFachada, encuentra, rolMinimo, MANEJADORES, VERSION_FACHADA, type FachadaOpenWA } from './fachada.js';
export { informeDeMigracion, resumenMatriz, type LineaInforme } from './informe.js';
export { aCuerpoMeta } from './plantillas.js';
export { AGENTE_ENTREGA, EVENTOS_OPENWA, destinoPermitido } from './eventos.js';
export { altasDelBsp } from './altas.js';
