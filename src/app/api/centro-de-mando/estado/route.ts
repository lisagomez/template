/**
 * Centro de mando: lo que el HUD enseña de la máquina (presencias, nunca valores): si el motor
 * local responde, qué modelo y qué versión del prompt usa el cerebro, el gasto contra el tope y
 * si hay agenda. C3: Bearer obligatorio.
 */
import { access } from 'node:fs/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { modeloCerebro } from '@/features/centro-de-mando/services/servidor/cerebro';
import { ESPEJO_AGENDA } from '@/features/centro-de-mando/services/servidor/datos';
import { estadoGasto } from '@/features/centro-de-mando/services/servidor/gasto';
import { VERSION_PROMPT_CEREBRO } from '@/features/centro-de-mando/services/servidor/prompt-cerebro';
import { demonioResponde } from '@/features/centro-de-mando/services/servidor/transcribe';
import { rechazoSinToken } from '@/shared/lib/token-dictado';

export const dynamic = 'force-dynamic';

export async function GET(peticion: NextRequest): Promise<NextResponse> {
  const rechazo = rechazoSinToken(peticion);
  if (rechazo) return rechazo;
  const [demonio, gasto, agenda] = await Promise.all([
    demonioResponde(),
    estadoGasto(),
    access(/*turbopackIgnore: true*/ ESPEJO_AGENDA).then(() => true, () => false),
  ]);
  return NextResponse.json({
    demonio,
    modelo: modeloCerebro(),
    prompt: VERSION_PROMPT_CEREBRO,
    llave: Boolean(process.env['OPENROUTER_API_KEY']),
    gasto: { gastadoUsd: gasto.gastadoUsd, topeUsd: gasto.presupuestoUsd, nivel: gasto.nivel, filasSinCosto: gasto.filasSinCosto },
    agenda,
  });
}
