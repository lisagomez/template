/** Contratos del historial del dictado: la entrada tal como la guarda `tools/dictado` y lo que la pagina pide y recibe. */

export interface Dictado {
  id: string;
  /** ISO 8601. */
  fecha: string;
  texto: string;
  /** Lo que dijo el motor antes de la correccion, si la persona lo corrigio. */
  textoCrudo?: string;
  motor: string;
  duracionMs: number;
  /** Fin de habla → texto pegado; `null` si no se midio. */
  latenciaMs: number | null;
}

export interface Filtros {
  /** Texto a buscar, con o sin acentos. */
  consulta?: string;
  /** Dia local YYYY-MM-DD, inclusive. */
  desde?: string;
  hasta?: string;
  motor?: string;
  soloCorregidos?: boolean;
  /** Solo dictados con latencia igual o mayor (ms). */
  latenciaMinMs?: number;
}

export interface Pagina {
  entradas: Dictado[];
  /** Cuantas coinciden con los filtros (antes de paginar). */
  coinciden: number;
  /** Cuantas hay en total en el historial. */
  total: number;
  /** Cambia cuando cambia el archivo: la pagina lo usa para saber si hay dictados nuevos. */
  huella: string;
  motores: string[];
}

export interface TrayectoriaResumen {
  inicio: string;
  fin: string;
  turnos: number;
  sinVoz: number;
  respaldo: number;
  muertesCaptura: number;
  latenciaP50Ms: number | null;
  picoDbMax: number | null;
  picoDbMin: number | null;
}
