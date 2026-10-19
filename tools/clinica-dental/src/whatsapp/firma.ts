/**
 * Lo que va y vuelve por WhatsApp y decide algo va FIRMADO (HMAC con la llave de seudonimos): el payload de un boton
 * y el `flow_token` de un Flow. La firma prueba que lo emitimos NOSOTROS para ESA clinica y ESA cita; quien lo usa
 * se decide aparte, por la vinculacion del numero que lo manda (la identidad nunca sale del payload).
 */
import { timingSafeEqual } from 'node:crypto';
import type { AccionBoton } from './plantillas.js';
import type { FlujoWa } from './tipos.js';

type Firmador = (contenido: string) => string;

/** Comparacion en tiempo constante (una firma no se adivina caracter por caracter midiendo cuanto tarda). */
const igual = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const ACCIONES: Record<string, AccionBoton | 'agendar' | 'recepcion' | 'mis_citas'> = { c: 'confirma', r: 'reprograma', x: 'cancela', n: 'no_ire', a: 'agendar', h: 'recepcion', m: 'mis_citas' };
const LETRA = Object.fromEntries(Object.entries(ACCIONES).map(([k, v]) => [v, k])) as Record<string, string>;
export type AccionWa = (typeof ACCIONES)[string];

/** `wa1.<accion>.<cita o ->.<firma>`: cabe holgado en los 256 caracteres de un payload o un id de boton. */
export function payloadDe(firma: Firmador, clinica: string, accion: AccionWa, cita: string | null): string {
  const arg = cita ?? '-';
  return `wa1.${LETRA[accion]}.${arg}.${firma(`wa-boton|${clinica}|${accion}|${arg}`).slice(0, 16)}`;
}

export function leePayload(firma: Firmador, clinica: string, payload: string): { accion: AccionWa; cita: string | null } | null {
  const m = /^wa1\.([a-z])\.([a-z0-9_-]{1,40})\.([0-9a-f]{16})$/.exec(payload);
  const accion = m ? ACCIONES[m[1]!] : undefined;
  if (!m || !accion) return null;
  if (!igual(firma(`wa-boton|${clinica}|${accion}|${m[2]}`).slice(0, 16), m[3]!)) return null;
  return { accion, cita: m[2] === '-' ? null : m[2]! };
}

export interface DatosFlow {
  clinica: string;
  /** El paciente para el que se abrio el Flow, y el numero al que se mando. */
  paciente: string;
  waId: string;
  flujo: FlujoWa;
  cita: string | null;
  expira: number;
}

/**
 * Meta no fija vencimiento al `flow_token` y sugiere 2-3 dias; aqui 24 h: el Flow muestra huecos libres y mueve
 * una cita medica, y un dia basta para contestar un recordatorio.
 */
export const VIGENCIA_FLOW_MS = 24 * 3_600_000;

export function tokenFlow(firma: Firmador, d: DatosFlow): string {
  const cuerpo = Buffer.from(JSON.stringify(d)).toString('base64url');
  return `${cuerpo}.${firma(`wa-flow|${cuerpo}`)}`;
}

export function leeTokenFlow(firma: Firmador, token: string, ahora: number): DatosFlow | null {
  const [cuerpo, sello] = token.split('.');
  if (!cuerpo || !sello || !igual(firma(`wa-flow|${cuerpo}`), sello)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as DatosFlow;
    return typeof d.paciente === 'string' && typeof d.waId === 'string' && d.expira > ahora ? d : null;
  } catch {
    return null;
  }
}
