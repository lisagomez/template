/**
 * Lo que devuelve el kernel. Cinco estados que NO se confunden entre sí: solo `aceptada` trae
 * certificado, y un «no» tipado (rechazada, requiere_entrada, evidencia_insuficiente, hipótesis)
 * nunca tiene la forma de una respuesta.
 */
import type { Termino } from '../motor/terminos.js';
import type { Valor } from '../motor/evalua.js';

export const MOTIVOS_DE_RECHAZO = [
  'derivacion_mal_formada', 'sql_libre', 'regla_inexistente', 'teorema_inexistente', 'gamma_ajeno', 'especificacion_ajena',
  'valor_alterado', 'paso_desconocido', 'id_repetido', 'particion_no_disjunta', 'particion_no_exhaustiva',
  'hipotesis_del_teorema', 'proporcion_indeterminada', 'afirmacion_falsa', 'nivel_mal_etiquetado',
  'supuesto_inexistente', 'tipo_incompatible', 'falla_del_motor',
] as const;
export type MotivoDeRechazo = (typeof MOTIVOS_DE_RECHAZO)[number];

export interface HechoCertificado { readonly nombre: string; readonly termino: Termino; readonly valor: Valor }

export interface Certificado {
  readonly kernel: string;
  readonly gamma: string;
  readonly especificacion: string;
  readonly derivacion: string;
  readonly nivel: 'descriptivo' | 'inferencial';
  /** Qué quedó establecido: la regla del paso afirmado y su enunciado legible. */
  readonly afirmacion: { readonly regla: string; readonly enunciado: string };
  readonly hechos: readonly HechoCertificado[];
  /** Números derivados (no citados) que el paso afirmado y los intermedios establecieron, en enteros o fracción. */
  readonly derivados: readonly { readonly paso: string; readonly enunciado: string; readonly unidad: 'centavos' | 'conteo' | 'fraccion'; readonly num: string; readonly den: string }[];
  readonly supuestos: readonly string[];
  readonly hash: string;
}

export type Veredicto =
  | { readonly estado: 'aceptada'; readonly certificado: Certificado }
  | { readonly estado: 'rechazada'; readonly motivo: MotivoDeRechazo; readonly paso: string | null; readonly detalle: string }
  | { readonly estado: 'requiere_entrada'; readonly faltan: readonly string[]; readonly paso: string | null; readonly detalle: string }
  | { readonly estado: 'evidencia_insuficiente'; readonly paso: string; readonly detalle: string; readonly n: number; readonly p: { readonly num: number; readonly den: number } | null }
  | { readonly estado: 'hipotesis'; readonly paso: string; readonly detalle: string; readonly reetiquetada: boolean; readonly experimento: unknown };

/** El veredicto que no es una aceptación, como excepción interna del kernel. */
export class Corte extends Error {
  readonly veredicto: Exclude<Veredicto, { estado: 'aceptada' }>;
  constructor(v: Exclude<Veredicto, { estado: 'aceptada' }>) {
    super(v.detalle);
    this.veredicto = v;
  }
}

export const rechaza = (motivo: MotivoDeRechazo, paso: string | null, detalle: string): never => {
  throw new Corte({ estado: 'rechazada', motivo, paso, detalle });
};
