/** Que hay en la maquina (presencia, nunca valores) y que voces se pueden usar. Sin secretos: publico. */
import { NextResponse } from 'next/server';
import { estadoMaquina } from '@/features/laboratorio-voz/services/servidor/dictado-cli';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await estadoMaquina());
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el estado de la maquina' }, { status: 500 });
  }
}
