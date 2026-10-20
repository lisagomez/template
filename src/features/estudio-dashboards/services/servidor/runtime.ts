/**
 * El runtime del lienzo del Estudio (laboratorio Golfo Norte, datos ficticios): un proceso de MetricFlow caliente,
 * el catálogo, el consultor con caché, los almacenes de versiones y alertas FUERA del repo, el perfil de señales y la
 * geografía del mapa. Se arma una vez por proceso, la primera vez que alguien lo pide.
 *
 * Las rutas del disco se resuelven al ejecutar, con `turbopackIgnore` (aprendizaje del 2026-09-20: si no, el build
 * rastrea el venv). El modelo sale del routing (`agente-estudio-dashboards`, pineado) y la llave, del entorno del
 * servidor: nunca `NEXT_PUBLIC_`, nunca impresa.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  cargaCatalogo, consultor, detectaSenales, type ContextoEstudio, type Dashboard, type PerfilSenales, type Senal,
} from '../../../../../tools/estudio-dashboards/dist/index.js';
import { archivoAlertas, archivoVersiones } from '../../../../../tools/estudio-dashboards/dist/almacenes/archivo.js';
import { dirEntorno, puertoMetricFlow } from '../../../../../tools/estudio-dashboards/dist/metricflow/index.js';
import { modeloOpenRouter } from '../../../../../tools/estudio-dashboards/dist/openrouter.js';
import { conReserva, type ModeloEstudio } from '../../../../../tools/estudio-dashboards/dist/agente/tipos.js';
import { modeloPara } from '../../../../lib/ai/routing';

const RAIZ = resolve(/*turbopackIgnore: true*/ process.cwd());
const HERRAMIENTA = resolve(/*turbopackIgnore: true*/ RAIZ, 'tools', 'estudio-dashboards');
const LAB = resolve(/*turbopackIgnore: true*/ HERRAMIENTA, 'laboratorio');
export const ALMACEN = resolve(/*turbopackIgnore: true*/ process.env['ESTUDIO_DATOS'] ?? join(homedir(), '.estudio-dashboards', 'golfo-norte'));
export const TABLEROS = ['growth', 'ejecutivo', 'vacio'] as const;
export type NombreTablero = (typeof TABLEROS)[number];
/** Tope del lienzo en US$: el presupuesto del laboratorio, aparte de la medición (que tuvo su tope de 2). */
export const TOPE_LIENZO_USD = 0.25;
export const CORTE = '2026-09';
export const CONTEXTO = 'Distribuidora Golfo Norte, empresa ficticia';
export const MAPA = { dimensionMapa: 'tienda__tienda_nombre', capasMapa: { reorden: 'combinaciones_bajo_reorden' } } as const;

export const esLaboratorio = (): boolean => process.env['ESTUDIO_LABORATORIO'] === '1';

export interface Geografia {
  readonly dimension: string;
  readonly puntos: readonly { readonly valor: string; readonly lat: number; readonly lon: number; readonly region: string }[];
  readonly rejilla: { readonly lon0: number; readonly lat1: number; readonly paso: number; readonly nx: number; readonly ny: number; readonly celdas: readonly (readonly [number, number])[] };
}

export interface Runtime {
  readonly ctx: ContextoEstudio & { readonly perfil: PerfilSenales };
  readonly geografia: Geografia;
  readonly modelo: ModeloEstudio | null;
  senales(): Promise<readonly Senal[]>;
}

const json = <T,>(r: string): T => JSON.parse(readFileSync(/*turbopackIgnore: true*/ resolve(/*turbopackIgnore: true*/ LAB, r), 'utf8')) as T;

function modelo(): ModeloEstudio | null {
  const llave = process.env['OPENROUTER_API_KEY'] ?? '';
  if (!llave) return null;
  // La configuración MEDIDA que se propone en el CDC: el razonamiento del proveedor, con una reserva de 512 tokens de
  // razonamiento propio solo si la respuesta sale truncada, y preferencia de proveedor por latencia (95/100 en el set
  // v1 y 98/100 en el v2 adjudicado; regeneración p95 ≈ 5.0 s: medicion-voz-reserva-latencia*.json, 2026-10-20).
  const base = { llave, modelo: modeloPara('agente-estudio-dashboards').modelo, fetch, proveedor: 'latencia' as const, cabeceras: { 'X-Title': 'estudio-dashboards (laboratorio)' } };
  return conReserva(modeloOpenRouter(base), modeloOpenRouter({ ...base, razonamiento: { maxTokens: 512 } }));
}

async function arma(): Promise<Runtime> {
  const lock = resolve(/*turbopackIgnore: true*/ HERRAMIENTA, 'semantica', 'requirements.lock');
  const proyecto = resolve(/*turbopackIgnore: true*/ LAB, 'golfo_norte');
  const puerto = puertoMetricFlow({
    proyecto, perfiles: proyecto, python: join(dirEntorno(lock), 'bin', 'python'),
    servidor: resolve(/*turbopackIgnore: true*/ HERRAMIENTA, 'semantica', 'servidor_mf.py'),
    entorno: {
      GN_DATOS: resolve(/*turbopackIgnore: true*/ process.env['ESTUDIO_GN_DATOS'] ?? join(RAIZ, '.datos', 'estudio-dashboards', 'golfo_norte', 'data', 'raw')),
      GN_DUCKDB: join(homedir(), '.cache', 'estudio-dashboards-semantica', 'golfo_norte', 'golfo_norte.duckdb'),
      GN_DBT_TARGET: 'lectura',
    },
    // Tres lectores de solo lectura: regenerar con un filtro nuevo baja de ~354 a ~141 ms p50 (medido el 2026-10-20).
    procesos: 3,
  });
  const cat = await cargaCatalogo(puerto);
  const perfil = json<PerfilSenales>('perfil.json');
  const ctx = {
    consultor: consultor(puerto, cat), versiones: archivoVersiones(ALMACEN), alertas: archivoAlertas(ALMACEN), fechaCorte: CORTE, perfil, resolver: MAPA,
    tablerosBase: Object.fromEntries(TABLEROS.map((t) => [t, json<Dashboard>(`tableros/${t}.json`)])),
  };
  let senales: Promise<readonly Senal[]> | null = null;
  return {
    ctx, geografia: json<Geografia>('geografia.json'), modelo: modelo(),
    senales: () => (senales ??= detectaSenales(ctx.consultor, perfil).catch((e) => { senales = null; throw e; })),
  };
}

let instancia: Promise<Runtime> | null = null;
export function runtime(): Promise<Runtime> {
  instancia ??= arma().catch((e) => { instancia = null; throw e; });
  return instancia;
}
