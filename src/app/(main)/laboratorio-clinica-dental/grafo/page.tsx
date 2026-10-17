import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GrafoAtencion } from '../../../../../tools/clinica-dental/dist/index.js';
import { Grafo } from '@/features/clinica-dental/components/laboratorio/grafo';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';

export default async function PaginaGrafo() {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio.</p>;
  const ruta = join(/*turbopackIgnore: true*/ process.cwd(), 'docs/grafos/clinica-dental-atencion.json');
  const grafo = await readFile(/*turbopackIgnore: true*/ ruta, 'utf8').then((t) => JSON.parse(t) as GrafoAtencion).catch(() => null);
  return (
    <div lang="es-MX" className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Grafo de atención al cliente · laboratorio</h1>
      <p className="text-sm text-slate-700">El recorrido de los pacientes sintéticos por el portal, del libro de eventos a MetricFlow. Vista del laboratorio, no del paciente.</p>
      {grafo ? <Grafo grafo={grafo} /> : <p>Aún no hay grafo: corre la capa semántica y node scripts/clinica-dental/analitica.ts.</p>}
    </div>
  );
}
