/**
 * @tu-scope/ventas-whatsapp — el vendedor con IA en WhatsApp para pymes (fases 0-3). Núcleo sin
 * dependencias: el almacén, el transporte a Meta, el procesador de pagos y el modelo se inyectan.
 *
 *   import { creaVendedor } from '@tu-scope/ventas-whatsapp'
 *   import { creaMetaSimulada } from '@tu-scope/ventas-whatsapp/simulador'
 *   import { creaCircuito } from '@tu-scope/ventas-whatsapp/laboratorio'
 */
export * from './comun/base.js';
export * from './modelo.js';
export * from './meta/firma.js';
export * from './meta/webhook.js';
export * from './meta/mensajes.js';
export * from './meta/tarifas.js';
export * from './meta/graph.js';
export * from './meta/cronometro.js';
export * from './almacen/almacen.js';
export * from './agente/a2a-modelo.js';
export * from './agente/barreras.js';
export * from './agente/modelos.js';
export * from './agente/orquestador.js';
export * from './agente/optimizacion.js';
export * from './dominios/catalogo.js';
export * from './dominios/pedidos.js';
export * from './dominios/pagos.js';
export * from './dominios/citas.js';
export * from './dominios/soporte.js';
export * from './dominios/ventas.js';
export * from './dominios/numeros.js';
export * from './atribucion/dominio.js';
export * from './atribucion/tablero.js';
export * from './flows/cifrado.js';
export * from './flows/token.js';
export * from './flows/endpoint.js';
export * from './trazabilidad/cadena.js';
export * from './bsp/alta.js';
export * from './bsp/facturacion.js';
export * from './vendedor.js';
