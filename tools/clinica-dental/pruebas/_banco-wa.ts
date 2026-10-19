/**
 * El banco de WhatsApp: el portal del banco comun con el canal armado sobre el SIMULADOR de Meta de
 * `tools/ventas-whatsapp` (webhooks firmados, plantillas registradas con su texto, Flows publicados y cifrados como
 * los cifra WhatsApp, ventanas y precios de Mexico), el receptor del webhook y el endpoint de los Flows. El
 * asistente es el del portal con un cerebro FALSO que cuenta sus llamadas (para probar que algo NO llego al LLM).
 * Modulo de apoyo: no tiene pruebas propias.
 */
import { generateKeyPairSync } from 'node:crypto';
import { aCuerpoGraph, cifraRespuesta, descifraPeticion, leeWebhook, verificaFirmaMeta, type PeticionCifrada } from '../../ventas-whatsapp/dist/index.js';
import { creaMetaSimulada } from '../../ventas-whatsapp/dist/simulador/index.js';
import {
  atiendeEndpointFlows, CLINICAS, colaEnMemoria, creaAsistente, creaPuertoWhatsApp, creaReceptorWhatsApp, FLOWS_WA, registroDePlantillas,
  type ColaEntrada, type DepsEndpointFlows, type GraphWa, type NumeroClinica, type ReceptorWhatsApp,
} from '../dist/servidor.js';
import { alta, banco, enrutador, PACIENTES, type PacienteSintetico } from './_banco.ts';

export const SECRETO_APP = 'secreto-de-la-app-de-meta-del-laboratorio';
export const NUMEROS: NumeroClinica[] = [
  { clinica: 'maguey', phoneNumberId: '1090000000101', wabaId: 'waba-maguey', telefonoVisible: '525500000101' },
  { clinica: 'colibri', phoneNumberId: '1090000000102', wabaId: 'waba-colibri', telefonoVisible: '522200000102' },
];
export const TARIFAS: Record<string, number> = { utility: 0.0085, service: 0.0085, authentication: 0.0085, marketing: 0.0397 };

/** El `wa_id` de un paciente sintetico: 52 + sus 10 digitos (`conUno`: como lo manda Meta, con el 1 de celular). */
export const waIdDe = (p: PacienteSintetico, conUno = false): string => `52${conUno ? '1' : ''}${p.registro.celular.replace(/\D/g, '').slice(-10)}`;
export const paciente = (id: string): PacienteSintetico => PACIENTES.pacientes.find((p) => p.id === id)!;

export interface OpcionesBancoWa {
  sinWhatsApp?: (waId: string) => boolean;
  transcribe?: (bytes: Uint8Array, mime: string) => Promise<string[] | null>;
  respuestaCerebro?: string;
  cola?: ColaEntrada;
  /** Envuelve el transporte (para tirarlo a medias, contar llamadas…). */
  envuelve?: (g: GraphWa) => GraphWa;
}

