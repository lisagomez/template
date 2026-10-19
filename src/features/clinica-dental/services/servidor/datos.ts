/**
 * Donde guarda el portal del laboratorio lo que guarda (fuera del repo) y las guardas del entorno.
 *
 * El portal de este goal es SOLO de laboratorio: pacientes sinteticos, canales simulados, estado en archivo.
 * Sin `CLINICA_LABORATORIO=1` no arranca (falla cerrado): para pacientes reales falta la migracion aplicada,
 * la AISIA firmada, el aviso de privacidad vigente y los adaptadores reales con C3 + C4 (ver el spec).
 *
 * `turbopackIgnore`: las rutas se deciden al ejecutar (aprendizaje del 2026-09-20).
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DATOS = resolve(/*turbopackIgnore: true*/ process.env['CLINICA_DATOS'] ?? join(homedir(), '.clinica-dental'));
export const RUTAS = {
  portal: resolve(/*turbopackIgnore: true*/ DATOS, 'portal.json'),
  libro: resolve(/*turbopackIgnore: true*/ DATOS, 'libro'),
  calendario: resolve(/*turbopackIgnore: true*/ DATOS, 'calendario.json'),
  buzon: resolve(/*turbopackIgnore: true*/ DATOS, 'buzon'),
  telegram: resolve(/*turbopackIgnore: true*/ DATOS, 'telegram.json'),
  reel: resolve(/*turbopackIgnore: true*/ DATOS, 'reel'),
  gasto: resolve(/*turbopackIgnore: true*/ DATOS, 'gasto.jsonl'),
  llaves: resolve(/*turbopackIgnore: true*/ DATOS, 'llaves.json'),
  reloj: resolve(/*turbopackIgnore: true*/ DATOS, 'reloj.json'),
  /** La cola durable del webhook de WhatsApp (se escribe antes de contestar 200). */
  colaWhatsapp: resolve(/*turbopackIgnore: true*/ DATOS, 'whatsapp-cola'),
  /** Los hosts a los que el SERVIDOR salio (guardia de red del laboratorio): ninguno de Meta. */
  red: resolve(/*turbopackIgnore: true*/ DATOS, 'red-servidor.json'),
} as const;

export class SoloLaboratorio extends Error {
  constructor() {
    super('el portal de la clínica es solo de laboratorio: arranca con CLINICA_LABORATORIO=1 (pacientes sintéticos, canales simulados)');
    this.name = 'SoloLaboratorio';
  }
}

export const esLaboratorio = (): boolean => process.env['CLINICA_LABORATORIO'] === '1';
export function exigeLaboratorio(): void {
  if (!esLaboratorio()) throw new SoloLaboratorio();
}

/** Donde vive el portal para los enlaces de los avisos (en el laboratorio, el servidor local). */
export const URL_PORTAL = process.env['CLINICA_URL_PORTAL'] ?? 'http://127.0.0.1:3011';
/** Tope duro del gasto del asistente en US$ (el goal fija 1). */
export const TOPE_USD = Number(process.env['CLINICA_TOPE_USD'] ?? '1');
/** El secreto del webhook de Telegram (`X-Telegram-Bot-Api-Secret-Token`); en el laboratorio, uno de prueba. */
export const SECRETO_WEBHOOK = process.env['CLINICA_TELEGRAM_SECRETO'] ?? 'secreto-del-webhook-del-laboratorio';
/**
 * El secreto de la app de Meta (firma `X-Hub-Signature-256` del webhook y del endpoint de Flows) y el token de
 * verificacion de la suscripcion. En el laboratorio, de prueba: el simulador firma con el mismo.
 */
export const SECRETO_APP_WA = process.env['CLINICA_WA_SECRETO_APP'] ?? 'secreto-de-la-app-de-meta-del-laboratorio';
export const VERIFICA_WA = process.env['CLINICA_WA_VERIFICA'] ?? 'verificacion-del-laboratorio';
