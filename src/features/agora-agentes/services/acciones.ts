'use server';

/**
 * El socio SIMULADO del laboratorio contra la Puerta (cerrada): los escenarios que la Puerta tiene que aceptar o
 * rechazar. Corre en el servidor, con la llave ficticia del socio; nada sale de la máquina.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';
import { llamaComoSocio, nodo, item, socio, tokenDeSocio, tokenConFirmaAjena, tokenConOtraLlave, tokenConTarjetaRefirmada } from '../../../../tools/agora/dist/laboratorio/index.js';
import { laboratorio } from '@/features/agora/services/laboratorio';

export type Escenario = 'valida' | 'propuesta' | 'refirmada' | 'otra-llave' | 'firma-ajena' | 'jti-repetido' | 'fuera-de-alcance';
export interface ResultadoSimulado { escenario: Escenario; http: number; admitida: boolean; motivo: string; retryAfter: number | null; respuesta: unknown }

export async function simulaSocio(entrada: { socio: string; escenario: Escenario }): Promise<{ ok: true; valor: ResultadoSimulado } | { ok: false; motivo: string }> {
  const d = z.object({ socio: z.enum(['medios-norte', 'fletes-golfo', 'empaques-regio']), escenario: z.enum(['valida', 'propuesta', 'refirmada', 'otra-llave', 'firma-ajena', 'jti-repetido', 'fuera-de-alcance']) }).parse(entrada);
  const lab = laboratorio();
  if (!lab.activo) return { ok: false, motivo: lab.motivo };
  const { base, secreto } = lab.entorno;
  const s = socio(d.socio);
  let r;
  switch (d.escenario) {
    case 'refirmada': r = await llamaComoSocio(base, secreto, d.socio, { token: tokenConTarjetaRefirmada(d.socio) }); break;
    case 'otra-llave': r = await llamaComoSocio(base, secreto, d.socio, { token: tokenConOtraLlave(d.socio) }); break;
    case 'firma-ajena': r = await llamaComoSocio(base, secreto, d.socio, { token: tokenConFirmaAjena(d.socio) }); break;
    case 'fuera-de-alcance': r = await llamaComoSocio(base, secreto, d.socio, { categoria: nodo('pipeline'), texto: 'Quiero ver el pipeline.' }); break;
    case 'jti-repetido': {
      const token = tokenDeSocio(s, 'golfo-norte', { jti: `repetido-${Date.now()}` });
      await llamaComoSocio(base, secreto, d.socio, { token, texto: 'Primera llamada con este jti.' });
      r = await llamaComoSocio(base, secreto, d.socio, { token, texto: 'La misma llamada, otra vez.' });
      break;
    }
    case 'propuesta': {
      const [cat] = s.agente.alcance[0]!;
      const it = d.socio === 'fletes-golfo' ? 'it-7' : 'it-5';
      const [fila] = await base.consulta<{ fin: string }>('select fin::text from agora.item where id = $1', [item(it)]);
      const nueva = new Date(Date.UTC(Number(fila!.fin.slice(0, 4)), Number(fila!.fin.slice(5, 7)) - 1, Number(fila!.fin.slice(8, 10)) + 7, 12));
      while ([0, 6].includes(nueva.getUTCDay())) nueva.setUTCDate(nueva.getUTCDate() + 1);
      r = await llamaComoSocio(base, secreto, d.socio, { texto: 'Propongo recorrer la fecha una semana por la disponibilidad de la imprenta.',
        propuesta: { resumen: `Recorrer una semana la fecha de ${it === 'it-7' ? 'la ruta de reparto' : 'la campaña de radio'}`, payload: { version: 1, clase: 'mover_fecha', categoria: nodo(cat), cambios: [{ item: item(it), campo: 'fin', antes: fila!.fin, despues: nueva.toISOString().slice(0, 10) }] } } });
      break;
    }
    default: r = await llamaComoSocio(base, secreto, d.socio, { texto: 'Reporte del socio: todo en tiempo esta semana.' });
  }
  refresh();
  return { ok: true, valor: { escenario: d.escenario, http: r.http, admitida: r.admitida, motivo: r.motivo, retryAfter: r.reintentaEn ?? null, respuesta: r.cuerpo } };
}
