/**
 * El TELEFONO del paciente en el laboratorio: lo que la persona ve y hace en SU WhatsApp contra el simulador de Meta.
 * Escribe, toca botones (de mensajes interactivos y de plantillas), manda una nota de voz (voz Piper LOCAL → OGG/Opus,
 * como la graba WhatsApp) o una foto, abre un Flow y lo llena pantalla por pantalla, y la recepcion contesta desde el
 * celular de la clinica (coexistencia). Solo laboratorio; nada sale hacia Meta.
 */
import { execFile } from 'node:child_process';
import type { ClienteSimulado, PasoFlow, RecibidoPorCliente } from '../../../../../tools/ventas-whatsapp/dist/simulador/index.js';
import { sintetizaEnFlujo } from '@/shared/lib/transcriptor-local';
import { despacha, runtime } from './runtime';
import { NUMEROS_WA } from './whatsapp';

export interface Burbuja {
  lado: 'paciente' | 'clinica' | 'recepcion';
  instante: number;
  texto: string;
  tipo: string;
  plantilla?: string;
  botones?: { id: string; titulo: string }[];
  cta?: { texto: string; url: string };
  flow?: { cta: string };
  /** Lo que Meta cobro (o no) por este mensaje: la evidencia del costo por canal. */
  precio?: string;
}

export interface VistaFlow { pantalla: string; titulo: string; datos: Record<string, unknown>; componentes: Record<string, unknown>[]; error: string | null; cerrado: boolean }

const flows = new Map<string, PasoFlow>();
const llave = (clinica: string, numero: string) => `${clinica}|${numero}`;

async function cliente(clinica: string, numero: string, nombre = 'Paciente'): Promise<ClienteSimulado> {
  const rt = await runtime();
  const n = NUMEROS_WA.find((x) => x.clinica === clinica);
  if (!n) throw new Error('clínica desconocida');
  return rt.whatsapp.meta.cliente(n.phoneNumberId, numero, nombre);
}

const usd = (micros: number) => `US$${(micros / 1_000_000).toFixed(4)}`;

function deClinica(r: RecibidoPorCliente): Burbuja {
  const m = r.mensaje;
  const base = { instante: r.instante, tipo: m.tipo, ...(r.precio ? { precio: `${r.precio.categoria} · ${r.precio.tipo} · ${r.precio.billable ? usd(r.precio.costoMicros) : 'sin cobro'}` } : {}) };
  if (r.resumen.startsWith('(dueño desde la app) ')) return { ...base, lado: 'recepcion', texto: r.resumen.slice('(dueño desde la app) '.length) };
  if (m.tipo === 'plantilla') return { ...base, lado: 'clinica', texto: r.plantilla?.texto ?? r.resumen, plantilla: m.nombre, botones: (r.plantilla?.botones ?? []).map((b) => ({ id: b.payload, titulo: b.texto })) };
  if (m.tipo === 'botones') return { ...base, lado: 'clinica', texto: m.cuerpo, botones: m.botones.map((b) => ({ id: b.id, titulo: b.titulo })) };
  if (m.tipo === 'cta_url') return { ...base, lado: 'clinica', texto: m.cuerpo, cta: { texto: m.textoBoton, url: m.url } };
  if (m.tipo === 'flow') return { ...base, lado: 'clinica', texto: m.cuerpo, flow: { cta: m.cta } };
  return { ...base, lado: 'clinica', texto: m.tipo === 'texto' ? m.texto : r.resumen };
}

export async function conversacion(clinica: string, numero: string): Promise<{ burbujas: Burbuja[]; flow: VistaFlow | null }> {
  const cl = await cliente(clinica, numero);
  const propios: Burbuja[] = cl.enviados.map((e) => ({ lado: 'paciente', instante: e.instante, tipo: e.tipo, texto: e.tipo === 'audio' ? '🎤 Nota de voz' : e.tipo === 'imagen' ? `📷 Foto${e.texto ? `: ${e.texto}` : ''}` : e.texto ?? '' }));
  const burbujas = [...propios, ...cl.recibidos.map(deClinica)].sort((a, b) => a.instante - b.instante);
  return { burbujas, flow: vistaFlow(flows.get(llave(clinica, numero)) ?? null) };
}

function vistaFlow(p: PasoFlow | null): VistaFlow | null {
  if (!p) return null;
  const layout = (p.definicion?.['layout'] ?? {}) as { children?: Record<string, unknown>[] };
  return { pantalla: p.pantalla, titulo: String(p.definicion?.['title'] ?? (p.cierre ? 'Listo' : p.pantalla)), datos: p.datos, componentes: layout.children ?? [], error: p.error, cerrado: p.cierre !== null };
}

/** Una nota de voz con la voz Piper local: PCM → OGG/Opus mono 16 kHz, como las graba WhatsApp. */
async function notaDeVoz(texto: string): Promise<Uint8Array> {
  const f = await sintetizaEnFlujo(texto, 'es_MX-claude-high', 1);
  const pcm = new Uint8Array(await new Response(f.cuerpo).arrayBuffer());
  return new Promise((ok, mal) => {
    const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(f.frecuenciaHz), '-ac', '1', '-i', 'pipe:0', '-c:a', 'libopus', '-b:a', '24k', '-ar', '16000', '-f', 'ogg', 'pipe:1'], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (e, out) => (e ? mal(e) : ok(new Uint8Array(out))));
    p.stdin?.end(Buffer.from(pcm));
  });
}

/** Un JPEG mínimo y sintético (no es una foto de nadie): lo que importa es que llega una imagen y no se baja. */
const JPEG_SINTETICO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

export type AccionTelefono =
  | { accion: 'escribe'; texto: string }
  | { accion: 'toca'; boton: string }
  | { accion: 'voz'; texto: string }
  | { accion: 'foto'; pie: string }
  | { accion: 'recepcion'; texto: string }
  | { accion: 'abre-flow' }
  | { accion: 'envia-flow'; datos: Record<string, unknown> };

export async function actua(clinica: string, numero: string, nombre: string, a: AccionTelefono): Promise<void> {
  const cl = await cliente(clinica, numero, nombre);
  const k = llave(clinica, numero);
  if (a.accion === 'escribe') cl.escribe(a.texto);
  if (a.accion === 'toca') {
    try {
      cl.toca(a.boton);
    } catch {
      cl.tocaBotonPlantilla(a.boton);
    }
  }
  if (a.accion === 'voz') cl.mandaAudio(await notaDeVoz(a.texto));
  if (a.accion === 'foto') cl.mandaImagen(JPEG_SINTETICO, a.pie || undefined);
  if (a.accion === 'recepcion') (await runtime()).whatsapp.meta.duenoContesta(NUMEROS_WA.find((x) => x.clinica === clinica)!.phoneNumberId, numero, a.texto);
  if (a.accion === 'abre-flow') flows.set(k, await cl.abreFlow());
  if (a.accion === 'envia-flow') {
    const p = flows.get(k);
    if (p) flows.set(k, await p.envia(a.datos));
  }
  await despacha();
}
