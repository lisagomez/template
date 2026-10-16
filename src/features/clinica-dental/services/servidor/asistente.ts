/**
 * El asistente de la clinica en el servidor: el pipeline del nucleo (urgencia por regla → barreras → enrutador
 * de bucle-voz → cerebro) con el cerebro REAL por OpenRouter, modelo pineado de la clase `asistente-paciente`
 * (nivel voz), llave del entorno (nunca se imprime) y tope duro del libro de gasto. Solo sale TEXTO hacia
 * OpenRouter; el audio nunca pasa por aqui. Cada turno deja en el libro su intencion, ruta, latencia y costo,
 * NUNCA lo que se dijo.
 */
import { randomBytes } from 'node:crypto';
import { creaCerebroCompat } from '../../../../../tools/bucle-voz/dist/openrouter.js';
import { creaEnrutadorLocal, VERBOS_ESCRITURA } from '../../../../../tools/bucle-voz/dist/index.js';
import {
  clinica as clinicaDe, creaAsistente, fechaLarga, ORDENES_CLINICA, VERBOS_ESCRITURA_CLINICA, type MensajeCerebro, type PuertoCerebro, type RespuestaAsistente,
} from '../../../../../tools/clinica-dental/dist/servidor.js';
import { modeloPara } from '../../../../lib/ai/routing.ts';
import { anotaGasto, estadoGasto } from './gasto';
import { runtime } from './runtime';

const CANARIO = `ref-${randomBytes(6).toString('hex')}`;
const enrutador = creaEnrutadorLocal({ ordenes: ORDENES_CLINICA, vocativos: ['asistente'], verbosEscritura: [...VERBOS_ESCRITURA, ...VERBOS_ESCRITURA_CLINICA] });

export class SinCerebro extends Error {}

/** El cerebro con tope y libro de gasto: una llamada abortada o fallida tambien se anota (coste null). */
function cerebroPara(sistema: string, maxTokens: number): PuertoCerebro {
  const { modelo, precio } = modeloPara('asistente-paciente');
  return {
    async *piensa(mensajes, senal) {
      const llave = process.env['OPENROUTER_API_KEY'];
      if (!llave) throw new SinCerebro('falta OPENROUTER_API_KEY en el servidor');
      if ((await estadoGasto()).recomiendaCortar) throw new SinCerebro('se acabó el presupuesto del asistente');
      const c = creaCerebroCompat({ llave, modelo, sistema, fetch, precio, maxTokens, temperatura: 0.2, cabeceras: { 'X-Title': 'clinica-dental-asistente' } });
      let anotado = false;
      try {
        for await (const p of c.piensa(mensajes, senal)) {
          if (p.tipo === 'uso') {
            anotado = true;
            await anotaGasto(p.tokens ? { entrada: p.tokens.entrada, salida: p.tokens.salida } : null, p.costoUsd);
          }
          yield p.tipo === 'uso' ? { tipo: 'uso' as const, costoUsd: p.costoUsd, ...(p.tokens ? { tokens: { entrada: p.tokens.entrada, salida: p.tokens.salida } } : {}) } : p;
        }
      } finally {
        if (!anotado) await anotaGasto(null, null).catch(() => undefined);
      }
    },
  };
}

export interface PeticionAsistente {
  clinica: string;
  candidatos: string[];
  historial: MensajeCerebro[];
  modo: 'texto' | 'voz';
  conversacion: string;
  usuario: string | null;
  visitante: string | null;
  usaPadecimiento: boolean;
}

async function contexto(p: PeticionAsistente) {
  if (!p.usuario) return { citas: null, padecimiento: null, sujeto: p.visitante };
  const rt = await runtime();
  const paciente = await rt.portal.paciente(p.clinica, p.usuario);
  if (!paciente) return { citas: null, padecimiento: null, sujeto: p.visitante };
  const c = clinicaDe(p.clinica);
  const prox = await rt.portal.proximas(p.clinica, p.usuario);
  const citas = prox.citas.map((x) => ({ cuando: fechaLarga(x.cita.inicio, c.zona), servicio: x.servicio }));
  const salud = (await rt.portal.consentimientos(p.clinica, p.usuario)).datos_salud === true;
  return { citas, padecimiento: p.usaPadecimiento && salud ? paciente.datos.padecimiento ?? null : null, sujeto: paciente.seudonimo };
}

export async function responde(p: PeticionAsistente, senal: AbortSignal, alFrase: (f: string) => void): Promise<RespuestaAsistente> {
  const c = clinicaDe(p.clinica);
  const ctx = await contexto(p);
  const a = creaAsistente({ clinica: c, enrutador, cerebroPara, reloj: () => performance.now(), canario: CANARIO });
  const r = await a.responde({ candidatos: p.candidatos, historial: p.historial, citas: ctx.citas, padecimiento: ctx.padecimiento, senal, alFrase });
  if (ctx.sujeto) await registraTurno(p, r, ctx.sujeto, ctx.padecimiento !== null);
  return r;
}

async function registraTurno(p: PeticionAsistente, r: RespuestaAsistente, sujeto: string, usoPadecimiento: boolean): Promise<void> {
  const rt = await runtime();
  const base = { clinica: p.clinica, sujeto, conversacion: p.conversacion } as const;
  const clave = `turno|${p.conversacion}|${randomBytes(6).toString('hex')}`;
  await rt.portal.emite({ ...base, tipo: 'asistente_turno', modo: p.modo, ruta: r.ruta, intencion: r.intencion, latencia_ms: r.latenciaMs, costo_usd: r.costoUsd, tokens_entrada: r.tokens?.entrada ?? null, tokens_salida: r.tokens?.salida ?? null, uso_padecimiento: usoPadecimiento }, clave);
  if (r.urgencia) await rt.portal.emite({ ...base, tipo: 'urgencia_derivada', regla: r.urgencia.regla, destino: r.urgencia.destino }, `${clave}|urgencia`);
}

export function versionCerebro() {
  return { modelo: modeloPara('asistente-paciente').modelo };
}
