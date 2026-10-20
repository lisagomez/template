/**
 * Las formas de la puerta de salida de OpenWA: lo que guarda (llaves, sesiones, webhooks, plantillas, mensajes,
 * contactos, lotes, entregas fallidas) y los puertos que se le inyectan (Graph API, administración de Meta, el BSP).
 * La fachada es compatible con la API de OpenWA 0.25.0; NO es OpenWA ni habla en su nombre.
 */
import type { Reloj } from '../comun/base.js';
import type { AdministracionGraph } from '../meta/administracion.js';
import type { ClienteGraph } from '../meta/graph.js';
import type { CategoriaPlantilla } from '../meta/mensajes.js';

export type Rol = 'admin' | 'operator' | 'viewer';
/** De menos a más: un rol puede lo de los anteriores. */
export const ROLES: readonly Rol[] = ['viewer', 'operator', 'admin'];

export interface Llave {
  id: string;
  name: string;
  keyPrefix: string;
  /** sha256 de la llave; la llave en claro solo sale una vez, al crearla. */
  hash: string;
  role: Rol;
  allowedIps: string[];
  allowedSessions: string[];
  allowedChats: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
}

export interface NumeroDeSesion { phoneNumberId: string; wabaId: string; telefono: string; catalogoId?: string; estado: 'activa' | 'falta_metodo_pago' }

/** El BSP visto desde la fachada: la liga de alta de una sesión y el número que dejó el alta. */
export interface AltasOpenWA {
  ligaDeAlta(sesionId: string): string;
  numero(sesionId: string): Promise<NumeroDeSesion | null>;
}

export interface Sesion {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  iniciada: boolean;
  detenida: boolean;
  /** El número cuando el alta quedó activa (se refresca con el BSP). */
  numero?: NumeroDeSesion;
  connectedAt?: string;
  lastActive?: string;
  /** El último estado publicado en `session.status`. */
  publicado?: string;
}

export interface CondicionFiltro { field: string; operator: 'is' | 'isNot' | 'contains' | 'equals'; value: string | string[] | boolean; caseSensitive?: boolean }

export interface WebhookOW {
  id: string;
  sessionId: string;
  url: string;
  events: string[];
  secret?: string;
  headers: Record<string, string>;
  filters: { conditions: CondicionFiltro[] } | null;
  active: boolean;
  retryCount: number;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlantillaOW {
  id: string;
  sessionId: string;
  name: string;
  body: string;
  header: string | null;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
  /** Nombre de la plantilla en Meta (minúsculas, guion bajo) y sus variables en el orden de `{{1}}`, `{{2}}`… */
  metaNombre: string;
  variables: string[];
  metaEstado: 'pending' | 'approved' | 'rejected';
}

export interface ReaccionOW { senderId: string; emoji: string; timestamp: number }

export interface MensajeOW {
  id: string;
  sessionId: string;
  waMessageId: string;
  chatId: string;
  chatName: string | null;
  from: string;
  to: string;
  body: string | null;
  type: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
  reacciones: ReaccionOW[];
}

/** Un chat 1:1 que pasó por la fachada (la Cloud API no tiene libreta ni lista de chats). */
export interface ContactoOW {
  sessionId: string;
  /** La forma normalizada (llave interna). */
  chatId: string;
  /** La forma que ve el integrador: la que reportó Meta o la que él usó primero. México: `521…` no se vuelve `52…`. */
  chatPublico: string;
  waId: string;
  nombre?: string;
  primerContacto: number;
  ultimoEntrante?: { id: string; instante: number };
  noLeidos: number;
  ultimo?: { texto: string; tipo: string; instante: number };
}

export interface ResultadoLote { chatId: string; status: 'pending' | 'sent' | 'failed' | 'cancelled'; messageId?: string; error?: { code: string; message: string }; sentAt?: string }
export interface LoteOW {
  batchId: string;
  sessionId: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  results: ResultadoLote[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface FallaEntrega {
  id: string;
  webhookId: string;
  sessionId: string;
  event: string;
  url: string;
  idempotencyKey: string | null;
  deliveryId: string | null;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string;
  createdAt: string;
  replayable: boolean;
  cuerpo: string;
}

export interface Peticion {
  metodo: string;
  /** La ruta desde `/api/...`, sin el prefijo del host. */
  ruta: string;
  consulta: URLSearchParams;
  cabeceras: Record<string, string | undefined>;
  cuerpo: unknown;
  ip?: string;
}

export interface Respuesta { status: number; cuerpo?: unknown; cabeceras?: Record<string, string> }

export type EntregaWebhook = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ status: number }>;

export interface OpcionesFachada {
  graph: ClienteGraph;
  administracion: AdministracionGraph;
  altas: AltasOpenWA;
  /** La llave ADMIN sin alcance de quien opera la fachada. Viene de un almacén de secretos; nunca se imprime. */
  llaveMaestra: string;
  /** El secreto de la app de Meta, para verificar los webhooks que llegan de Meta. */
  secretoApp: string;
  entregaWebhook: EntregaWebhook;
  reloj?: Reloj;
  ids?: () => string;
  /** Espera entre envíos de un lote y entre reintentos de entrega (en pruebas, inmediata). */
  espera?: (ms: number) => Promise<void>;
  idiomaPlantillas?: string;
  /** Meta puede recategorizar; por defecto se declara marketing para que el costo no sorprenda hacia arriba. */
  categoriaPlantillas?: CategoriaPlantilla;
  /** Contactos NUEVOS (primer mensaje del negocio) por sesión y por hora. FICTICIO hasta medir el piloto. */
  contactosNuevosPorHora?: number;
}
