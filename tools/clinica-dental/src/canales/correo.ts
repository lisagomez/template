/**
 * El canal de correo: un mensaje RFC 5322/MIME (texto + HTML + adjuntos), el PUERTO por el que sale, el
 * SIMULADOR (un buzon de salida que guarda cada `.eml`) y el adaptador REAL de Gmail, que se niega sin gate.
 *
 * El newsletter va APARTE del recordatorio y lleva la baja de un clic de RFC 8058: `List-Unsubscribe` con una
 * URL HTTPS (y un mailto de respaldo) y `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. El simulador
 * rechaza un envio masivo sin esas cabeceras, como lo exige Gmail a los remitentes masivos desde 2024.
 *
 * Idempotencia: el `Message-ID` sale del id del aviso; el buzon no guarda dos veces el mismo.
 */
import { exigeGate, type Entorno } from './gate.js';

export interface Direccion { nombre: string; direccion: string }
export interface Adjunto { nombre: string; tipo: string; contenido: string | Uint8Array }

export interface Correo {
  idMensaje: string;
  de: Direccion;
  para: string;
  asunto: string;
  texto: string;
  html: string;
  fecha: Date;
  adjuntos?: Adjunto[];
  /** Cabeceras extra (List-Unsubscribe, List-Id…). */
  cabeceras?: Record<string, string>;
  /** Masivo (newsletter): exige la baja de un clic. */
  masivo?: boolean;
}

export type ResultadoEnvio =
  | { ok: true; idProveedor: string; repetido: boolean }
  | { ok: false; motivo: 'rebote' | 'limite' | 'politica' | 'otro'; definitivo: boolean; detalle: string };

export interface PuertoCorreo {
  readonly nombre: string;
  envia(c: Correo): Promise<ResultadoEnvio>;
}

const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64');
const enLineas = (s: string) => s.replace(/(.{76})/g, '$1\r\n');
/** RFC 2047: una cabecera con texto no ASCII viaja como `=?UTF-8?B?…?=`. */
export const codificaCabecera = (s: string): string => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const direccion = (d: Direccion) => `${codificaCabecera(d.nombre)} <${d.direccion}>`;

/** El `.eml` completo, con CRLF y fronteras deterministas (salen del id del mensaje). */
export function construyeEml(c: Correo): string {
  const semilla = c.idMensaje.replace(/[^a-z0-9]/gi, '').slice(-16);
  const mixta = `mixta-${semilla}`;
  const alternativa = `alt-${semilla}`;
  const cab = [
    `From: ${direccion(c.de)}`, `To: ${c.para}`, `Subject: ${codificaCabecera(c.asunto)}`, `Date: ${c.fecha.toUTCString()}`,
    `Message-ID: <${c.idMensaje}>`, 'MIME-Version: 1.0', ...Object.entries(c.cabeceras ?? {}).map(([k, v]) => `${k}: ${v}`),
    `Content-Type: multipart/mixed; boundary="${mixta}"`,
  ];
  const cuerpo = [
    `--${mixta}`, `Content-Type: multipart/alternative; boundary="${alternativa}"`, '',
    `--${alternativa}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', enLineas(b64(c.texto)),
    `--${alternativa}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', enLineas(b64(c.html)),
    `--${alternativa}--`,
    ...(c.adjuntos ?? []).flatMap((a) => [
      `--${mixta}`, `Content-Type: ${a.tipo}; name="${a.nombre}"`, `Content-Disposition: attachment; filename="${a.nombre}"`,
      'Content-Transfer-Encoding: base64', '', enLineas(b64(a.contenido)),
    ]),
    `--${mixta}--`, '',
  ];
  return [...cab, '', ...cuerpo].join('\r\n');
}

export interface Parte { tipo: string; nombre: string | null; contenido: string }
export interface EmlLeido { cabeceras: Record<string, string>; partes: Parte[] }

const decodificaCabecera = (v: string) => v.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_m, x: string) => Buffer.from(x, 'base64').toString('utf8'));

function partesDe(cuerpo: string, frontera: string): Parte[] {
  return cuerpo.split(`--${frontera}`).slice(1).filter((p) => !p.startsWith('--')).flatMap((p) => {
    const [cab = '', ...resto] = p.replace(/^\r\n/, '').split('\r\n\r\n');
    const contenido = resto.join('\r\n\r\n');
    const tipo = /Content-Type: ([^;\r\n]+)/i.exec(cab)?.[1] ?? 'text/plain';
    const sub = /boundary="([^"]+)"/i.exec(cab)?.[1];
    if (sub) return partesDe(contenido, sub);
    const nombre = /filename="([^"]+)"/i.exec(cab)?.[1] ?? null;
    const texto = /base64/i.test(cab) ? Buffer.from(contenido.replace(/\s+/g, ''), 'base64').toString('utf8') : contenido;
    return [{ tipo, nombre, contenido: texto }];
  });
}

