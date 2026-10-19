/**
 * El canal de WhatsApp del LABORATORIO, armado una vez por proceso: el simulador de Meta de `tools/ventas-whatsapp`
 * (webhooks firmados, plantillas registradas con su texto, Flows publicados y cifrados como los cifra WhatsApp,
 * ventanas y precios de Mexico) con un numero por clinica — el de la propia clinica: coexistencia, la recepcion lo
 * sigue usando en su celular —, el receptor con su cola durable en disco, el endpoint de los Flows y el ASR LOCAL
 * para las notas de voz (el audio no sale de la maquina). Nada habla con Meta: el transporte real se niega sin gate.
 */
import { execFile } from 'node:child_process';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { aCuerpoGraph, cifraRespuesta, descifraPeticion, leeWebhook, verificaFirmaMeta, type PeticionCifrada } from '../../../../../tools/ventas-whatsapp/dist/index.js';
import { creaMetaSimulada, type MetaSimulada } from '../../../../../tools/ventas-whatsapp/dist/simulador/index.js';
import {
  atiendeEndpointFlows, CLINICAS, colaEnArchivo, creaAsistente, creaPuertoWhatsApp, creaReceptorWhatsApp, FLOWS_WA, registroDePlantillas, type DepsEndpointFlows, type DepsWhatsApp,
  type NumeroClinica, type Portal, type PuertoCerebro, type ReceptorWhatsApp,
} from '../../../../../tools/clinica-dental/dist/servidor.js';
import { DemonioCaido, transcribeTurno } from '@/features/centro-de-mando/services/servidor/transcribe';
import { CANARIO, cerebroPara, enrutador } from './asistente';
import { RUTAS, SECRETO_APP_WA } from './datos';

/** El numero de WhatsApp de cada clinica sintetica: su mismo telefono (con 0000, inventado) y ids de Meta de juguete. */
export const NUMEROS_WA: NumeroClinica[] = CLINICAS.map((c, i) => ({
  clinica: c.id, phoneNumberId: `10900000001${String(i + 1).padStart(2, '0')}`, wabaId: `waba-${c.id}`, telefonoVisible: c.telefono.replace(/\D/g, ''),
}));

/** En el laboratorio, los numeros que terminan en 9999 «no tienen WhatsApp» (el 131026 que Meta manda despues). */
export const sinWhatsApp = (waId: string): boolean => waId.endsWith('9999');

export interface CanalLaboratorio {
  meta: MetaSimulada;
  deps: DepsWhatsApp;
  receptor: () => ReceptorWhatsApp;
  flows: () => DepsEndpointFlows;
  conecta(portal: Portal, alProcesar: () => Promise<unknown>): void;
}

/** OGG/Opus (la nota de voz de WhatsApp) → PCM16 a 16 kHz, con ffmpeg y sin tocar el disco. */
function aPcm16k(bytes: Uint8Array): Promise<Uint8Array> {
  return new Promise((ok, mal) => {
    const p = execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (e, out) => (e ? mal(e) : ok(new Uint8Array(out))));
    p.stdin?.end(Buffer.from(bytes));
  });
}

/** El ASR local para las notas de voz: ffmpeg + el demonio de `tools/dictado` en 127.0.0.1. `null` si no se entiende. */
async function transcribe(bytes: Uint8Array): Promise<string[] | null> {
  try {
    const pcm = await aPcm16k(bytes);
    if (pcm.length < 3_200 || pcm.length > 60 * 16_000 * 2) return null;
    return (await transcribeTurno(pcm, AbortSignal.timeout(30_000))).candidatos;
  } catch (e) {
    if (e instanceof DemonioCaido) return null;
    return null;
  }
}

/** Sin cerebro (rafaga en el numero): el asistente sigue con reglas, enrutador y respuestas fijas. */
const sinCerebro = (): PuertoCerebro => ({
  async *piensa() {
    throw new Error('rafaga en el numero: sin cerebro');
  },
});

export function armaCanal(reloj: () => number): CanalLaboratorio {
  const ref: { receptor?: ReceptorWhatsApp; flows?: DepsEndpointFlows } = {};
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const meta = creaMetaSimulada({
    secretoApp: SECRETO_APP_WA, reloj, sinWhatsApp,
    entrega: async (cuerpo, cab) => (ref.receptor ? (await ref.receptor.recibe(cuerpo, cab['x-hub-signature-256'])).status : 503),
    endpointFlows: async (cuerpo, cab) => (ref.flows ? atiendeEndpointFlows(ref.flows, cuerpo, cab['x-hub-signature-256']) : { status: 503, cuerpo: '' }),
  });
  const flowIds = new Map(NUMEROS_WA.map((n) => [n.clinica, meta.registraNumero({ wabaId: n.wabaId, phoneNumberId: n.phoneNumberId, telefonoVisible: n.telefonoVisible, datasetId: `ds-${n.clinica}`, catalogoId: `cat-${n.clinica}`, token: `lab-${n.clinica}`, llavePublicaFlows: publicKey, plantillas: registroDePlantillas(), flows: FLOWS_WA })]));
  const tarifas = CLINICAS[0]!.supuestos.tarifasWhatsappUsd;
  const deps: DepsWhatsApp = {
    puerto: creaPuertoWhatsApp({ graph: meta.graph, numeros: NUMEROS_WA, flowId: (c, f) => flowIds.get(c)![f]!, aCuerpo: (para, m) => aCuerpoGraph(para, m) }),
    numeros: NUMEROS_WA,
    tarifaUsd: (cat) => (cat === 'utility' || cat === 'service' || cat === 'marketing' ? tarifas[cat].valor : null),
  };
  return {
    meta, deps,
    receptor: () => ref.receptor!,
    flows: () => ref.flows!,
    conecta(portal, alProcesar) {
      ref.flows = { ctx: portal.ctx, verificaFirma: (c, f) => verificaFirmaMeta(SECRETO_APP_WA, c, f), cifrado: { abre: (c) => abre(c, privateKey) } };
      ref.receptor = creaReceptorWhatsApp({
        ctx: portal.ctx, verificaFirma: (c, f) => verificaFirmaMeta(SECRETO_APP_WA, c, f), lee: (c) => leeWebhook(c), cola: colaEnArchivo(RUTAS.colaWhatsapp), alProcesar,
        asistente: (clinica, { protegido }) => creaAsistente({ clinica: CLINICAS.find((c) => c.id === clinica)!, enrutador, cerebroPara: protegido ? sinCerebro : cerebroPara, reloj: () => performance.now(), canario: CANARIO, canal: 'whatsapp' }),
        transcribe: (bytes) => transcribe(bytes),
      });
    },
  };
}

function abre(cuerpo: string, llave: KeyObject) {
  try {
    const x = descifraPeticion(JSON.parse(cuerpo) as PeticionCifrada, llave);
    return { datos: x.datos, responde: (r: unknown) => cifraRespuesta(r, x.llaveAes, x.iv) };
  } catch {
    return null;
  }
}
