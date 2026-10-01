/**
 * El modelo de datos del producto. `tenant` va en TODO desde el día uno (fuente §Modelo de datos):
 * cada documento vive dentro de su inquilino y no hay consulta que cruce inquilinos.
 */
import type { PrecioMeta } from './meta/webhook.js';
import type { Ventanas } from './meta/tarifas.js';

export type Giro = 'restaurante' | 'tienda' | 'servicios';

export interface Faq {
  id: string;
  pregunta: string;
  respuesta: string;
  /** Palabras que la disparan (ya plegadas: sin acentos, minúsculas). */
  claves: string[];
}

export interface Politicas {
  /** Un pedido por encima de esto pasa al dueño (centavos). */
  umbralTraspasoCentavos: number;
  /** Cuánto se calla el agente en un chat después de que el dueño contesta desde su celular. */
  pausaPorEcoMs: number;
  maxTurnosConversacion: number;
  maxTokensConversacion: number;
  /** Tokens de IA al mes para todo el inquilino. Al agotarse, las conversaciones pasan al dueño. */
  presupuestoTokensMensual: number;
  horario: string;
  /** Colonias o códigos postales con entrega, y su costo. */
  cobertura?: Array<{ zona: string; costoCentavos: number; minutos: number }>;
  citas?: { servicios: Array<{ id: string; nombre: string; minutos: number; precioCentavos: number; /** Cuántas a la vez (mesas de ese tamaño). */ capacidad?: number }>; apertura: number; cierre: number; diasAbiertos: number[] };
  /** Temas del giro que el agente NO trata aunque parezcan del negocio (p. ej. alcohol). */
  temasRestringidos: string[];
}

export interface Inquilino {
  id: string;
  nombre: string;
  giro: Giro;
  ciudad: string;
  pais: string;
  moneda: string;
  zonaHoraria: string;
  canal: { wabaId: string; phoneNumberId: string; telefonoVisible: string; datasetId: string; catalogoId: string; flows: Partial<Record<'entrega' | 'reserva' | 'lead' | 'checkout', string>> };
  dueno: { nombre: string };
  politicas: Politicas;
  faqs: Faq[];
  estado: 'activo' | 'pausado';
  motivoPausa?: string;
  /** Datos sintéticos y declarados: este negocio no existe. */
  ficticio: true;
}

export interface Contacto {
  waId: string;
  nombre?: string;
  optIn?: { fecha: number; fuente: string };
  avisoPrivacidadEn?: number;
  creadoEn: number;
}

export type TipoOrigen = 'anuncio' | 'organico' | 'directo';

export interface Origen {
  tipo: TipoOrigen;
  ctwaClid?: string;
  anuncioId?: string;
  campanaId?: string;
  /** Etiqueta orgánica del mensaje prellenado: QR-MESA, IG-BIO, TICKET, WEB-HERO… */
  etiqueta?: string;
  registradoEn: number;
}

export type EstadoConversacion = 'agente' | 'humano' | 'pausada_eco';

export interface Conversacion {
  id: string;
  /** El `contextId` de A2A: uno por conversación e inquilino. */
  contextId: string;
  waId: string;
  abiertaEn: number;
  ultimoMensajeEn: number;
  ventanas: Ventanas;
  origen: Origen;
  historialOrigenes: Origen[];
  estado: EstadoConversacion;
  pausadaHasta?: number;
  fallosComprension: number;
  turnos: number;
  tokens: number;
  /** Ya se reportó LeadSubmitted. */
  leadReportado: boolean;
  intencionCompra: boolean;
  /** El primer mensaje del cliente y la primera respuesta, para medir la primera respuesta. */
  primerEntranteEn?: number;
  primeraRespuestaEn?: number;
  carritoId?: string;
  /** Hasta qué cierre de ventana ya se avisó al dueño (para avisar una vez por ventana). */
  avisoVentanaHasta?: number;
}

export type AutorMensaje = 'cliente' | 'agente' | 'dueno' | 'sistema';

export interface Mensaje {
  wamid: string;
  conversacionId: string;
  waId: string;
  direccion: 'entrante' | 'saliente' | 'eco' | 'historial';
  autor: AutorMensaje;
  tipo: string;
  resumen: string;
  instante: number;
  estado?: string;
  /** Lo que Meta dijo en el webhook de estado. */
  precio?: PrecioMeta;
  /** Lo que la app estimó al enviar (micro-dólares). */
  costoEstimadoMicros?: number;
  /** Con el `pricing` de Meta y la tarjeta (micro-dólares). */
  costoMicros?: number;
  categoria?: string;
}

