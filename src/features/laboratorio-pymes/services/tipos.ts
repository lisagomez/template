/**
 * Contrato del laboratorio de las herramientas pymes. Un caso declara su entrada (sintética y
 * dicha), si es trampa, y el estado que DEBE dar. Corre de verdad: el estado se calcula, no se
 * escribe a mano. La suite (`npm run prueba:laboratorio-pymes`) exige que cada caso dé lo que
 * declara; la página lo enseña; la app habilita solo las herramientas con todo en «pasa».
 */
export type EstadoDeCaso = 'pasa' | 'falla' | 'no-medido';

export type IdHerramienta = 'marca' | 'ventas' | 'contenido' | 'resenas' | 'visibilidad' | 'pulso' | 'piezas' | 'video' | 'aprobacion' | 'reel' | 'privacidad' | 'tarjetas' | 'sala' | 'redactor-llm';

export interface ResultadoDeCaso {
  readonly estado: EstadoDeCaso;
  /** Lo que salió de verdad (cifras, textos, conteos) para que cualquiera lo vea. */
  readonly evidencia: readonly string[];
  readonly veredicto: string;
  /** Pieza visual para enseñar (SVG), cuando el caso la produce. */
  readonly pieza?: string;
  /** Imagen de REFERENCIA (ruta pública) contra la que se compara la pieza, a la vista. */
  readonly referencia?: string;
  /** Video renderizado y su hoja de cuadros (rutas públicas). */
  readonly video?: { readonly mp4: string; readonly hoja: string };
}

export interface ContextoDeLaboratorio {
  /** Presencia de la llave del LLM en esta máquina (nunca su valor). `null` si no se sabe. */
  readonly llaveLlm: boolean | null;
}

export interface Caso {
  readonly id: string;
  readonly herramienta: IdHerramienta;
  readonly titulo: string;
  /** Qué entra, dicho: siempre sintético o declarado. */
  readonly entrada: string;
  /** Qué trampa pone a prueba, o `null` si es el camino feliz. */
  readonly trampa: string | null;
  readonly esperado: EstadoDeCaso;
  corre(ctx: ContextoDeLaboratorio): Promise<ResultadoDeCaso>;
}

export interface Herramienta {
  readonly id: IdHerramienta;
  readonly nombre: string;
  readonly subpath: string;
  readonly fuente: string;
  readonly queHace: string;
}

export interface CasoCorrido {
  readonly caso: Omit<Caso, 'corre'>;
  readonly resultado: ResultadoDeCaso;
  readonly coincide: boolean;
  readonly ms: number;
}
