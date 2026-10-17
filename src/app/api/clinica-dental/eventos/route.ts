/**
 * Los eventos que nacen en el navegador (visita, inicio de registro, preferencia de voz o chatbot). Lista
 * CERRADA de tipos y campos (Zod): nada de texto libre. Si hay sesion de un paciente de esa clinica, el sujeto es
 * su seudonimo; si no, el del visitante. Devuelve lo que puede ir al dataLayer (o nada).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { aDataLayer, CANALES_ADQUISICION, CLINICAS, type EventoSinSello } from '../../../../../tools/clinica-dental/dist/index.js';
import { excedeLimite, ipDe, rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export const dynamic = 'force-dynamic';

const visitante = z.string().regex(/^vis_[0-9a-f]{20}$/);
const clinica = z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]);
const esquema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('portal_visitado'), clinica, visitante, canal_adquisicion: z.enum(CANALES_ADQUISICION), dispositivo: z.enum(['escritorio', 'celular']) }).strict(),
  z.object({ tipo: z.literal('registro_iniciado'), clinica, visitante, via: z.enum(['escrito', 'voz']) }).strict(),
  z.object({ tipo: z.literal('preferencia_cambiada'), clinica, visitante, preferencia: z.enum(['voz', 'chatbot']), habilitado: z.boolean() }).strict(),
]);

/** Del cuerpo validado al evento del contrato, campo por campo: el visitante sale y entra el sujeto. */
function aEvento(d: z.infer<typeof esquema>, sujeto: string): EventoSinSello {
  switch (d.tipo) {
    case 'portal_visitado': return { tipo: d.tipo, clinica: d.clinica, sujeto, canal_adquisicion: d.canal_adquisicion, dispositivo: d.dispositivo };
    case 'registro_iniciado': return { tipo: d.tipo, clinica: d.clinica, sujeto, via: d.via };
    case 'preferencia_cambiada': return { tipo: d.tipo, clinica: d.clinica, sujeto, preferencia: d.preferencia, habilitado: d.habilitado };
  }
}

export async function POST(p: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoDeBorde(p, true);
  if (rechazo) return rechazo;
  if (excedeLimite(`eventos|${ipDe(p)}`, 120)) return NextResponse.json({ error: 'demasiadas peticiones' }, { status: 429 });
  const e = esquema.safeParse(await p.json().catch(() => null));
  if (!e.success) return NextResponse.json({ error: 'evento inválido' }, { status: 400 });
  const rt = await runtime();
  const usuario = e.data.tipo === 'preferencia_cambiada' ? await usuarioActual() : null;
  const paciente = usuario ? await rt.portal.paciente(e.data.clinica, usuario) : null;
  const sujeto = paciente?.seudonimo ?? e.data.visitante;
  const evento = await rt.portal.emite(aEvento(e.data, sujeto), `${e.data.tipo}|${sujeto}|${rt.reloj()}`);
  return NextResponse.json({ dataLayer: aDataLayer(evento) });
}
