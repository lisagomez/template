/** Lo que la ventana de Ágora necesita en cada render, leído con la sesión de la persona del laboratorio. */
import { cache } from 'react';
import { arbol, como, esperaTuClic, yo, type Sesion } from '../../../../tools/agora/dist/index.js';
import type { DatosDeAgora } from '../types';
import { laboratorio, personaActual, PERSONAS_DEL_LABORATORIO } from './laboratorio';

export async function conSesion<T>(fn: (s: Sesion, persona: string) => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; motivo: string }> {
  const lab = laboratorio();
  if (!lab.activo) return { ok: false, motivo: lab.motivo };
  const p = await personaActual();
  try {
    return { ok: true, valor: await como(lab.entorno.base, { tipo: 'persona', id: p.id }, (s) => fn(s, p.id)) };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

/** Una sola lectura por petición: el layout y la página la comparten. */
export const datosDeAgora = cache(async (): Promise<DatosDeAgora> => {
  const r = await conSesion(async (s, persona) => {
    const quien = await yo(s, persona);
    if (!quien) throw new Error('la persona del laboratorio no existe en la base: vuelve a sembrarla');
    const [hoy] = await s.consulta<{ hoy: string; periodo: string }>(`select (now() at time zone 'America/Mexico_City')::date::text hoy, to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM') periodo`);
    const fechas = await s.consulta<{ id: string; nombre: string; fin: string; categoria: string; version: number }>(
      `select i.id, i.nombre, i.fin::text fin, n.nombre categoria, i.version_fecha version from agora.item i join agora.nodo n on n.id = i.categoria_id
        where i.fin is not null and i.estado <> 'done' and i.fin between current_date - 7 and current_date + 45 order by i.fin limit 40`);
    // Por cerrar: un mes ya vencido, con movimiento en el libro y sin cerrar (el mismo criterio que el vigía).
    const cierres = (await s.consulta<{ periodo: string }>(`select distinct v.periodo from agora.v_centro_periodo v
        where v.periodo < to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')
          and not exists (select 1 from agora.periodo p where p.org_id = v.org_id and p.periodo = v.periodo and p.estado = 'cerrado') order by 1`)).map((x) => x.periodo);
    return { yo: quien, arbol: await arbol(s), espera: await esperaTuClic(s), periodo: hoy!.periodo, hoy: hoy!.hoy, fechas, cierres };
  });
  if (!r.ok) return { apagada: true, motivo: r.motivo };
  const p = await personaActual();
  return { apagada: false, ...r.valor, persona: p.clave, personas: PERSONAS_DEL_LABORATORIO.map(({ clave, nombre, titulo }) => ({ clave, nombre, titulo })) };
});
