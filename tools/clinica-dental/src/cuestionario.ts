/**
 * El cuestionario de registro y sus consentimientos. El MISMO esquema valida en el navegador y en el servidor
 * (el servidor nunca confia en lo que valido el navegador). Mensajes en español de persona, no de maquina.
 *
 * Reglas (LFPDPPP; se citan en el aviso de privacidad borrador):
 *  - La descripcion del padecimiento es un DATO DE SALUD (dato personal sensible). Se pide con consentimiento
 *    EXPRESO, separado de los demas. Sin el, el texto se DESCARTA y el registro sigue: `preparaRegistro`
 *    devuelve el registro sin el campo y lo dice (`descartado.padecimiento`).
 *  - Los opt-ins (recordatorios, newsletter, Telegram) son independientes y ninguno viene marcado.
 *  - Menor de 18: los datos y el consentimiento de quien ejerce la patria potestad o la tutela son obligatorios.
 *  - Sin campos de mas (`.strict()`): lo que no se pide no se guarda.
 *  - La contraseña va en un esquema APARTE: el borrador que se guarda en el dispositivo nunca la lleva.
 */
import { z } from 'zod';
import { CATEGORIAS, type Categoria } from './clinicas.js';
import type { TipoConsentimiento } from './eventos.js';

/** Version del aviso de privacidad que se acepta. Es un BORRADOR: no vigente, lo revisa un abogado. */
export const VERSION_AVISO = 'aviso-borrador-2026-10-16';
export const MAYORIA_DE_EDAD = 18;
export const LARGO_PADECIMIENTO = 500;

const texto = (campo: string, max: number) =>
  z.string({ error: `Escribe tu ${campo}` }).trim().min(1, `Escribe tu ${campo}`).max(max, `Tu ${campo} es demasiado largo (máximo ${max} caracteres)`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `Tu ${campo} solo puede llevar letras, espacios, apóstrofo, punto o guion`);

/** Celular de México: +52 y 10 digitos. Acepta espacios, guiones y parentesis al escribirlo. */
export function normalizaCelular(entrada: string): string | null {
  const digitos = entrada.replace(/[\s().-]/g, '');
  const m = /^(?:\+?52)?(\d{10})$/.exec(digitos);
  return m ? `+52${m[1]}` : null;
}

const celular = z.string({ error: 'Escribe tu celular' }).trim().transform((v, ctx) => {
  const n = normalizaCelular(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'El celular lleva 10 dígitos (con o sin +52), por ejemplo 55 1234 5678' });
  return n ?? '';
});

const correo = z.string({ error: 'Escribe tu correo' }).trim().toLowerCase().max(254, 'Ese correo es demasiado largo')
  .email('Escribe un correo válido, por ejemplo nombre@dominio.com');

export const esquemaTutor = z.object({
  nombre: texto('nombre', 60),
  apellidoPaterno: texto('apellido paterno', 60),
  apellidoMaterno: texto('apellido materno', 60).optional().or(z.literal('').transform(() => undefined)),
  parentesco: z.enum(['madre', 'padre', 'tutor_legal'], { error: 'Elige si eres madre, padre o tutor legal' }),
  correo,
  celular,
  consiente: z.literal(true, { error: 'Quien ejerce la patria potestad o la tutela tiene que dar su consentimiento' }),
}).strict();

export const esquemaConsentimientos = z.object({
  aviso_privacidad: z.literal(true, { error: 'Para registrarte necesitas haber leído el aviso de privacidad' }),
  datos_salud: z.boolean(),
  recordatorios: z.boolean(),
  newsletter: z.boolean(),
  telegram: z.boolean(),
}).strict();

