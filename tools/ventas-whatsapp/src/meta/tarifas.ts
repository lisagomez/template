/**
 * Ventanas de mensajería y precio por mensaje, como los decide Meta. Los datos (tarifas, fechas,
 * cupos) viven en una TARJETA con fuente, fecha y bandera de verificación; la lógica no tiene
 * cifras escritas.
 *
 * Reglas verificadas el 2026-09-30 contra developers.facebook.com/documentation/business-messaging/
 * whatsapp/pricing/ y .../pricing/non-template-messages:
 *  - precio por mensaje entregado (PMP) desde el 1/jul/2025, según categoría y el país del
 *    DESTINATARIO;
 *  - ventana de atención (CSW): 24 h desde el último mensaje DEL CLIENTE; fuera de ella solo
 *    plantillas;
 *  - ventana de entrada gratuita (FEP): si el cliente llega por un anuncio Click-to-WhatsApp y se
 *    le responde dentro de 24 h, esa respuesta es gratis y se abre una ventana de 72 h en la que
 *    cualquier mensaje es gratis;
 *  - desde el 1/oct/2026 se cobran los mensajes de servicio (a la tarifa de utilidad del país) y
 *    la utilidad dentro de la ventana.
 * NO verificado en la página de Meta: el cupo de 1,000 mensajes de servicio gratis por número al
 * mes (lo publican 360dialog, techweez, SendPulse y otros proveedores el 28-29/09/2026), el
 * `type` con el que llegan esos mensajes del cupo, y desde cuándo corren las 72 h (se toma desde
 * la respuesta que abre la ventana). Van marcados en la tarjeta.
 */
import { DIA, HORA } from '../comun/base.js';
import type { CategoriaPlantilla } from './mensajes.js';

export type CategoriaPrecio = 'service' | CategoriaPlantilla;
export type TipoPrecio = 'regular' | 'free_customer_service' | 'free_entry_point';

export interface TarifasPais {
  /** Micro-dólares (millonésimas de USD) por mensaje entregado. */
  marketing: number;
  utility: number;
  authentication: number;
}

export interface TarjetaDeTarifas {
  id: string;
  /** Tarifas por código de país ISO (`MX`); `OTRO` es el respaldo. */
  paises: Record<string, TarifasPais>;
  verificada: boolean;
  fuentes: string[];
  nota: string;
  /** Desde cuándo se cobra el servicio y la utilidad en ventana (ISO, UTC). */
  cobroServicioDesde: string;
  cupoServicioMensual: { cantidad: number; verificado: boolean; fuente: string };
  /** Desfase del mes de facturación de la WABA respecto de UTC (México centro: −6 h). */
  desfaseMesHoras: number;
}

/**
 * La tarjeta del laboratorio. Las cifras de México NO se bajaron de la tarjeta oficial (CSV de
 * Meta): salen de publicaciones de terceros y difieren entre sí. Por eso `verificada: false`, y
 * el tablero dice «estimado». Bajar la tarjeta oficial en MXN es una decisión abierta del piloto.
 */
export const TARJETA_LABORATORIO: TarjetaDeTarifas = {
  id: 'mx-2026-10-laboratorio',
  paises: {
    MX: { marketing: 39_700, utility: 8_500, authentication: 8_500 },
    OTRO: { marketing: 62_500, utility: 11_300, authentication: 11_300 },
  },
  verificada: false,
  fuentes: [
    'https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ (reglas, 2026-09-30)',
    'https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages (1/oct/2026)',
    'https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/ (cupo 1,000; secundaria)',
    'https://setsmart.io/blog/whatsapp-business-api-pricing (tarifas MX; secundaria)',
  ],
  nota: 'Tarifas MX de fuentes secundarias (marketing 0.0305→0.0397 USD al 1/oct/2026; utilidad 0.0080–0.0085). OTRO = respaldo sin verificar.',
  cobroServicioDesde: '2026-10-01T00:00:00Z',
  cupoServicioMensual: { cantidad: 1000, verificado: false, fuente: 'proveedores (360dialog, techweez 28/09/2026); no aparece en la página de Meta consultada' },
  desfaseMesHoras: -6,
};

export interface Ventanas {
  /** Último mensaje del CLIENTE (los ecos del dueño no cuentan). */
  ultimoDelCliente?: number;
  /** Mensaje de anuncio CTWA aún sin respuesta: si se responde antes de 24 h abre la FEP. */
  anuncioSinResponder?: number;
  fep?: { abiertaEn: number; venceEn: number };
}

export const VENTANA_ATENCION = 24 * HORA;
export const VENTANA_ENTRADA_GRATIS = 72 * HORA;

