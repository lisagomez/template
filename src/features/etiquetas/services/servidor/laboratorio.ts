/**
 * El laboratorio de etiquetas visto desde la app: la app usa SOLO lo que el laboratorio aprobó.
 *
 * - `/laboratorio-etiquetas` corre todos los casos en cada visita y deja aquí el resultado.
 * - `/etiquetas` lee el último resultado (dura 30 min; al vencer se vuelve a correr en segundo plano):
 *   una pantalla cuya herramienta no está aprobada se apaga, y la lectura de la fecha por foto usa el
 *   motor solo si «Fecha por foto» está aprobada (si no, la fecha se teclea, como sin motor).
 *
 * El motor y el corpus real son los de ESTA máquina: el motor por `ETIQUETAS_MOTOR_PYTHON`; el corpus por
 * `ETIQUETAS_CORPUS_REAL` o, si existe, `.datos/corpus-caducidades` (fuera de git).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { MotorFechas } from '../nucleo.ts';
import { aprobadas, correLaboratorio } from '../../../laboratorio-etiquetas/services/catalogo.ts';
import type { CasoCorrido, ContextoDeLaboratorio, IdHerramienta } from '../../../laboratorio-etiquetas/services/tipos.ts';
import { motorDelServidor } from './fotos.ts';

export function contextoDelServidor(): ContextoDeLaboratorio {
  const dir = resolve(/*turbopackIgnore: true*/ process.env['ETIQUETAS_CORPUS_REAL'] || '.datos/corpus-caducidades');
  return { motor: motorDelServidor(), corpusReal: existsSync(join(/*turbopackIgnore: true*/ dir, 'esperado.json')) ? dir : null };
}

export interface VeredictoDelLaboratorio {
  readonly aprobadas: readonly IdHerramienta[];
  readonly cuando: string;
  readonly casos: number;
  readonly fallan: number;
}

const VIDA_MS = 30 * 60_000;
let vigente: VeredictoDelLaboratorio | null = null;
let enCurso: Promise<VeredictoDelLaboratorio> | null = null;

function guarda(corridos: readonly CasoCorrido[]): VeredictoDelLaboratorio {
  vigente = { aprobadas: aprobadas(corridos), cuando: new Date().toISOString(), casos: corridos.length, fallan: corridos.filter((c) => c.resultado.estado === 'falla').length };
  return vigente;
}

/** Corre el laboratorio completo (la página lo hace en cada visita) y deja su veredicto para la app. */
export async function correYGuarda(): Promise<CasoCorrido[]> {
  const corridos = await correLaboratorio(contextoDelServidor());
  guarda(corridos);
  return corridos;
}

/** El veredicto vigente, o la corrida en curso si no hay uno o ya venció. */
export function veredicto(): Promise<VeredictoDelLaboratorio> {
  if (vigente && Date.now() - Date.parse(vigente.cuando) < VIDA_MS) return Promise.resolve(vigente);
  enCurso ??= correLaboratorio(contextoDelServidor()).then(guarda).finally(() => { enCurso = null; });
  return enCurso;
}

/** Lo que hay sin esperar (para el estado de la app): `null` mientras corre la primera vez. */
export function veredictoSinEsperar(): VeredictoDelLaboratorio | null {
  void veredicto().catch(() => undefined);
  return vigente;
}

/** El motor, solo si «Fecha por foto» pasa su laboratorio en esta máquina. */
export async function motorAprobado(): Promise<{ motor: MotorFechas | null; motivo?: string }> {
  const motor = motorDelServidor();
  if (!motor) return { motor: null };
  const v = await veredicto();
  return v.aprobadas.includes('fecha-foto') ? { motor } : { motor: null, motivo: 'La lectura de la fecha por foto no está aprobada por el laboratorio (/laboratorio-etiquetas): teclea la fecha. La foto queda como evidencia.' };
}
