/**
 * Los esquemas del contrato pineado de OpenWA 0.25.0 como validadores de ajv: OpenAPI 3.0 → JSON Schema
 * (`nullable` → unión con null; las referencias apuntan al documento registrado). `date-time` se comprueba con un
 * formato propio para no sumar dependencias.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
type Nodo = Record<string, unknown>;
interface Operacion { operationId: string; requestBody?: { content?: Record<string, { schema?: Nodo }> }; responses: Record<string, { content?: Record<string, { schema?: Nodo }> }> }

export const CONTRATO = JSON.parse(readFileSync(join(raiz, 'openwa', 'openapi-0.25.0.json'), 'utf8')) as { paths: Record<string, Record<string, Operacion>>; components: { schemas: Record<string, Nodo> } };

function convierte(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(convierte);
  if (!x || typeof x !== 'object') return x;
  const o = Object.fromEntries(Object.entries(x as Nodo).filter(([k]) => k !== 'nullable' && k !== 'example').map(([k, v]) => [k, k === '$ref' ? String(v).replace('#/', 'openwa#/') : convierte(v)]));
  return (x as Nodo).nullable === true ? { anyOf: [o, { type: 'null' }] } : o;
}

const ajv = new Ajv({ strict: false, allErrors: true });
ajv.addFormat('date-time', (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && Number.isFinite(Date.parse(s)));
ajv.addSchema({ $id: 'openwa', components: { schemas: convierte(CONTRATO.components.schemas) } });

export const operaciones = new Map<string, Operacion & { metodo: string; ruta: string }>();
for (const [ruta, ops] of Object.entries(CONTRATO.paths)) for (const [metodo, op] of Object.entries(ops)) operaciones.set(op.operationId, { ...op, metodo: metodo.toUpperCase(), ruta });

const cache = new Map<string, ValidateFunction>();
function validador(clave: string, schema: Nodo): ValidateFunction {
  const previo = cache.get(clave);
  if (previo) return previo;
  const v = ajv.compile(convierte(schema) as Nodo);
  cache.set(clave, v);
  return v;
}
const errores = (v: ValidateFunction) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');

/** `null` si la respuesta cumple el esquema de ese status; si no, la razón. */
export function revisaRespuesta(operacion: string, status: number, cuerpo: unknown): string | null {
  const op = operaciones.get(operacion);
  if (!op) return `${operacion} no está en el contrato`;
  const r = op.responses[String(status)];
  if (!r) return `${operacion}: el status ${status} no está declarado (${Object.keys(op.responses).join(', ')})`;
  const schema = r.content?.['application/json']?.schema;
  if (!schema) return cuerpo === undefined ? null : `${operacion} ${status}: el contrato no declara cuerpo`;
  const v = validador(`${operacion}|${status}`, schema);
  return v(cuerpo) ? null : `${operacion} ${status}: ${errores(v)}`;
}

/** `null` si la petición cumple el esquema del cuerpo declarado (o la operación no lleva cuerpo). */
export function revisaPeticion(operacion: string, cuerpo: unknown): string | null {
  const schema = operaciones.get(operacion)?.requestBody?.content?.['application/json']?.schema;
  if (!schema) return cuerpo === undefined ? null : `${operacion}: el contrato no declara cuerpo de petición`;
  const v = validador(`${operacion}|peticion`, schema);
  return v(cuerpo) ? null : `${operacion} petición: ${errores(v)}`;
}

export const revisaError = (cuerpo: unknown): string | null => {
  const v = validador('ErrorResponse', { $ref: '#/components/schemas/ErrorResponse' });
  return v(cuerpo) ? null : errores(v);
};
