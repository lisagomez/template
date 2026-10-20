/**
 * La puerta de salida: la API de OpenWA 0.25.0 servida sobre el BSP oficial. Las rutas salen de la MATRIZ generada
 * del contrato pineado; cada operación `igual` o `diferencia` tiene su manejador, y las demás contestan 501 con la
 * nota, la alternativa oficial y la fuente de su fila (nunca se simulan). Antes de despachar: la llave, su rol y su
 * alcance. La fachada no registra nada: ni cuerpos, ni teléfonos, ni llaves.
 *
 * Es compatible con la API de OpenWA; no es OpenWA ni habla en su nombre.
 */
import { randomUUID } from 'node:crypto';
import { relojDelSistema } from '../comun/base.js';
import { creaEstadoOpenWA, sesionDe, type Contexto, type Manejador, type Puertos } from './contexto.js';
import { recibeDeMeta } from './entrante.js';
import * as ev from './eventos.js';
import * as lec from './lecturas.js';
import * as ll from './llaves.js';
import * as lot from './lotes.js';
import * as env from './manejadores-envio.js';
import { MATRIZ_OPENWA, type FilaMatriz } from './matriz.js';
import * as pl from './plantillas.js';
import { falla, iso, responde } from './respuestas.js';
import * as ses from './sesiones.js';
import type { Llave, OpcionesFachada, Peticion, Respuesta, Rol } from './tipos.js';

export const VERSION_FACHADA = '0.1.0';

const salud: Record<string, Manejador> = {
  HealthController_check: async (c) => responde(200, { status: 'ok', timestamp: iso(c.p.reloj()), ...(c.llave.id ? { version: `ventas-whatsapp ${VERSION_FACHADA} (compatible con la API de OpenWA 0.25.0)` } : {}) }),
  HealthController_liveness: async () => responde(200, { status: 'ok' }),
  HealthController_readiness: async () => responde(200, { status: 'ok', details: { fachada: { status: 'up' } } }),
};

export const MANEJADORES: Readonly<Record<string, Manejador>> = {
  ...salud,
  AuthController_findAll: ll.lista, AuthController_create: ll.crea, AuthController_findOne: ll.una, AuthController_update: ll.actualiza,
  AuthController_revoke: ll.revoca, AuthController_delete: ll.borra, AuthValidateController_validate: ll.validaLlave,
  SessionController_create: ses.creaSesion, SessionController_findAll: ses.listaSesiones, SessionController_findOne: ses.unaSesion,
  SessionController_start: ses.iniciaSesion, SessionController_stop: ses.detieneSesion, SessionController_logout: ses.detieneSesion, SessionController_delete: ses.borraSesion,
  SessionController_getChats: lec.chats, SessionController_markChatRead: lec.marcaLeido, SessionController_sendChatState: lec.escribiendo,
  MessageController_sendText: env.enviaTexto, MessageController_reply: env.respondeMensaje, MessageController_sendImage: env.enviaMedio('imagen'),
  MessageController_sendVideo: env.enviaMedio('video'), MessageController_sendAudio: env.enviaMedio('audio'), MessageController_sendDocument: env.enviaMedio('documento'),
  MessageController_sendSticker: env.enviaMedio('sticker'), MessageController_sendLocation: env.enviaUbicacion, MessageController_sendContact: env.enviaContacto,
  MessageController_sendTemplate: env.enviaPlantilla, MessageController_react: env.reacciona, MessageController_sendBulk: lot.enviaLote,
  MessageController_getBatchStatus: lot.estadoDeLote, MessageController_cancelBatch: lot.cancelaLote, MessageController_getMessages: lec.listaMensajes,
  MessageController_getReactions: lec.reacciones, CatalogController_sendProduct: env.enviaProducto,
  ContactController_findAll: lec.contactos, ContactController_findOne: lec.unContacto, ContactController_blockContact: lec.bloquea,
  ContactController_unblockContact: lec.desbloquea, ContactController_getBlockedContacts: lec.bloqueados, ProfileController_setStatus: lec.acercaDe,
  TemplateController_findBySession: pl.plantillasDeSesion, TemplateController_create: pl.creaPlantilla, TemplateController_findOne: pl.unaPlantilla,
  TemplateController_update: pl.actualizaPlantilla, TemplateController_delete: pl.borraPlantilla,
  WebhookController_findBySession: ev.webhooksDeSesion, WebhookController_create: ev.creaWebhook, WebhookController_findOne: ev.unWebhook,
  WebhookController_update: ev.actualizaWebhook, WebhookController_delete: ev.borraWebhook, WebhookController_test: ev.pruebaWebhook,
  WebhooksListController_findAll: ev.todosLosWebhooks, WebhooksListController_deliveryFailures: ev.fallasDeEntrega, WebhooksListController_redriveDeliveryFailures: ev.redrive,
};

