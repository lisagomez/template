/**
 * Lo que devuelve el servidor para las pantallas del expediente, el agente y la integridad.
 */
import type {
  ClaveLote, Devolucion, EstadoConteo, EstadoRecomendacion, EstadoSemaforo, Evento, Existencia, Incidente, InformeIntegridad, LecturaConteo, RenglonConteo, Riesgo,
  VerificacionCadena, Zona,
} from './nucleo.ts';

export interface LoteConExpediente {
  readonly lote: ClaveLote;
  readonly sku: string;
  readonly descripcion: string;
  readonly sitios: string[];
  readonly eventos: number;
  readonly ultimo: { sitio: string; seq: number; tipo: Evento['tipo']; hash: string };
  readonly ultimaFecha: string;
}

export interface EventoConPrueba {
  readonly evento: Evento;
  readonly anclado: { periodo: string; verificado: boolean; indice: number; tamano: number; ruta: string[]; raiz: string } | null;
}

export interface Expediente {
  readonly lote: ClaveLote;
  readonly sku: string;
  readonly descripcion: string;
  readonly semaforo: { dias: number; estado: EstadoSemaforo } | null;
  readonly eventos: EventoConPrueba[];
  readonly cadenas: Record<string, VerificacionCadena>;
  readonly enlaces: { sitio: string; seq: number; detalle: string }[];
  readonly existencias: Existencia[];
  readonly devoluciones: Devolucion[];
  readonly ok: boolean;
}

export interface Riesgos {
  readonly fuente: string;
  readonly hoy: string;
  readonly riesgos: Riesgo[];
  readonly recomendaciones: { evento: Evento; estado: EstadoRecomendacion; decision?: Evento }[];
}

export interface IntegridadSitio extends InformeIntegridad {
  readonly nombre: string;
  readonly proyeccion: { ok: boolean; motivo?: string };
  readonly llave: { variable: string; presente: boolean; largo: number; valida: boolean; huella?: string };
  readonly ultimaAncla?: { periodo: string; hastaSeq: number; raiz: string; creada: string };
  readonly anclasTotales: number;
}

export interface Integridad {
  readonly sitios: IntegridadSitio[];
  readonly transferencias: { sitio: string; seq: number; detalle: string }[];
  readonly incidentes: Incidente[];
  readonly ok: boolean;
}

/** Enlace a la pantalla del expediente de un lote. */
export function enlaceExpediente(l: ClaveLote): string {
  return `/etiquetas/expediente?gtin=${l.gtin}&lote=${encodeURIComponent(l.lote)}&cad=${l.caducidad}`;
}

/** Un conteo como lo manda el servidor: ciego mientras se cuenta, con conciliacion al cerrar. */
export interface VistaConteo {
  readonly folio: string;
  readonly sitio: string;
  readonly zonas: Zona[];
  readonly tolerancia: number;
  readonly abierto: string;
  readonly abre: string;
  readonly corte: { seq: number; cabeza: string };
  readonly ronda: 1 | 2;
  readonly estado: EstadoConteo;
  readonly lecturas: LecturaConteo[];
  readonly recontar: { gtin: string; lote: string; caducidad: string; zona: string; sscc?: string }[];
  readonly conciliacion?: RenglonConteo[];
  /** Al rol de conteo solo le llega la fecha. */
  readonly aplicado?: { fecha: string; autoriza?: string; acta?: string; eventos?: number; renglones?: RenglonConteo[] };
  readonly cancelado?: { fecha: string; motivo: string; operador: string };
}

export interface Conteos {
  readonly conteos: VistaConteo[];
  readonly patrones: { sitio: string; faltantes: { ubicacion: string; folios: string[]; cajas: number }[] }[];
}
