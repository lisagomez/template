/**
 * Proceso hijo que usa la app: lee la petición por stdin (JSON), procesa el clip con los motores locales
 * y deja `resultado.json` en la carpeta del proyecto. Aislado de Next a propósito: los módulos nativos
 * (sherpa-onnx, onnxruntime) no pasan por el empaquetador, y un fallo del motor no tumba el servidor.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { procesa, type EntradaDeProceso } from '../../tools/reel/dist/node/index.js';
import { motores } from './motores.ts';

const trozos: Buffer[] = [];
for await (const t of process.stdin) trozos.push(t as Buffer);
const e = JSON.parse(Buffer.concat(trozos).toString()) as EntradaDeProceso;
const r = await procesa(e, motores());
writeFileSync(join(e.carpeta, 'resultado.json'), JSON.stringify(r, null, 1));
process.stdout.write(JSON.stringify({ estado: r.estado, huella: r.master?.huella ?? null, duracion: r.master?.medidas.duracion ?? null }));
