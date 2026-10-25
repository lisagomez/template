/** Tipos del lienzo: los del núcleo del Estudio (solo tipos: el cliente no importa su código) y las respuestas de la ruta. */
export type {
  Componente, Dashboard, DatosComponente, DatosTablero, DiferenciaDashboard, CambioCifra, FiltroDashboard, Fila, Serie, Senal, Alerta, Definicion, Plan,
} from '../../../../tools/estudio-dashboards/dist/index.js';
import type { Alerta, CambioCifra, DatosTablero, Dashboard, Definicion, DiferenciaDashboard, Plan, Propuesta } from '../../../../tools/estudio-dashboards/dist/index.js';

export interface MetricaListada { readonly nombre: string; readonly etiqueta: string; readonly tipo: string; readonly unidad: string; readonly dueno: string | null; readonly descripcion: string }
export interface VersionListada { readonly n: number; readonly padre: number | null; readonly autor: string; readonly resumen: string; readonly instruccion: string | null; readonly cuando: string }
export interface Geografia {
  readonly dimension: string;
  readonly puntos: readonly { readonly valor: string; readonly lat: number; readonly lon: number; readonly region: string }[];
  readonly rejilla: { readonly lon0: number; readonly lat1: number; readonly paso: number; readonly nx: number; readonly ny: number; readonly celdas: readonly (readonly [number, number])[] };
}
export interface Estado {
  readonly tablero: { readonly tablero: string; readonly version: number; readonly oficial: number | null; readonly dashboard: Dashboard; readonly versiones: readonly VersionListada[] };
  readonly datos: DatosTablero;
  readonly catalogo: readonly MetricaListada[];
  readonly geografia: Geografia;
  readonly gasto: { readonly gastadoUsd: number; readonly presupuestoUsd: number; readonly nivel: string };
  readonly agente: string | null;
}
export interface Vuelta { readonly entendi: string; readonly texto: string; readonly plan: Plan | null; readonly error: string | null; readonly costoUsd: number | null; readonly ms: { readonly modelo: number; readonly total: number }; readonly intentos: number; readonly modelo: string; readonly versionPrompt: string }
export interface RespuestaInstruccion {
  readonly version: number;
  readonly vuelta: Vuelta;
  readonly propuesta: { readonly dashboard: Dashboard; readonly parche: unknown; readonly tocados: readonly string[]; readonly globales: readonly string[] } | null;
  readonly datos: DatosTablero | null;
  readonly explicacion: Definicion | null;
  readonly alerta: Alerta | null;
  readonly propuestaMetrica: Propuesta | null;
}
export interface Comparacion { readonly diferencia: DiferenciaDashboard; readonly cifras: readonly CambioCifra[] | null }
