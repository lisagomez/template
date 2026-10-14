/**
 * El circuito completo EN PROCESO: la app (vendedor) y Meta simulada, conectados como lo estarían
 * por HTTP pero sin red. Dos pymes ficticias, cada una con su WABA, número, catálogo, dataset y
 * Flows publicados. Lo usan las pruebas, las métricas del laboratorio y las transcripciones.
 */
import { generateKeyPairSync } from 'node:crypto';
import { idsSecuenciales, relojManual, type RelojManual } from '../comun/base.js';
import { almacenEnMemoria } from '../almacen/almacen.js';
import { CABECERA_FIRMA } from '../meta/firma.js';
import { CABECERA_FIRMA_PROCESADOR } from '../dominios/pagos.js';
import { leeCsvCatalogo } from '../dominios/catalogo.js';
import { modeloSimulado, type ModeloLenguaje } from '../agente/modelos.js';
import { creaVendedor, PLANTILLAS, type OpcionesVendedor } from '../vendedor.js';
import { creaMetaSimulada } from '../simulador/meta.js';
import { creaProcesadorSimulado, DOMINIO_PAGOS_SIMULADO } from '../simulador/procesador.js';
import { CSV_RESTAURANTE, CSV_TIENDA, restaurante, tienda } from './pymes.js';
import type { Inquilino } from '../modelo.js';
import type { BusA2A, ContextoDominio } from '../agente/a2a-modelo.js';

/** Lunes 5 de octubre de 2026, 12:00 en Veracruz: ya rige el cobro de mensajes de servicio. */
export const INICIO_LABORATORIO = Date.parse('2026-10-05T18:00:00Z');

export interface OpcionesCircuito {
  modelo?: ModeloLenguaje;
  reloj?: RelojManual;
  duplicaSi?: (n: number) => boolean;
  desordena?: boolean;
  /** Definiciones de Flow por tipo (los JSON de `flows/`). Sin ellas no se publica ningún Flow. */
  flows?: Record<string, Record<string, unknown>>;
  /** Fase 3: construye los destinos A2A remotos con lo que el circuito ya tiene. */
  remotos?: (deps: DepsRemotos) => OpcionesVendedor['remotos'];
  optimizacion?: OpcionesVendedor['optimizacion'];
  /** Cadena de hashes encendida por omisión en el laboratorio. */
  sinTrazabilidad?: boolean;
}

export interface DepsRemotos {
  /** El contexto de dominio de un inquilino (lo que una pasarela remota daría a su agente). */
  contexto: (tenant: string) => Promise<Omit<ContextoDominio, 'bus'>>;
  bus: () => BusA2A;
  reloj: () => number;
}

export function creaCircuito(o: OpcionesCircuito = {}) {
  const reloj = o.reloj ?? relojManual(INICIO_LABORATORIO);
  const secretos = { app: 'secreto-de-app-laboratorio', verifyToken: 'token-verificacion-laboratorio', tokensFlow: 'secreto-flow-tokens-laboratorio' };
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const almacen = almacenEnMemoria();
  let vendedorRef: ReturnType<typeof creaVendedor> | null = null;
  const vendedor = () => vendedorRef!;

  const meta = creaMetaSimulada({
    secretoApp: secretos.app, reloj,
    entrega: async (cuerpo, cab) => vendedor().webhook.recibe(cuerpo, cab[CABECERA_FIRMA]).status,
    endpointFlows: (cuerpo, cab) => vendedor().flows.endpoint(cuerpo, cab[CABECERA_FIRMA]),
    ...(o.duplicaSi ? { duplicaSi: o.duplicaSi } : {}), ...(o.desordena ? { desordena: true } : {}),
  });
  const procesador = creaProcesadorSimulado({ secreto: 'secreto-procesador-laboratorio', reloj, entrega: async (cuerpo, cab) => (await vendedor().pagos.recibe(cuerpo, cab[CABECERA_FIRMA_PROCESADOR])).status });

  const idsRemotos = idsSecuenciales('r');
  const remotos = o.remotos?.({
    contexto: async (tenant) => {
      const inquilino = await almacen.inquilino(tenant);
      if (!inquilino) throw new Error('inquilino desconocido');
      return { inquilino, datos: almacen.de(tenant), reloj, ids: idsRemotos, servicios: { graph: meta.graph, pagos: procesador.conector } };
    },
    bus: () => vendedor().bus, reloj,
  });
  vendedorRef = creaVendedor({
    almacen, graph: meta.graph, pagos: procesador.conector, modelo: o.modelo ?? modeloSimulado(), secretos, llavePrivadaFlows: privateKey,
    dominiosLiga: [DOMINIO_PAGOS_SIMULADO], reloj, ids: idsSecuenciales(), ...(remotos ? { remotos } : {}), ...(o.optimizacion ? { optimizacion: o.optimizacion } : {}),
    ...(o.sinTrazabilidad ? {} : { trazabilidad: { llaveHuella: 'llave-huellas-laboratorio' } }),
  });

  const alta = async (fabrica: (c: Inquilino['canal']) => Inquilino, n: number, csv: string) => {
    const canal = { wabaId: `waba_${n}`, phoneNumberId: `pn_${n}`, telefonoVisible: `52229000000${n}`, datasetId: `ds_${n}`, catalogoId: `cat_${n}`, flows: {} };
    const flows = meta.registraNumero({ ...canal, token: `token-sistema-${n}`, llavePublicaFlows: publicKey, plantillas: PLANTILLAS, ...(o.flows ? { flows: o.flows } : {}) });
    const inquilino = fabrica({ ...canal, flows });
    await almacen.guardaInquilino(inquilino);
    await vendedor().panel.sincronizaCatalogo(inquilino.id, csv);
    meta.cargaCatalogo(canal.catalogoId, leeCsvCatalogo(csv).productos);
    return inquilino;
  };

  async function asienta(maxRondas = 40) {
    for (let r = 0; r < maxRondas; r++) {
      await meta.drena();
      await vendedor().webhook.drena();
      if (!meta.pendientes() && !vendedor().webhook.pendientes()) return;
    }
    throw new Error('el circuito no se asentó');
  }

  return {
    reloj, meta, procesador, almacen, secretos, llavePublicaFlows: publicKey,
    get vendedor() { return vendedor(); },
    async prepara() {
      const r = await alta(restaurante, 1, CSV_RESTAURANTE);
      const t = await alta(tienda, 2, CSV_TIENDA);
      return { restaurante: r, tienda: t };
    },
    asienta,
  };
}

export type Circuito = ReturnType<typeof creaCircuito>;
