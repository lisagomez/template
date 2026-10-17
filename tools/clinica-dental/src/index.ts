/**
 * @tu-scope/clinica-dental — lo que corre igual en el navegador y en el servidor (sin `node:*`): las clinicas
 * declaradas, el contrato de eventos, el cuestionario y sus consentimientos, el dataLayer, la agenda sobre
 * `Reservas` y el asistente (urgencias por regla, guardas, enrutador, guia de voz). Lo que toca disco, red o
 * cripto vive en `./servidor`.
 */
export * from './clinicas.js';
export * from './eventos.js';
export * from './cuestionario.js';
export * from './datalayer.js';
export * from './agenda.js';
export * from './asistente/urgencias.js';
export * from './asistente/guardas.js';
export * from './asistente/conocimiento.js';
export * from './asistente/prompts.js';
export * from './asistente/ordenes.js';
export * from './asistente/asistente.js';
export * from './asistente/interpreta.js';
export * from './asistente/guia.js';
export * from './analitica.js';