export async function bancoWa(op: OpcionesBancoWa = {}) {
  const ref = { ahora: () => Date.parse('2026-10-19T14:00:00Z') };
  const deps: { receptor?: ReceptorWhatsApp; flows?: DepsEndpointFlows } = {};
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const meta = creaMetaSimulada({
    secretoApp: SECRETO_APP, reloj: () => ref.ahora(), ...(op.sinWhatsApp ? { sinWhatsApp: op.sinWhatsApp } : {}),
    entrega: async (cuerpo, cab) => (await deps.receptor!.recibe(cuerpo, cab['x-hub-signature-256'])).status,
    endpointFlows: async (cuerpo, cab) => atiendeEndpointFlows(deps.flows!, cuerpo, cab['x-hub-signature-256']),
  });
  const flowIds = new Map<string, Record<string, string>>();
  for (const n of NUMEROS) {
    flowIds.set(n.clinica, meta.registraNumero({ wabaId: n.wabaId, phoneNumberId: n.phoneNumberId, telefonoVisible: n.telefonoVisible, datasetId: `ds-${n.clinica}`, catalogoId: `cat-${n.clinica}`, token: 'tok', llavePublicaFlows: publicKey, plantillas: registroDePlantillas(), flows: FLOWS_WA }));
  }
  const graph = op.envuelve ? op.envuelve(meta.graph) : meta.graph;
  const puerto = creaPuertoWhatsApp({ graph, numeros: NUMEROS, flowId: (c, f) => flowIds.get(c)![f]!, aCuerpo: (para, m) => aCuerpoGraph(para, m) });
  const b = banco({ whatsapp: { puerto, numeros: NUMEROS, tarifaUsd: (cat) => TARIFAS[cat] ?? null } });
  ref.ahora = b.reloj.ahora;
  const ctx = b.portal.ctx;
  deps.flows = {
    ctx, verificaFirma: (c, f) => verificaFirmaMeta(SECRETO_APP, c, f),
    cifrado: {
      abre(c) {
        try {
          const x = descifraPeticion(JSON.parse(c) as PeticionCifrada, privateKey);
          return { datos: x.datos, responde: (r: unknown) => cifraRespuesta(r, x.llaveAes, x.iv) };
        } catch {
          return null;
        }
      },
    },
  };
  let llamadas = 0;
  const transcritos: number[] = [];
  const sistemas: string[] = [];
  deps.receptor = creaReceptorWhatsApp({
    ctx, verificaFirma: (c, f) => verificaFirmaMeta(SECRETO_APP, c, f), lee: (c) => leeWebhook(c), cola: op.cola ?? colaEnMemoria(),
    asistente: (clinica, { protegido }) => creaAsistente({
      clinica: CLINICAS.find((c) => c.id === clinica)!, enrutador: enrutador(), reloj: b.reloj.ahora, canario: 'CANARIO-wa-7', canal: 'whatsapp',
      cerebroPara: (sistema) => ({
        async *piensa() {
          llamadas++;
          sistemas.push(sistema);
          if (protegido) throw new Error('rafaga: sin cerebro');
          yield { tipo: 'token' as const, texto: op.respuestaCerebro ?? 'La limpieza dura 45 minutos y te dejamos los dientes muy limpios. ' };
          yield { tipo: 'uso' as const, costoUsd: 0.0001 };
        },
      }),
    }),
    ...(op.transcribe ? { transcribe: async (bytes: Uint8Array, mime: string) => { transcritos.push(bytes.length); return op.transcribe!(bytes, mime); } } : {}),
  });
  const receptor = deps.receptor;
  /** Hasta que no quede nada en vuelo: webhooks de Meta, la cola del receptor y los avisos por despachar. */
  async function asienta(): Promise<void> {
    for (let i = 0; i < 12; i++) {
      await meta.drena();
      await receptor.asienta();
      await b.portal.despacha();
      if (meta.pendientes() === 0) return;
    }
  }
  const numero = (clinica: string) => NUMEROS.find((n) => n.clinica === clinica)!;
  const cliente = (clinica: string, waId: string, nombre = 'Paciente') => meta.cliente(numero(clinica).phoneNumberId, waId, nombre);
  return { ...b, meta, receptor, puerto, asienta, cliente, numero, llamadas: () => llamadas, transcritos, sistemas };
}

export type BancoWa = Awaited<ReturnType<typeof bancoWa>>;

/** Registra al paciente, pide su codigo, lo manda desde su WhatsApp y lo confirma desde su cuenta. */
export async function vinculado(w: BancoWa, id: string, op: { conUno?: boolean } = {}) {
  const p = paciente(id);
  await alta(w, p);
  const usuario = `usr-${p.id}`;
  const { codigo } = await w.portal.whatsapp.codigo(p.clinica, usuario);
  const cl = w.cliente(p.clinica, waIdDe(p, op.conUno ?? true), p.registro.nombre);
  cl.escribe(`Hola, quiero vincular mi WhatsApp. Mi código es ${codigo}`);
  await w.asienta();
  const r = await w.portal.whatsapp.confirma(p.clinica, usuario);
  if (!r.ok) throw new Error(`no se vinculó: ${r.mensaje}`);
  await w.asienta();
  return { p, usuario, cl };
}

/** Los textos que la persona VE en su WhatsApp (cuerpo de texto, botones, plantilla renderizada o Flow). */
export const vistos = (cl: { recibidos: Array<{ resumen: string }> }): string[] => cl.recibidos.map((r) => r.resumen);
