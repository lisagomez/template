/**
 * El canal de WhatsApp del portal, visto desde el NUCLEO: que se manda (`MensajeWa`), que llega (`EventoWa`) y el
 * PUERTO por el que sale (`PuertoWhatsApp`). El nucleo no sabe si del otro lado esta la Cloud API, un BSP o el
 * simulador de `@tu-scope/ventas-whatsapp`: el adaptador se inyecta y el real se niega sin gate (`canales/gate.ts`).
 *
 * Las formas de `EventoWa` son un SUBCONJUNTO estructural de los eventos que normaliza
 * `@tu-scope/ventas-whatsapp` (`leeWebhook`): la app le pasa esos eventos tal cual, sin traducir.
 */

/** Los Flows del portal: cada uno es un formulario de WhatsApp que la PERSONA confirma; el asistente no actua. */
export type FlujoWa = 'agendar' | 'reprogramar' | 'cancelar';

export type MensajeWa =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'botones'; cuerpo: string; botones: Array<{ id: string; titulo: string }>; pie?: string }
  | { tipo: 'cta_url'; cuerpo: string; textoBoton: string; url: string }
  | { tipo: 'flow'; cuerpo: string; cta: string; flujo: FlujoWa; flowToken: string; pantalla: string; datos?: Record<string, unknown> }
  | { tipo: 'plantilla'; nombre: string; idioma: string; parametros: string[]; botones?: Array<{ payload: string }> };

export type ResultadoWa = { ok: true; wamid: string } | { ok: false; codigo: number; detalle: string };

export interface PuertoWhatsApp {
  /** Manda UN mensaje desde el numero de la clinica. Un resultado ok es «Meta lo acepto», no «se entrego». */
  envia(clinica: string, waId: string, m: MensajeWa): Promise<ResultadoWa>;
  /** Baja un medio que llego por webhook (solo notas de voz: una foto nunca se baja). `null` si no se pudo. */
  descargaMedio(clinica: string, idMedio: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
}

export interface EntranteWa {
  clase: 'mensaje';
  phoneNumberId: string;
  /** Normalizado (52 + 10 digitos en Mexico). Vacio si Meta solo mando el BSUID de un nombre de usuario. */
  waId: string;
  usuarioId?: string;
  wamid: string;
  instante: number;
  tipo: string;
  texto?: string;
  boton?: { payload: string; texto: string };
  interactivo?: { tipo: 'boton' | 'lista'; id: string; titulo: string } | { tipo: 'flow'; respuesta: Record<string, unknown> };
  medio?: { clase: string; id: string; mime: string; voz?: boolean; caption?: string };
  respondeA?: string;
}

export interface EstadoWa {
  clase: 'estado';
  phoneNumberId: string;
  wamid: string;
  estado: 'sent' | 'delivered' | 'read' | 'played' | 'failed';
  instante: number;
  destinatario: string;
  precio?: { billable: boolean; tipo: string; categoria: string };
  errores?: Array<{ codigo?: number; titulo?: string }>;
}

export interface EcoWa { clase: 'eco'; phoneNumberId: string; waId: string; wamid: string; instante: number }
export interface CuentaWa { clase: 'cuenta'; wabaId: string; evento: string }
export interface PlantillaWa { clase: 'plantilla'; wabaId: string; nombre: string; estado?: string; categoria?: string }
export interface OtroWa { clase: 'historial' | 'evento_automatico' | 'desconocido'; wabaId: string }

export type EventoWa = EntranteWa | EstadoWa | EcoWa | CuentaWa | PlantillaWa | OtroWa;

/** El numero de WhatsApp de una clinica: lo pone quien arma el portal (no es dato de la clinica declarada). */
export interface NumeroClinica { clinica: string; phoneNumberId: string; wabaId: string; telefonoVisible: string }
