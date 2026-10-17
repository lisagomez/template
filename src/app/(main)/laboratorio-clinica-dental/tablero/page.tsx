import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UnitEconomicsClinica } from '../../../../../tools/clinica-dental/dist/index.js';
import { Tablero } from '@/features/clinica-dental/components/laboratorio/tablero';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';

export default async function PaginaTablero() {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio.</p>;
  const ruta = join(/*turbopackIgnore: true*/ process.cwd(), 'docs/goals/clinica-dental-medicion/unit-economics.json');
  const datos = await readFile(/*turbopackIgnore: true*/ ruta, 'utf8').then((t) => JSON.parse(t) as { periodoDias: number; corte: string; clinicas: UnitEconomicsClinica[] }).catch(() => null);
  return (
    <div lang="es-MX" className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Unit economics · laboratorio</h1>
      {datos ? <Tablero clinicas={datos.clinicas} periodoDias={datos.periodoDias} corte={datos.corte} /> : <p>Aún no hay corte: corre la capa semántica y node scripts/clinica-dental/analitica.ts.</p>}
    </div>
  );
}
