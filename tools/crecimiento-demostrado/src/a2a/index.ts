/**
 * Entry point `./a2a`: el agente `crecimiento-demostrado` por A2A (JSON-RPC, SDK pineado 1.1.0).
 * Aparte del núcleo porque necesita `@a2a-js/sdk` (peer opcional). Local: exponerlo es gate humano.
 */
export { creaPasarela, emiteToken, leeToken, tarjeta, SKILLS, type TokenA2A, type OpcionesPasarela } from './pasarela.js';
export { aTarea, deVeredicto, type ContextoDePyme, type FabricaDeAgentes, type Resultado } from './ejecutor.js';
export { verifyAgentCardSignature, TaskState } from '@a2a-js/sdk';
