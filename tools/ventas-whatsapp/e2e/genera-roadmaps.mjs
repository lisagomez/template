#!/usr/bin/env node
/**
 * Regenera los dos roadmaps del piloto desde el código (la prueba `pruebas/roadmaps.ts` falla si el
 * papel y el código divergen):
 *   node tools/ventas-whatsapp/e2e/genera-roadmaps.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roadmapConversacionesMarkdown, roadmapCostosMarkdown } from '../dist/laboratorio/index.js';

const piloto = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'piloto');
writeFileSync(join(piloto, 'ROADMAP-COSTOS.md'), roadmapCostosMarkdown());
writeFileSync(join(piloto, 'ROADMAP-CONVERSACIONES.md'), roadmapConversacionesMarkdown());
console.log('roadmaps regenerados en piloto/');
