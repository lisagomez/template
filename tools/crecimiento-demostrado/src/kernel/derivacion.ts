/**
 * La DERIVACIÓN: lo único que un agente entrega en vez de texto libre. Es una lista de pasos, cada
 * uno una regla de un conjunto CERRADO de 11, y una afirmación que señala el paso que la establece.
 * Γ ⊢ φ: Γ es el snapshot (por hash) + la spec (por hash) + los supuestos declarados; φ es lo que
 * establece el paso señalado.
 */
import { z } from 'zod';
import { esPeriodo } from '../comun/periodos.js';
import { METRICAS } from '../ontologia/especificacion.js';
import { CLASES, esquemaTermino } from '../motor/terminos.js';

export const REGLAS = ['cita', 'particion', 'suma_particion', 'teorema', 'aritmetica', 'compara', 'razon', 'cambio_relativo', 'prueba', 'supuesto', 'hipotesis'] as const;
export type Regla = (typeof REGLAS)[number];

export const TEOREMAS = ['puente_clasico', 'nft_lmdi'] as const;

const id = z.string().regex(/^[a-z0-9_-]{1,24}$/);
const periodo = z.string().refine(esPeriodo, 'periodo inválido');
const entero = z.number().int();
const op = z.enum(['=', '>', '>=', '<', '<=']);

const valor = z.union([
  z.object({ tipo: z.literal('centavos'), v: entero }).strict(),
  z.object({ tipo: z.literal('conteo'), v: entero }).strict(),
  z.object({ tipo: z.literal('fraccion'), num: entero, den: entero }).strict(),
  z.object({ tipo: z.literal('prueba'), r: z.object({ n: entero, exitos: entero, iteraciones: entero, efecto: z.object({ num: entero, den: entero }).strict() }).strict() }).strict(),
  z.object({ tipo: z.literal('lista'), items: z.array(z.object({ cliente: z.string(), centavos: entero }).strict()) }).strict(),
  z.object({ tipo: z.literal('no_aplica'), motivo: z.string() }).strict(),
]);

const experimento = z.object({
  diseno: z.enum(['ab', 'escalonado', 'antes_despues_con_control']),
  grupoControl: z.string().min(3),
  duracionSemanas: z.number().int().min(1).max(52),
  criterio: z.string().min(5),
}).strict();

export const esquemaPaso = z.discriminatedUnion('regla', [
  z.object({ regla: z.literal('cita'), id, termino: esquemaTermino, valor }).strict(),
  z.object({ regla: z.literal('particion'), id, metrica: z.enum(METRICAS), desde: periodo, hasta: periodo, segmento: z.string().optional(), universo: z.enum(['T', 'U']), clases: z.array(z.enum(CLASES)).min(1).max(10) }).strict(),
  z.object({ regla: z.literal('suma_particion'), id, particion: id }).strict(),
  z.object({ regla: z.literal('teorema'), id, nombre: z.enum(TEOREMAS), usa: z.array(id).min(1).max(12) }).strict(),
  z.object({ regla: z.literal('aritmetica'), id, op: z.enum(['suma', 'resta']), de: z.array(id).min(2).max(12) }).strict(),
  z.object({ regla: z.literal('compara'), id, a: id, op, b: z.union([id, z.object({ constante: entero }).strict()]) }).strict(),
  z.object({ regla: z.literal('razon'), id, num: id, den: id, op: z.enum(['>=', '<=']), umbralPorMil: entero }).strict(),
  z.object({ regla: z.literal('cambio_relativo'), id, antes: id, despues: id, op: z.enum(['>=', '<=']), umbralPorMil: entero }).strict(),
  z.object({ regla: z.literal('prueba'), id, cita: id }).strict(),
  z.object({ regla: z.literal('supuesto'), id, sa: z.string() }).strict(),
  z.object({ regla: z.literal('hipotesis'), id, intervencion: z.string().min(5), metrica: z.enum(METRICAS), sentido: z.enum(['sube', 'baja']), experimento: experimento.optional() }).strict(),
]);

export const esquemaDerivacion = z.object({
  afirmacion: z.object({ paso: id }).strict(),
  nivel: z.enum(['descriptivo', 'inferencial', 'causal']),
  gamma: z.string(),
  especificacion: z.string(),
  supuestos: z.array(z.string()).max(20),
  pasos: z.array(esquemaPaso).min(1).max(80),
}).strict();

export type Paso = z.infer<typeof esquemaPaso>;
export type Derivacion = z.infer<typeof esquemaDerivacion>;
export type Nivel = Derivacion['nivel'];
