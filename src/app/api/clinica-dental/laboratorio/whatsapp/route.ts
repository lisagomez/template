/**
 * El TELÉFONO del paciente en el laboratorio (solo con CLINICA_LABORATORIO=1 y mismo origen), todo por POST (el número
 * nunca va en una URL: los logs del servidor guardan las URL): `lee` la conversación de un número con una clínica; lo que
 * la persona hace en su WhatsApp simulado (escribir, tocar un botón, nota de voz con voz local, foto, abrir y llenar un
 * Flow) o que la recepción conteste desde su celular. Y las palancas de Meta: desconectar el número o pausar una
 * plantilla. Nada de esto existe fuera del laboratorio ni sale hacia Meta.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CLINICAS } from '../../../../../../tools/clinica-dental/dist/index.js';
import { rechazoDeBorde } from '@/features/clinica-dental/services/servidor/borde';
import { actua, conversacion } from '@/features/clinica-dental/services/servidor/telefono';
import { despacha, runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { NUMEROS_WA } from '@/features/clinica-dental/services/servidor/whatsapp';

export const dynamic = 'force-dynamic';
const clinica = z.enum(CLINICAS.map((c) => c.id) as [string, ...string[]]);
const numero = z.string().regex(/^\d{10,15}$/);
const texto = z.string().trim().min(1).max(1000);
const accion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('escribe'), texto }),
  z.object({ accion: z.literal('toca'), boton: z.string().min(1).max(256) }),
  z.object({ accion: z.literal('voz'), texto: z.string().trim().min(1).max(300) }),
  z.object({ accion: z.literal('foto'), pie: z.string().max(300) }),
  z.object({ accion: z.literal('recepcion'), texto }),
  z.object({ accion: z.literal('abre-flow') }),
  z.object({ accion: z.literal('envia-flow'), datos: z.record(z.string(), z.union([z.string().max(200), z.boolean()])) }),
  z.object({ accion: z.literal('desconecta') }),
  z.object({ accion: z.literal('reconecta') }),
  z.object({ accion: z.literal('plantilla'), nombre: z.string().regex(/^[a-z0-9_]{3,60}$/), estado: z.enum(['APPROVED', 'PAUSED', 'DISABLED']) }),
  // Solo para medir: borra la memoria corta del asistente y el conteo de la frontera de ESE número (preguntas independientes).
  z.object({ accion: z.literal('olvida') }),
  z.object({ accion: z.literal('lee') }),
]);
const peticion = z.object({ clinica, numero, nombre: z.string().max(40).default('Paciente'), cambio: accion }).strict();

export async function POST(p: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoDeBorde(p, true);
  if (rechazo) return rechazo;
  const r = peticion.safeParse(await p.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: 'acción inválida' }, { status: 400 });
  const { clinica: c, numero: n, nombre, cambio } = r.data;
  const rt = await runtime();
  const pnid = NUMEROS_WA.find((x) => x.clinica === c)!.phoneNumberId;
  try {
    if (cambio.accion === 'desconecta') rt.whatsapp.meta.desconecta(pnid);
    else if (cambio.accion === 'reconecta') rt.whatsapp.meta.reconecta(pnid);
    else if (cambio.accion === 'plantilla') rt.whatsapp.meta.cambiaPlantilla(pnid, cambio.nombre, cambio.estado);
    else if (cambio.accion === 'lee') return NextResponse.json({ ok: true, ...(await conversacion(c, n)), alertas: rt.whatsapp.receptor().alertas.slice(-5) });
    else if (cambio.accion === 'olvida') {
      const m = rt.whatsapp.receptor().memoria;
      for (const mapa of [m.historial, m.recientes]) for (const k of [...mapa.keys()]) if (k.startsWith(`${c}|`) && k.endsWith(n.replace(/^521/, '52'))) mapa.delete(k);
    }
    else await actua(c, n, nombre, cambio);
    await despacha();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'no se pudo' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, ...(await conversacion(c, n)) });
}
