/**
 * `Transcriptor` contra el servicio de `servicio/`: la MISMA interfaz que un motor local, por
 * HTTP. Sin dependencias: `fetch` global (Node ≥ 18) o el que se inyecte.
 *
 * El audio viaja como PCM16LE crudo con la frecuencia en cabecera; la pista, en base64 (las
 * cabeceras son ASCII). Autenticacion por `Bearer` obligatoria: el servicio la exige (C3) y
 * este cliente no sabe hablar sin ella. El token nunca se imprime: `describe()` lo enmascara.
 */
import type { Motor, Muestras, OpcionesTranscribe, Transcripcion } from '../types.js';

export interface OpcionesTranscriptorRemoto {
  /** Base del servicio, con esquema: `https://dictado.midominio.mx` o `http://127.0.0.1:8090`. */
  url: string;
  token: string;
  fetch?: typeof fetch;
  msEspera?: number;
}

export interface TranscriptorRemoto extends Motor {
  salud(): Promise<boolean>;
  /** Para logs: la URL y `token: presente (largo N)`, nunca el valor. */
  describe(): string;
}

interface RespuestaServicio {
  texto?: string;
  confianza?: number;
  idioma?: string;
  ms?: number;
  motor?: string;
  error?: string;
}

/** `Uint8Array<ArrayBuffer>` explicito: el `BodyInit` del DOM no admite `ArrayBufferLike`. */
function aPcm16(muestras: Muestras): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(muestras.length * 2);
  const salida = new Uint8Array(buffer);
  const vista = new DataView(buffer);
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i] ?? 0));
    vista.setInt16(i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
  }
  return salida;
}

function aBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function creaTranscriptorRemoto(opciones: OpcionesTranscriptorRemoto): TranscriptorRemoto {
  if (!/^https?:\/\//.test(opciones.url)) throw new Error('la URL del servicio debe llevar esquema http:// o https://');
  if (opciones.token.length < 16) throw new Error('el token del servicio es demasiado corto: se exige uno de al menos 16 caracteres');
  const base = opciones.url.replace(/\/+$/, '');
  const pide = opciones.fetch ?? globalThis.fetch;
  const msEspera = opciones.msEspera ?? 60_000;
  const cabeceras = { authorization: `Bearer ${opciones.token}` };
  let motorRemoto = 'remoto';

  return {
    id: `remoto:${new URL(base).host}`,
    admitePista: true,
    async transcribe(muestras: Muestras, frecuenciaHz: number, o?: OpcionesTranscribe): Promise<Transcripcion> {
      const t0 = performance.now();
      const respuesta = await pide(`${base}/transcribir`, {
        method: 'POST',
        headers: {
          ...cabeceras,
          'content-type': 'application/octet-stream',
          'x-frecuencia-hz': String(frecuenciaHz),
          ...(o?.idioma ? { 'x-idioma': o.idioma } : {}),
          ...(o?.pista ? { 'x-pista-base64': aBase64(o.pista) } : {}),
        },
        body: aPcm16(muestras),
        signal: AbortSignal.timeout(msEspera),
      });
      const cuerpo = (await respuesta.json().catch(() => ({}))) as RespuestaServicio;
      if (!respuesta.ok) throw new Error(`servicio de dictado: ${respuesta.status} ${cuerpo.error ?? ''}`.trim());
      if (cuerpo.motor) motorRemoto = cuerpo.motor;
      return {
        texto: (cuerpo.texto ?? '').trim(),
        ...(cuerpo.confianza !== undefined ? { confianza: cuerpo.confianza } : {}),
        ...(cuerpo.idioma ? { idioma: cuerpo.idioma } : {}),
        ms: performance.now() - t0,
      };
    },
    async salud() {
      try {
        const r = await pide(`${base}/health`, { signal: AbortSignal.timeout(5_000) });
        return r.ok;
      } catch {
        return false;
      }
    },
    describe() {
      return `${base} · motor remoto: ${motorRemoto} · token: presente (largo ${opciones.token.length})`;
    },
  };
}
