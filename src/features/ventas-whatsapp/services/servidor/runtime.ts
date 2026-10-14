/**
 * El vendedor del proceso de Next: un solo ejemplar, armado con lo que dice la configuración.
 * - almacén: un archivo JSON en `.datos/ventas-whatsapp/` (fuera de git). La base de datos
 *   compartida NO se toca: el esquema con RLS es una propuesta validada en efímero.
 * - transporte: Graph API multi-inquilino (en el laboratorio, el simulador).
 * - pagos: el procesador por su conector HTTP (en el laboratorio, el simulado).
 * - modelo: SIEMPRE el simulado. El real queda fuera hasta el CDC del routing y la firma.
 * - fase 3: con llave de firma, `pedidos` y `atribucion` van por la pasarela A2A (SDK oficial).
 */
import { createHmac, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { join, resolve } from 'node:path';
import { verifyAgentCardSignature } from '@a2a-js/sdk';
import { almacenArchivo, anclasEnArchivo, colaEnArchivo, poolEnArchivo, registroAltasEnArchivo } from '../../../../../tools/ventas-whatsapp/dist/almacen/archivo.js';
import { creaMetaBspSimulada, creaRegistroNumerosSimulado, type MetaBspSimulada } from '../../../../../tools/ventas-whatsapp/dist/simulador/index.js';
import { creaPasarelaA2A, destinoRemoto, emiteTokenA2A } from '../../../../../tools/ventas-whatsapp/dist/a2a/index.js';
import {
  agenteAtribucion, agentePedidos, bovedaEnMemoria, canonico, clienteGraphMultiInquilino, conectorPagosHttp, creaBsp, creaGestorNumeros, creaVendedor, idsAleatorios, modeloSimulado,
  type Almacen, type AlmacenAnclas, type Ancla, type Bsp, type Destino, type GestorNumeros, type Vendedor,
} from '../nucleo.ts';
import { configuracion } from './configuracion.ts';

const KID = 'plataforma-laboratorio';
let vendedor: Vendedor | null = null;
let almacenProceso: Almacen | null = null;
let pasarela: ReturnType<typeof creaPasarelaA2A> | null = null;
/** Anclas de la cadena: su archivo, su llave de firma y su verificador (fuera del almacén del inquilino). */
let anclaje: { anclas: AlmacenAnclas; firmar: (a: Omit<Ancla, 'firma'>) => string; verifica: (a: Omit<Ancla, 'firma'>, firma: string) => boolean } | null = null;

export const anclajeDelServidor = () => anclaje;

const pem = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');
const carpetaDatos = () => resolve(/*turbopackIgnore: true*/ process.env['VENTAS_WA_DATOS'] || '.datos/ventas-whatsapp');

export function vendedorDelServidor(): { ok: true; vendedor: Vendedor; pasarela: ReturnType<typeof creaPasarelaA2A> | null } | { ok: false; error: string } {
  const c = configuracion();
  if (!c.ok) return c;
  if (vendedor) return { ok: true, vendedor, pasarela };
  const cfg = c.valor;
  // turbopackIgnore: la carpeta se decide en tiempo de ejecución (aprendizaje del 2026-09-20).
  const carpeta = carpetaDatos();
  const almacen = almacenArchivo(join(/*turbopackIgnore: true*/ carpeta, 'almacen.json'));
  almacenProceso = almacen;
  const graph = clienteGraphMultiInquilino({ base: cfg.VENTAS_WA_GRAPH_URL, fetch, token: (id) => cfg.tokens[id] });
  const pagos = conectorPagosHttp({ base: cfg.VENTAS_WA_PAGOS_URL, secreto: cfg.VENTAS_WA_PAGOS_SECRETO, fetch });
  const ids = idsAleatorios();
  let remotos: Partial<Record<'pedidos' | 'atribucion', Destino>> | undefined;
  if (cfg.VENTAS_WA_A2A_LLAVE && cfg.VENTAS_WA_A2A_SECRETO) {
    const privada = createPrivateKey(pem(cfg.VENTAS_WA_A2A_LLAVE));
    const publica = createPublicKey(privada);
    const secreto = cfg.VENTAS_WA_A2A_SECRETO;
    const base = 'http://localhost/api/ventas-whatsapp';
    pasarela = creaPasarelaA2A({
      base, agentes: [agentePedidos, agenteAtribucion], secretoTokens: secreto, llaveFirma: privada, kid: KID,
      contexto: async (tenant) => {
        const inquilino = await almacen.inquilino(tenant);
        if (!inquilino) throw new Error('inquilino desconocido');
        return { inquilino, datos: almacen.de(tenant), reloj: Date.now, ids, servicios: { graph, pagos } };
      },
      bus: () => vendedor!.bus,
    });
    const p = pasarela;
    const enProceso: typeof fetch = async (entrada, init) => p.atiende(new Request(entrada, init));
    const verificador = verifyAgentCardSignature(async (kid) => { if (kid !== KID) throw new Error('llave desconocida'); return publica; });
    const token = (tenant: string) => emiteTokenA2A(secreto, { tenant, dominios: ['pedidos', 'atribucion'], exp: Date.now() + 3_600_000 });
    remotos = {
      pedidos: destinoRemoto({ dominio: 'pedidos', urlTarjeta: `${base}/a2a/pedidos/.well-known/agent-card.json`, fetch: enProceso, token, verificador }),
      atribucion: destinoRemoto({ dominio: 'atribucion', urlTarjeta: `${base}/a2a/atribucion/.well-known/agent-card.json`, fetch: enProceso, token, verificador }),
    };
  }
  vendedor = creaVendedor({
    almacen, graph, pagos, modelo: modeloSimulado(), ids,
    // El cuerpo verificado se guarda ANTES del 200; al arrancar se reproduce lo pendiente.
    colaDurable: colaEnArchivo(join(/*turbopackIgnore: true*/ carpeta, 'cola')),
    ...(cfg.VENTAS_WA_TRAZA_LLAVE ? { trazabilidad: { llaveHuella: cfg.VENTAS_WA_TRAZA_LLAVE } } : {}),
    secretos: { app: cfg.VENTAS_WA_APP_SECRET, verifyToken: cfg.VENTAS_WA_VERIFY_TOKEN, tokensFlow: cfg.VENTAS_WA_FLOW_SECRET },
    llavePrivadaFlows: createPrivateKey(pem(cfg.VENTAS_WA_FLOWS_LLAVE)),
    dominiosLiga: cfg.VENTAS_WA_DOMINIOS_LIGA.split(',').map((d) => d.trim()).filter(Boolean),
    ...(remotos ? { remotos } : {}),
  });
  if (cfg.VENTAS_WA_ANCLA_LLAVE) {
    const privada = createPrivateKey(pem(cfg.VENTAS_WA_ANCLA_LLAVE));
    const publica = createPublicKey(privada);
    anclaje = {
      anclas: anclasEnArchivo(join(/*turbopackIgnore: true*/ carpeta, 'anclas', 'anclas.json')),
      firmar: (a) => sign(null, Buffer.from(canonico(a)), privada).toString('base64'),
      verifica: (a, firma) => verify(null, Buffer.from(canonico(a)), publica, Buffer.from(firma, 'base64')),
    };
  }
  return { ok: true, vendedor, pasarela };
}

/**
 * La plataforma (N-01 números, N-02 BSP propio), SOLO en el laboratorio: Embedded Signup y el alta de
 * números corren contra simuladores en proceso. Las altas, el embudo, los nonces y el pool viven en
 * archivo; los tokens de negocio, en una bóveda en memoria (P-02 abierta: nunca en un archivo). El
 * secreto de las ligas y los PIN se derivan del secreto de la app con su propia etiqueta.
 */
let plataforma: { bsp: Bsp; numeros: GestorNumeros; metaBsp: MetaBspSimulada; almacen: Almacen } | null = null;

export function plataformaDelServidor(): ({ ok: true } & NonNullable<typeof plataforma>) | { ok: false; error: string } {
  const v = vendedorDelServidor();
  if (!v.ok) return v;
  const cfg = configuracion();
  if (!cfg.ok) return cfg;
  if (cfg.valor.VENTAS_WA_LABORATORIO !== '1') return { ok: false, error: 'el BSP real necesita ser Tech Provider y C3/C4 firmados: hoy solo corre en el laboratorio' };
  if (plataforma) return { ok: true, ...plataforma };
  const app = cfg.valor.VENTAS_WA_APP_SECRET;
  const deriva = (etiqueta: string) => createHmac('sha256', app).update(etiqueta).digest();
  const pin = (id: string) => String(deriva(`pin|${id}`).readUInt32BE(0) % 1_000_000).padStart(6, '0');
  const carpeta = carpetaDatos();
  const reloj = Date.now;
  const metaBsp = creaMetaBspSimulada({ reloj });
  const regNumeros = creaRegistroNumerosSimulado({ reloj, portafolioVerificado: true });
  const numeros = creaGestorNumeros({ pool: poolEnArchivo(join(/*turbopackIgnore: true*/ carpeta, 'numeros.json')), meta: regNumeros.registro, buzon: regNumeros.buzon, reloj, pin });
  const almacen = almacenProceso!;
  const bsp = creaBsp({
    graph: metaBsp.graph, boveda: bovedaEnMemoria(), almacen, reloj, modalidad: 'tech_provider', pin, numeros,
    registro: registroAltasEnArchivo(join(/*turbopackIgnore: true*/ carpeta, 'altas.json')), secretoLigas: deriva('ligas-alta').toString('base64url'),
  });
  plataforma = { bsp, numeros, metaBsp, almacen };
  return { ok: true, ...plataforma };
}

export const almacenDelServidor = () => almacenProceso;
