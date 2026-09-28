/**
 * Contrato del laboratorio de etiquetas GS1 (mismo molde que `/laboratorio-pymes`). Un caso declara su
 * entrada (sintética y dicha, o el corpus real del laboratorio), si es trampa, y el estado que DEBE dar.
 * Corre de verdad: el estado se calcula, no se escribe a mano. Un caso que necesita algo que esta
 * máquina no tiene (el motor local de fechas, el corpus de fotos reales) queda «no medido» y lo dice.
 */
import type { MotorFechas } from '../../../../tools/etiquetas-gs1/dist/index.js';

export type EstadoDeCaso = 'pasa' | 'falla' | 'no-medido';

export type IdHerramienta = 'etiqueta' | 'impresion' | 'lectura' | 'catalogo' | 'recepcion' | 'fecha-foto' | 'zonas' | 'ronda' | 'conteo' | 'expediente' | 'agente';

/** Lo que un caso puede necesitar y no siempre hay: sin eso queda «no medido», nunca «pasa». */
export type Requisito = 'motor' | 'corpus-real';

export interface ResultadoDeCaso {
  readonly estado: EstadoDeCaso;
  /** Lo que salió de verdad (cifras, textos, conteos) para que cualquiera lo vea. */
  readonly evidencia: readonly string[];
  readonly veredicto: string;
  /** Pieza visual (SVG) cuando el caso la produce, y su referencia aprobada (ruta pública). */
  readonly pieza?: string;
  readonly referencia?: string;
}

export interface ContextoDeLaboratorio {
  /** El motor LOCAL de lectura de fechas, si esta máquina lo tiene. */
  readonly motor: MotorFechas | null;
  /** Carpeta del corpus de fotos REALES (fuera de git), si esta máquina lo tiene. */
  readonly corpusReal: string | null;
}

export interface Caso {
  readonly id: string;
  readonly herramienta: IdHerramienta;
  readonly titulo: string;
  /** Qué entra, dicho: sintético (prefijo 952 de demostración) o el corpus real del laboratorio. */
  readonly entrada: string;
  /** Qué trampa pone a prueba, o `null` si es el camino feliz. */
  readonly trampa: string | null;
  readonly esperado: EstadoDeCaso;
  readonly requiere?: Requisito;
  corre(ctx: ContextoDeLaboratorio): Promise<ResultadoDeCaso>;
}

export interface Herramienta {
  readonly id: IdHerramienta;
  readonly nombre: string;
  readonly subpath: string;
  /** Las pantallas de `/etiquetas` que la usan: se apagan si no pasa su laboratorio. */
  readonly pantallas: readonly string[];
  readonly queHace: string;
}

export interface CasoCorrido {
  readonly caso: Omit<Caso, 'corre'>;
  readonly resultado: ResultadoDeCaso;
  /** Dio lo que declara (o quedó «no medido» porque falta lo que requiere, y así lo dice). */
  readonly coincide: boolean;
  readonly ms: number;
}