export interface ItemPedido {
  retailerId: string;
  nombre: string;
  cantidad: number;
  precioCentavos: number;
}

export type EstadoPedido = 'carrito' | 'por_pagar' | 'pagado' | 'fallido' | 'cancelado' | 'en_revision';

export interface Pedido {
  id: string;
  conversacionId: string;
  waId: string;
  items: ItemPedido[];
  subtotalCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  moneda: string;
  estado: EstadoPedido;
  /** El `wamid` del mensaje `order` que lo creó: la llave de idempotencia. */
  origenWamid: string;
  liga?: { id: string; url: string };
  entrega?: { zona: string; direccion: string; horario: string };
  facturacion?: { rfc?: string; razonSocial?: string };
  pagoId?: string;
  pagadoEn?: number;
  creadoEn: number;
  notas: string[];
}

export interface Pago {
  id: string;
  pedidoId: string;
  montoCentavos: number;
  moneda: string;
  estado: 'pagado' | 'fallido';
  recibidoEn: number;
  duplicadosIgnorados: number;
}

export interface Cita {
  id: string;
  conversacionId: string;
  waId: string;
  servicioId: string;
  inicio: number;
  fin: number;
  estado: 'confirmada' | 'cancelada';
}

export type MotivoTraspaso = 'queja' | 'monto' | 'comprension' | 'presupuesto' | 'solicitud' | 'inquilino_sin_presupuesto' | 'modelo_no_disponible';

export interface Caso {
  id: string;
  conversacionId: string;
  waId: string;
  motivo: MotivoTraspaso;
  detalle: string;
  abiertoEn: number;
  estado: 'abierto' | 'tomado' | 'liberado';
  tomadoEn?: number;
  liberadoEn?: number;
}

export interface EventoConversion {
  /** `event_id` para Meta: `<pedido>:Purchase` o `<conversación>:LeadSubmitted`. Único. */
  eventId: string;
  nombre: 'Purchase' | 'LeadSubmitted';
  conversacionId: string;
  pedidoId?: string;
  valorCentavos?: number;
  moneda?: string;
  ctwaClid?: string;
  campanaId?: string;
  estado: 'pendiente' | 'aceptado' | 'rechazado' | 'sin_clid';
  intentos: number;
  ultimaRespuesta?: string;
  enviadoEn?: number;
  instante: number;
}

export interface EventoAutomaticoRegistrado {
  wamid: string;
  nombre: string;
  instante: number;
  ctwaClid?: string;
  valorCentavos?: number;
}

export interface UsoIa {
  id: string;
  instante: number;
  conversacionId: string;
  modelo: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** `null` si no hubo datos de uso: nunca se cuenta como cero. */
  costoMicros: number | null;
  simulado: boolean;
}

export interface Alerta {
  id: string;
  instante: number;
  nivel: 'info' | 'aviso' | 'grave';
  texto: string;
}

export interface Qr {
  codigo: string;
  etiqueta: string;
  mensaje: string;
  ligaCorta: string;
  urlImagen: string;
}

export interface Colecciones {
  contactos: Contacto;
  conversaciones: Conversacion;
  mensajes: Mensaje;
  productos: import('./dominios/catalogo.js').Producto;
  pedidos: Pedido;
  pagos: Pago;
  citas: Cita;
  casos: Caso;
  eventos: EventoConversion;
  automaticos: EventoAutomaticoRegistrado;
  usoIa: UsoIa;
  alertas: Alerta;
  qrs: Qr;
  historial: { waId: string; mensajes: Array<{ de: string; wamid: string; instante: number; tipo: string; texto?: string }>; fases: number[] };
  tareas: import('./agente/a2a-modelo.js').Tarea;
  gastoAnuncios: { campanaId: string; nombre: string; gastoCentavos: number; anuncios: string[]; actualizadoEn: number };
  leads: Lead;
  cadena: import('./trazabilidad/cadena.js').Eslabon;
  bitacora: { id: string; instante: number; conversacionId: string; tipo: string; detalle: string };
  origenes: Origen & { conversacionId: string; waId: string };
}

export interface Lead {
  conversacionId: string;
  waId: string;
  respuestas: Record<string, string>;
  puntaje: number;
  calificado: boolean;
  instante: number;
}

export type NombreColeccion = keyof Colecciones;