/** Las que el contrato publica sin llave (salud, métricas, ingress de plugins). */
const PUBLICAS = new Set(['HealthController_check', 'HealthController_liveness', 'HealthController_readiness', 'InfraStatusController_healthCheck', 'MetricsController_scrape',
  ...['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].map((m) => `IngressController_receive_${m}`)]);
const SOLO_ADMIN = new Set(['AuthController_findAll', 'AuthController_create', 'AuthController_findOne', 'AuthController_update', 'AuthController_revoke', 'AuthController_delete',
  'WebhooksListController_deliveryFailures', 'WebhooksListController_redriveDeliveryFailures']);
const LECTURA_DE_OPERADOR = new Set(['TemplateController_findBySession', 'TemplateController_findOne', 'WebhookController_findBySession', 'WebhookController_findOne', 'WebhooksListController_findAll']);

/** El rol mínimo, como lo documenta OpenWA: ADMIN las llaves y las entregas fallidas; VIEWER las lecturas; OPERATOR lo demás. */
export function rolMinimo(f: FilaMatriz): Rol {
  if (SOLO_ADMIN.has(f.operacion)) return 'admin';
  if (f.operacion === 'AuthValidateController_validate') return 'viewer';
  return f.metodo === 'GET' && !LECTURA_DE_OPERADOR.has(f.operacion) ? 'viewer' : 'operator';
}

const CODIGOS_501: Record<string, string> = { imposible: 'NO_DISPONIBLE_EN_LA_VIA_OFICIAL', pendiente: 'PENDIENTE_EN_ESTA_FACHADA', fuera: 'FUERA_DE_ALCANCE' };

/** Las rutas del contrato, las literales antes que las de parámetro (`contacts/blocked` gana a `contacts/{id}`). */
const RUTAS = MATRIZ_OPENWA.map((f) => {
  const nombres: string[] = [];
  const patron = f.ruta.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{([^}]+)\}/g, (_, n: string) => { nombres.push(n); return '([^/]+)'; });
  return { f, re: new RegExp(`^${patron}/?$`), nombres };
}).sort((a, b) => a.nombres.length - b.nombres.length || b.f.ruta.length - a.f.ruta.length);

export function encuentra(metodo: string, ruta: string): { f: FilaMatriz; params: Record<string, string> } | null {
  for (const r of RUTAS) {
    if (r.f.metodo !== metodo.toUpperCase()) continue;
    const m = r.re.exec(ruta);
    if (m) return { f: r.f, params: Object.fromEntries(r.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1] ?? '')])) };
  }
  return null;
}

function noDisponible(c: Contexto, f: FilaMatriz): Respuesta {
  // La liga de alta solo va a quien alcanza esa sesión: una llave con alcance no se lleva la de otra pyme.
  const s = f.regla === 'sin-qr' ? sesionDe(c) : null;
  const liga = s?.ok ? c.p.altas.ligaDeAlta(s.s.id) : undefined;
  return falla(501, `${f.metodo} ${f.ruta}: ${f.nota}`, {
    code: CODIGOS_501[f.estado] ?? 'NO_DISPONIBLE', estado: f.estado, alternativa: `${f.alternativa ?? 'Sin alternativa por la vía oficial.'}${liga ? ` Liga de alta: ${liga}` : ''}`,
    fuente: f.fuente, certeza: f.certeza, ...(liga ? { signupUrl: liga } : {}),
  });
}

export function creaFachada(o: OpcionesFachada) {
  const estado = creaEstadoOpenWA();
  const reloj = o.reloj ?? relojDelSistema;
  const ids = o.ids ?? randomUUID;
  const espera = o.espera ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const enCurso = new Set<Promise<void>>();
  const fondo = (t: Promise<void>) => { const x = t.catch(() => undefined).finally(() => enCurso.delete(x)); enCurso.add(x); };
  const p: Puertos = {
    graph: o.graph, administracion: o.administracion, altas: o.altas, entregaWebhook: o.entregaWebhook, espera, reloj, ids,
    idiomaPlantillas: o.idiomaPlantillas ?? 'es_MX', categoriaPlantillas: o.categoriaPlantillas ?? 'marketing', contactosNuevosPorHora: o.contactosNuevosPorHora ?? 40,
    entregador: ev.creaEntregador({ estado, entrega: o.entregaWebhook, reloj, ids, espera, fondo }),
    sincroniza: (s) => ses.sincroniza({ p }, s),
    fondo,
  };

  async function atiende(peticion: Peticion): Promise<Respuesta> {
    const e = encuentra(peticion.metodo, peticion.ruta);
    if (!e) return falla(404, `Cannot ${peticion.metodo.toUpperCase()} ${peticion.ruta}`);
    let llave: Llave = { id: '', name: '', keyPrefix: '', hash: '', role: 'viewer', allowedIps: [], allowedSessions: [], allowedChats: [], isActive: true, usageCount: 0, createdAt: iso(0) };
    if (!PUBLICAS.has(e.f.operacion) || ll.llaveDeLaPeticion(peticion)) {
      const a = ll.autentica(estado, o.llaveMaestra, peticion, reloj);
      if (!a.ok && !PUBLICAS.has(e.f.operacion)) return a.r;
      if (a.ok) llave = a.llave;
    }
    const c: Contexto = { p, estado, llave, params: e.params, peticion };
    if (e.f.estado !== 'igual' && e.f.estado !== 'diferencia') return noDisponible(c, e.f);
    if (!PUBLICAS.has(e.f.operacion) && !ll.alcanza(llave, rolMinimo(e.f))) return falla(403, `La llave (${llave.role}) no alcanza esta operación: pide ${rolMinimo(e.f)}`);
    const manejador = MANEJADORES[e.f.operacion];
    if (!manejador) return falla(500, `Sin manejador para ${e.f.operacion}`);
    try {
      return await manejador(c);
    } catch {
      return falla(500, 'Error interno de la fachada');
    }
  }

  return {
    atiende,
    /** El webhook de Meta (cuerpo crudo + `X-Hub-Signature-256`) → eventos de OpenWA. */
    recibeDeMeta: (crudo: string, firma: string | undefined) => recibeDeMeta({ p, estado }, o.secretoApp, crudo, firma),
    /** Espera el trabajo de fondo (lotes y entregas a los webhooks). */
    asienta: async () => { while (enCurso.size) await Promise.all([...enCurso]); },
    estado,
  };
}

export type FachadaOpenWA = ReturnType<typeof creaFachada>;