export const atencionAbierta = (v: Ventanas, ahora: number): boolean =>
  v.ultimoDelCliente !== undefined && ahora < v.ultimoDelCliente + VENTANA_ATENCION;

export const entradaGratisAbierta = (v: Ventanas, ahora: number): boolean =>
  v.fep !== undefined && ahora >= v.fep.abiertaEn && ahora < v.fep.venceEn;

/** Llegó un mensaje del cliente. `deAnuncio`: traía `referral` de un anuncio CTWA. */
export function registraEntrante(v: Ventanas, instante: number, deAnuncio: boolean): Ventanas {
  const siguiente: Ventanas = { ...v, ultimoDelCliente: Math.max(v.ultimoDelCliente ?? 0, instante) };
  if (deAnuncio && !entradaGratisAbierta(v, instante)) siguiente.anuncioSinResponder = instante;
  return siguiente;
}

/** Salió un mensaje nuestro: si responde a un anuncio dentro de 24 h, abre la FEP de 72 h. */
export function registraSaliente(v: Ventanas, instante: number): Ventanas {
  if (v.anuncioSinResponder !== undefined && instante < v.anuncioSinResponder + VENTANA_ATENCION && !entradaGratisAbierta(v, instante)) {
    const resto: Ventanas = { ...v };
    delete resto.anuncioSinResponder;
    return { ...resto, fep: { abiertaEn: instante, venceEn: instante + VENTANA_ENTRADA_GRATIS } };
  }
  return v;
}

/** «2026-10» en el mes de facturación de la WABA. */
export function mesDeFacturacion(instante: number, tarjeta: TarjetaDeTarifas): string {
  return new Date(instante + tarjeta.desfaseMesHoras * HORA).toISOString().slice(0, 7);
}

export interface DecisionDePrecio {
  permitido: boolean;
  /** Código de error de Meta si no se permite (131047: fuera de la ventana de 24 h). */
  errorMeta?: { codigo: number; titulo: string };
  billable: boolean;
  tipo: TipoPrecio;
  categoria: CategoriaPrecio;
  /** Micro-dólares; 0 si no se cobra. */
  costoMicros: number;
  /** Consumió uno del cupo mensual de servicio. */
  usaCupo: boolean;
}

export interface EntradaPrecio {
  categoria: CategoriaPrecio;
  ventanas: Ventanas;
  ahora: number;
  pais: string;
  /** Mensajes de servicio ya entregados este mes por este número. */
  servicioEnElMes: number;
  tarjeta: TarjetaDeTarifas;
}

/** Lo que Meta cobraría (o rechazaría) por UN mensaje saliente. */
export function decidePrecio(e: EntradaPrecio): DecisionDePrecio {
  const { categoria, ventanas, ahora, tarjeta } = e;
  const tarifas = tarjeta.paises[e.pais] ?? tarjeta.paises.OTRO ?? { marketing: 0, utility: 0, authentication: 0 };
  const csw = atencionAbierta(ventanas, ahora);
  // La respuesta a un anuncio dentro de 24 h abre la FEP: esa misma respuesta ya es gratis.
  const fep = entradaGratisAbierta(ventanas, ahora)
    || (ventanas.anuncioSinResponder !== undefined && ahora < ventanas.anuncioSinResponder + VENTANA_ATENCION);
  const gratis = (tipo: TipoPrecio, usaCupo = false): DecisionDePrecio => ({ permitido: true, billable: false, tipo, categoria, costoMicros: 0, usaCupo });
  const cobra = (micros: number): DecisionDePrecio => ({ permitido: true, billable: true, tipo: 'regular', categoria, costoMicros: micros, usaCupo: false });

  if (categoria === 'service' && !csw && !fep) {
    return {
      permitido: false, errorMeta: { codigo: 131047, titulo: 'Re-engagement message: más de 24 h desde la última respuesta del cliente' },
      billable: false, tipo: 'regular', categoria, costoMicros: 0, usaCupo: false,
    };
  }
  if (fep) return gratis('free_entry_point');
  const cobraServicio = ahora >= Date.parse(tarjeta.cobroServicioDesde);
  if (categoria === 'service') {
    if (!cobraServicio) return gratis('free_customer_service');
    if (e.servicioEnElMes < tarjeta.cupoServicioMensual.cantidad) return gratis('free_customer_service', true);
    return cobra(tarifas.utility);
  }
  if (categoria === 'utility') {
    if (csw && !cobraServicio) return gratis('free_customer_service');
    return cobra(tarifas.utility);
  }
  return cobra(tarifas[categoria]);
}

export const DIAS_CAPI_MAXIMO = 7 * DIA;
