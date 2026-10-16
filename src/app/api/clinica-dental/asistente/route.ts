/**
 * El asistente de la clínica, en flujo: una línea NDJSON por FRASE ya revisada (`{"t":"frase","x":…}`) y al final
 * la respuesta (`{"t":"fin",…}`: ruta, intención, acción PROPUESTA, urgencia, barrera, latencia, costo). Nunca
 * ejecuta nada: la acción es un botón que la persona confirma en la UI.
 * C3: lo que llega es entrada no confiable (Zod, topes de largo); el usuario sale de la sesión, no del cuerpo.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';
import { responde } from '@/features/clinica-dental/services/servidor/asistente';
import { excedeLimite, ipDe, rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export const dynamic = 'force-dynamic';

const esquema = z.object({
  clinica: z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]),
  candidatos: z.array(z.string().trim().min(1).max(500)).min(1).max(3),
  historial: z.array(z.object({ rol: z.enum(['usuario', 'asistente']), texto: z.string().max(1200) })).max(12).default([]),
  modo: z.enum(['texto', 'voz']),
  conversacion: z.string().regex(/^cnv_[0-9a-f]{20}$/),
  visitante: z.string().regex(/^vis_[0-9a-f]{20}$/).nullable().default(null),
  usaPadecimiento: z.boolean().default(false),
}).strict();

export async function POST(peticion: NextRequest): Promise<Response> {
  const rechazo = rechazoDeBorde(peticion, true);
  if (rechazo) return rechazo;
  // Denial-of-wallet (C3 T-3): además del tope del libro de gasto, un límite por origen.
  if (excedeLimite(`asistente|${ipDe(peticion)}`, 60)) return NextResponse.json({ error: 'demasiadas preguntas seguidas; espera un minuto' }, { status: 429 });
  const cuerpo = esquema.safeParse(await peticion.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: 'petición inválida' }, { status: 400 });
  const usuario = await usuarioActual();
  const cod = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(c) {
      const linea = (o: unknown) => {
        try { c.enqueue(cod.encode(`${JSON.stringify(o)}\n`)); } catch { /* el cliente cortó */ }
      };
      try {
        const r = await responde({ ...cuerpo.data, usuario }, peticion.signal, (x) => linea({ t: 'frase', x }));
        linea({ t: 'fin', ruta: r.ruta, intencion: r.intencion, accion: r.accion, urgencia: r.urgencia, barrera: r.barrera, latenciaMs: r.latenciaMs, primeraFraseMs: r.primeraFraseMs, costoUsd: r.costoUsd, versionPrompt: r.versionPrompt, texto: r.texto });
      } catch {
        if (!peticion.signal.aborted) linea({ t: 'error', mensaje: 'el asistente no pudo contestar; llama a la clínica' });
      } finally {
        try { c.close(); } catch { /* ya cerrado */ }
      }
    },
  });
  return new Response(flujo, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