/** Lee un `.eml` construido aqui (visor del buzon y pruebas). No es un parser MIME general. */
export function leeEml(eml: string): EmlLeido {
  const [cabTexto = '', ...resto] = eml.split('\r\n\r\n');
  const cabeceras: Record<string, string> = {};
  for (const l of cabTexto.split('\r\n')) {
    const i = l.indexOf(':');
    if (i > 0) cabeceras[l.slice(0, i)] = decodificaCabecera(l.slice(i + 1).trim());
  }
  const frontera = /boundary="([^"]+)"/i.exec(cabeceras['Content-Type'] ?? '')?.[1];
  return { cabeceras, partes: frontera ? partesDe(resto.join('\r\n\r\n'), frontera) : [] };
}

/** RFC 8058 §3: una URI HTTPS en List-Unsubscribe y el POST de un clic declarado. */
export function cumpleRfc8058(cabeceras: Record<string, string>): boolean {
  const lista = cabeceras['List-Unsubscribe'] ?? '';
  return /<https:\/\/[^>]+>/.test(lista) && cabeceras['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click';
}

export interface Enviado { idMensaje: string; para: string; asunto: string; masivo: boolean; eml: string; estado: 'entregado' | 'rebotado'; en: string }

/**
 * El SIMULADOR: un buzon de salida en proceso. Entrega todo salvo a un dominio `.invalid` (RFC 2606), que
 * rebota; rechaza un masivo sin baja de un clic; y puede devolver `limite` las veces que se le pida, para
 * probar los reintentos. `alGuardar` deja cada `.eml` donde quiera quien lo use (archivo en el laboratorio).
 */
export class BuzonSimulado implements PuertoCorreo {
  readonly nombre = 'simulador';
  readonly enviados: Enviado[] = [];
  private limites = 0;
  private readonly alGuardar: ((e: Enviado) => Promise<void> | void) | undefined;
  private readonly reloj: () => number;

  constructor(op: { alGuardar?: (e: Enviado) => Promise<void> | void; reloj?: () => number; previos?: Enviado[] } = {}) {
    this.alGuardar = op.alGuardar;
    this.reloj = op.reloj ?? Date.now;
    this.enviados.push(...(op.previos ?? []));
  }

  /** Las proximas `n` llamadas responden `limite` (el 429 de un proveedor), sin guardar nada. */
  limita(n: number): void {
    this.limites = n;
  }

  async envia(c: Correo): Promise<ResultadoEnvio> {
    if (this.limites > 0) {
      this.limites--;
      return { ok: false, motivo: 'limite', definitivo: false, detalle: 'demasiados envíos: reintenta más tarde' };
    }
    const previo = this.enviados.find((e) => e.idMensaje === c.idMensaje);
    if (previo) return { ok: true, idProveedor: previo.idMensaje, repetido: true };
    const eml = construyeEml(c);
    if (c.masivo && !cumpleRfc8058(c.cabeceras ?? {})) {
      return { ok: false, motivo: 'politica', definitivo: true, detalle: 'un envío masivo sin baja de un clic (RFC 8058) lo rechaza Gmail desde 2024' };
    }
    const estado = /\.invalid$/i.test(c.para) ? 'rebotado' : 'entregado';
    const enviado: Enviado = { idMensaje: c.idMensaje, para: c.para, asunto: c.asunto, masivo: Boolean(c.masivo), eml, estado, en: new Date(this.reloj()).toISOString() };
    this.enviados.push(enviado);
    await this.alGuardar?.(enviado);
    if (estado === 'rebotado') return { ok: false, motivo: 'rebote', definitivo: true, detalle: 'el dominio del destinatario no existe' };
    return { ok: true, idProveedor: c.idMensaje, repetido: false };
  }
}

/**
 * El adaptador REAL (Gmail API, `users.messages.send` con el `.eml` en base64url). Se NIEGA a construirse sin
 * el gate. Escrito y probado contra un `fetch` falso; **no medido contra Google**. Gmail personal no es un
 * proveedor de envio masivo (tiene limites diarios): el puerto permite cambiar a Resend sin tocar el nucleo.
 */
export class CorreoGmail implements PuertoCorreo {
  readonly nombre = 'gmail';
  private readonly token: () => Promise<string>;
  private readonly fetch: typeof globalThis.fetch;

  constructor(op: { env: Entorno; token: () => Promise<string>; fetch: typeof globalThis.fetch }) {
    exigeGate('Gmail', op.env);
    this.token = op.token;
    this.fetch = op.fetch;
  }

  async envia(c: Correo): Promise<ResultadoEnvio> {
    const raw = Buffer.from(construyeEml(c)).toString('base64url');
    const r = await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (r.status === 429) return { ok: false, motivo: 'limite', definitivo: false, detalle: 'límite de envío de Gmail' };
    if (!r.ok) return { ok: false, motivo: 'otro', definitivo: r.status < 500, detalle: `Gmail respondió ${r.status}` };
    const cuerpo = (await r.json()) as { id?: string };
    return { ok: true, idProveedor: cuerpo.id ?? c.idMensaje, repetido: false };
  }
}