export const esquemaRegistro = z.object({
  empresa: z.string().trim().max(80, 'El nombre de la empresa es demasiado largo').optional().or(z.literal('').transform(() => undefined)),
  nombre: texto('nombre', 60),
  apellidoPaterno: texto('apellido paterno', 60),
  apellidoMaterno: texto('apellido materno', 60).optional().or(z.literal('').transform(() => undefined)),
  edad: z.coerce.number({ error: 'Escribe tu edad en años' }).int('Escribe tu edad en años, sin decimales').min(0, 'La edad no puede ser negativa').max(120, 'Revisa la edad: parece demasiado alta'),
  correo,
  celular,
  padecimiento: z.string().trim().max(LARGO_PADECIMIENTO, `Descríbelo en ${LARGO_PADECIMIENTO} caracteres o menos`).optional().or(z.literal('').transform(() => undefined)),
  categorias: z.array(z.enum(CATEGORIAS), { error: 'Elige al menos una categoría' }).min(1, 'Elige al menos una categoría').max(4),
  consentimientos: esquemaConsentimientos,
  tutor: esquemaTutor.optional(),
}).strict().superRefine((r, ctx) => {
  if (r.edad < MAYORIA_DE_EDAD && !r.tutor) {
    ctx.addIssue({ code: 'custom', path: ['tutor'], message: 'Como eres menor de 18 años, necesitamos los datos y el consentimiento de tu madre, padre o tutor' });
  }
  if (r.edad >= MAYORIA_DE_EDAD && r.tutor) ctx.addIssue({ code: 'custom', path: ['tutor'], message: 'Los datos del tutor solo se piden a menores de 18 años' });
  if (r.consentimientos.telegram && !r.consentimientos.recordatorios) {
    ctx.addIssue({ code: 'custom', path: ['consentimientos', 'telegram'], message: 'Telegram es un canal de recordatorios: activa también los recordatorios de cita' });
  }
});

export const esquemaCuenta = z.object({
  contrasena: z.string({ error: 'Escribe una contraseña' }).min(8, 'La contraseña lleva al menos 8 caracteres').max(72, 'La contraseña lleva máximo 72 caracteres'),
}).strict();

export type EntradaRegistro = z.input<typeof esquemaRegistro>;
export type Registro = z.output<typeof esquemaRegistro>;

export interface Consentimiento {
  tipo: TipoConsentimiento;
  otorgado: boolean;
  version: string;
}

export interface RegistroPreparado {
  datos: Omit<Registro, 'consentimientos'>;
  consentimientos: Consentimiento[];
  menor: boolean;
  convenio: boolean;
  categorias: Categoria[];
  /** Lo que llego y NO se guarda, con su motivo: se le dice a la persona. */
  descartado: { padecimiento: boolean };
}

export type ErroresCampo = Record<string, string>;

/** Los errores de Zod como `campo → mensaje humano` (el primero por campo). */
export function erroresPorCampo(error: z.ZodError): ErroresCampo {
  const salida: ErroresCampo = {};
  for (const i of error.issues) {
    const clave = i.path.join('.') || 'formulario';
    salida[clave] ??= i.message;
  }
  return salida;
}

export function validaRegistro(entrada: unknown): { ok: true; registro: Registro } | { ok: false; errores: ErroresCampo } {
  const r = esquemaRegistro.safeParse(entrada);
  return r.success ? { ok: true, registro: r.data } : { ok: false, errores: erroresPorCampo(r.error) };
}

/**
 * De lo validado a lo que se guarda: aplica el consentimiento expreso del dato de salud y arma la lista de
 * consentimientos con la version del aviso. El padecimiento sin consentimiento NO sale de esta funcion.
 */
export function preparaRegistro(entrada: unknown): { ok: true; preparado: RegistroPreparado } | { ok: false; errores: ErroresCampo } {
  const v = validaRegistro(entrada);
  if (!v.ok) return v;
  const { consentimientos: c, padecimiento, ...resto } = v.registro;
  const conSalud = c.datos_salud === true;
  const menor = resto.edad < MAYORIA_DE_EDAD;
  const lista: Consentimiento[] = (['aviso_privacidad', 'datos_salud', 'recordatorios', 'newsletter', 'telegram'] as const)
    .map((tipo) => ({ tipo, otorgado: c[tipo], version: VERSION_AVISO }));
  if (menor) lista.push({ tipo: 'tutor', otorgado: true, version: VERSION_AVISO });
  return {
    ok: true,
    preparado: {
      datos: { ...resto, padecimiento: conSalud ? padecimiento : undefined },
      consentimientos: lista,
      menor,
      convenio: Boolean(resto.empresa),
      categorias: [...new Set(resto.categorias)],
      descartado: { padecimiento: !conSalud && Boolean(padecimiento) },
    },
  };
}

/** Los campos del borrador que se guarda en el dispositivo: NUNCA el padecimiento ni la contraseña. */
export const CAMPOS_BORRADOR = ['empresa', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'edad', 'correo', 'celular', 'categorias'] as const;

export function borradorSeguro(datos: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CAMPOS_BORRADOR.filter((k) => datos[k] !== undefined).map((k) => [k, datos[k]]));
}
