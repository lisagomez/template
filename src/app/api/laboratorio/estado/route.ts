/** Que hay en la maquina (presencia, nunca valores) y que voces se pueden usar. Sin secretos: publico. */
import { NextResponse } from 'next/server';
import { demonioVivo, estadoMaquina } from '@/features/laboratorio-voz/services/servidor/dictado-cli';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const [maquina, demonio] = await Promise.all([estadoMaquina(), demonioVivo()]);
    return NextResponse.json({ ...maquina, demonio });
  } catch {
    return NextResponse.json({ error: 'no se pudo leer el estado de la maquina' }, { status: 500 });
  }
}
