/**
 * Entry point `./a2a`: la pasarela multi-inquilino y el cliente que verifica Agent Cards. Aparte
 * del núcleo porque necesita `@a2a-js/sdk` (peer opcional, pineado a 1.1.0).
 */
export * from './pasarela.js';
export * from './cliente.js';
export * from './circuito.js';
