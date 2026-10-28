/**
 * El laboratorio de Ágora en el servidor: SOLO con `AGORA_LABORATORIO=1`, la base del laboratorio (`AGORA_PG_URL`,
 * un Postgres efímero) y el secreto de las tareas de los agentes (`AGORA_SECRETO`). Sin eso, Ágora está apagada y
 * sus pantallas lo dicen: nada se lee ni se escribe. La persona es una de las FICTICIAS del laboratorio («Ver como»):
 * en producción sería la sesión de Supabase, nunca una cookie que alguien elige.
 */
import { cookies } from 'next/headers';
import { basePostgres } from '../../../../tools/agora/dist/base/pg.js';
import type { Base, Entorno } from '../../../../tools/agora/dist/index.js';
import { PERSONAS, persona as idDe } from '../../../../tools/agora/dist/laboratorio/datos.js';

export const COOKIE_PERSONA = 'agora_persona';
export const PERSONA_POR_DEFECTO = 'paula';

export type EstadoLaboratorio = { activo: true; entorno: Entorno } | { activo: false; motivo: string };

const conBase = globalThis as unknown as { __agoraBase?: { url: string; base: Base } };

export function laboratorio(): EstadoLaboratorio {
  if (process.env.AGORA_LABORATORIO !== '1') return { activo: false, motivo: 'Ágora corre solo en el laboratorio, con datos ficticios: aquí está apagada.' };
  const url = process.env.AGORA_PG_URL ?? '';
  const secreto = process.env.AGORA_SECRETO ?? '';
  if (!url) return { activo: false, motivo: 'falta la base del laboratorio: npm run agora:laboratorio la levanta y la siembra.' };
  if (secreto.length < 32) return { activo: false, motivo: 'falta el secreto de las tareas de los agentes del laboratorio (lo escribe npm run agora:laboratorio).' };
  if (!conBase.__agoraBase || conBase.__agoraBase.url !== url) conBase.__agoraBase = { url, base: basePostgres(url, 8) };
  return { activo: true, entorno: { base: conBase.__agoraBase.base, secreto } };
}

export interface PersonaDelLaboratorio { clave: string; id: string; nombre: string; titulo: string }

export const PERSONAS_DEL_LABORATORIO: PersonaDelLaboratorio[] = PERSONAS.filter((p) => p.org === PERSONAS[0]!.org)
  .map((p) => ({ clave: p.clave, id: idDe(p.clave), nombre: p.nombre, titulo: p.titulo }));

export async function personaActual(): Promise<PersonaDelLaboratorio> {
  const valor = (await cookies()).get(COOKIE_PERSONA)?.value;
  return PERSONAS_DEL_LABORATORIO.find((p) => p.clave === valor) ?? PERSONAS_DEL_LABORATORIO.find((p) => p.clave === PERSONA_POR_DEFECTO)!;
}
