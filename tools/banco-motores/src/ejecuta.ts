/**
 * Correr una función con las dos barreras: la entrada se valida ANTES de tocar el motor y la salida se
 * valida DESPUÉS. Lo que el motor devuelva fuera de su esquema no llega a la pantalla: se rechaza en la
 * etapa `salida` y el valor crudo no viaja en el resultado (en un OCR, ese valor es el documento).
 *
 * Un error del motor tampoco viaja entero: solo su primera línea, recortada. Los adaptadores de proceso
 * ya no ponen stdout en sus errores; esto es la segunda capa, por si un motor nuevo no lo cumple.
 */
import type { z } from 'zod';
import type { EtapaDeFallo, Funcion, FuncionDeBanco, Problema, Resultado } from './tipos.js';

/** Registra una función con sus genéricos comprobados y la devuelve borrada para el registro. */
export function defineFuncion<E extends z.ZodType, S extends z.ZodType>(f: Funcion<E, S>): FuncionDeBanco {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id)) throw new Error(`id de función inválido: «${f.id}» (kebab-case)`);
  if (f.ejemplos.some((e) => e.sintetico !== true)) throw new Error(`«${f.id}»: un ejemplo del banco es sintético o no entra`);
  return f as unknown as FuncionDeBanco;
}

export function problemasDe(error: z.ZodError): readonly Problema[] {
  return error.issues.map((i) => ({ ruta: i.path.map(String).join('.') || '(raíz)', mensaje: i.message }));
}

/** La primera línea del error, sin más de 200 caracteres: nunca un volcado del motor. */
export function mensajeSeguro(e: unknown): string {
  const crudo = e instanceof Error ? e.message : typeof e === 'string' ? e : 'el motor falló sin decir por qué';
  const linea = crudo.split('\n')[0]?.trim() || 'el motor falló sin decir por qué';
  return linea.length > 200 ? `${linea.slice(0, 199)}…` : linea;
}

const falla = (etapa: EtapaDeFallo, mensaje: string, problemas: readonly Problema[], ms: number): Resultado => ({ ok: false, etapa, mensaje, problemas, ms });

/** Espera al motor, o a que se cancele: lo que llegue primero. */
function carrera<T>(promesa: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('cancelada'));
  return new Promise<T>((ok, mal) => {
    const alAbortar = () => mal(new Error('cancelada'));
    signal.addEventListener('abort', alAbortar, { once: true });
    promesa.then(ok, mal).finally(() => signal.removeEventListener('abort', alAbortar));
  });
}

export interface OpcionesDeEjecucion {
  readonly signal?: AbortSignal;
  readonly reloj?: () => number;
}

export async function ejecuta(f: FuncionDeBanco, crudo: unknown, o: OpcionesDeEjecucion = {}): Promise<Resultado> {
  const reloj = o.reloj ?? (() => performance.now());
  const signal = o.signal ?? new AbortController().signal;
  const t0 = reloj();
  const ms = () => Math.round(reloj() - t0);
  const entrada = f.entrada.safeParse(crudo);
  if (!entrada.success) return falla('entrada', 'La entrada no cumple el esquema de la función.', problemasDe(entrada.error), ms());
  let bruto: unknown;
  try {
    bruto = await carrera(f.ejecuta(entrada.data, { signal }), signal);
  } catch (e) {
    if (signal.aborted) return falla('cancelada', 'Cancelaste la ejecución antes de que el motor terminara.', [], ms());
    return falla('motor', mensajeSeguro(e), [], ms());
  }
  const salida = f.salida.safeParse(bruto);
  if (!salida.success) return falla('salida', 'El motor devolvió algo que no cumple su esquema: no se muestra.', problemasDe(salida.error), ms());
  return { ok: true, salida: salida.data, ms: ms() };
}
