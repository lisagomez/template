/**
 * De un esquema Zod a la lista de bloques que pinta la pantalla. Pasa por `z.toJSONSchema` (Zod 4): el
 * JSON Schema es estándar, lo entiende cualquier cliente y es lo mismo que publica la doc de la API.
 *
 * El tipo de bloque sale del esquema; cuando el esquema no basta (una imagen es un `string`), lo dice la
 * metadata del campo: `.meta({ bloque: 'imagen' })`. La etiqueta sale de `title`; la ayuda, de
 * `description`; la unidad, de `.meta({ unidad: 'ms' })`.
 */
import { z } from 'zod';
import type { Bloque, TipoBloque } from './tipos.js';

interface EsquemaJson {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, EsquemaJson>>;
  readonly required?: readonly string[];
  readonly items?: EsquemaJson;
  readonly enum?: readonly unknown[];
  readonly anyOf?: readonly EsquemaJson[];
  readonly title?: string;
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly default?: unknown;
  readonly bloque?: TipoBloque;
  readonly unidad?: string;
}

const TIPOS_DECLARABLES: readonly TipoBloque[] = ['texto', 'texto-largo', 'imagen', 'audio', 'archivo', 'json'];

/** El JSON Schema de entrada (lo que el cliente manda) o de salida (lo que el motor devuelve). */
export function esquemaJson(esquema: z.ZodType, io: 'input' | 'output' = 'input'): unknown {
  // Ida y vuelta por JSON: lo que sale es datos planos (lo que viaja por la API y lo que React Server
  // Components acepta pasar a un componente de cliente), no los objetos internos de Zod.
  return JSON.parse(JSON.stringify(z.toJSONSchema(esquema, { io, unrepresentable: 'any' })));
}

/** «nombre_del_campo» o «nombreDelCampo» → «Nombre del campo», si el esquema no trae `title`. */
export function humaniza(campo: string): string {
  const s = campo.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const sinNulo = (s: EsquemaJson): EsquemaJson => (s.anyOf ? (s.anyOf.find((x) => x.type !== 'null') ?? s) : s);
const tipoBase = (s: EsquemaJson): string | undefined => (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : (s.type as string | undefined));

function tipoDe(s: EsquemaJson): TipoBloque {
  if (s.bloque && TIPOS_DECLARABLES.includes(s.bloque)) return s.bloque;
  if (s.enum) return 'opcion';
  const t = tipoBase(s);
  if (t === 'string') return (s.maxLength ?? 0) > 280 ? 'texto-largo' : 'texto';
  if (t === 'number' || t === 'integer') return 'numero';
  if (t === 'boolean') return 'booleano';
  if (t === 'array') return tipoBase(sinNulo(s.items ?? {})) === 'object' ? 'tabla' : 'lista';
  if (t === 'object') return 'objeto';
  return 'json';
}

function bloqueDe(campo: string, crudo: EsquemaJson, requerido: boolean): Bloque {
  const s = sinNulo(crudo);
  const tipo = tipoDe(s);
  const items = s.items ? sinNulo(s.items) : undefined;
  return {
    campo,
    etiqueta: s.title ?? crudo.title ?? humaniza(campo),
    tipo,
    requerido,
    ...(s.description ?? crudo.description ? { descripcion: s.description ?? crudo.description } : {}),
    ...(s.enum ? { opciones: s.enum.map(String) } : {}),
    ...(s.minimum !== undefined ? { minimo: s.minimum } : {}),
    ...(s.maximum !== undefined ? { maximo: s.maximum } : {}),
    ...(s.unidad ?? crudo.unidad ? { unidad: s.unidad ?? crudo.unidad } : {}),
    ...(crudo.default !== undefined ? { porDefecto: crudo.default } : {}),
    ...(tipo === 'tabla' && items?.properties ? { columnas: Object.keys(items.properties) } : {}),
    ...(tipo === 'objeto' && s.properties ? { hijos: bloquesDe(s) } : {}),
  };
}

function bloquesDe(s: EsquemaJson): readonly Bloque[] {
  const requeridos = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([campo, sub]) => bloqueDe(campo, sub, requeridos.has(campo)));
}

/** Los bloques de un esquema de objeto (la entrada o la salida de una función). */
export function describeEsquema(esquema: z.ZodType, io: 'input' | 'output' = 'input'): readonly Bloque[] {
  const json = esquemaJson(esquema, io) as EsquemaJson;
  if (tipoBase(json) !== 'object') throw new Error('el esquema de una función del banco es un objeto: cada propiedad es un bloque');
  return bloquesDe(json);
}
