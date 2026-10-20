/**
 * /api/ventas-whatsapp/openwa-informe — el informe de migración del panel: llamadas de OpenWA pegadas (`MÉTODO /api/...`)
 * → qué sigue igual, qué cambia y qué las reemplaza por la vía oficial. Sale de la matriz pública del contrato
 * pineado: no lee ni guarda nada del laboratorio, y no registra lo que se pega (puede traer ids de sesión).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { informeDeMigracion } from '../../../../../tools/ventas-whatsapp/dist/openwa/index.js';

export const dynamic = 'force-dynamic';

const esquema = z.object({ llamadas: z.string().max(50_000) });

export async function POST(peticion: Request): Promise<Response> {
  const c = esquema.safeParse(await peticion.json().catch(() => null));
  if (!c.success) return NextResponse.json({ error: 'llamadas: texto de hasta 50,000 caracteres' }, { status: 400 });
  return NextResponse.json(informeDeMigracion(c.data.llamadas));
}
