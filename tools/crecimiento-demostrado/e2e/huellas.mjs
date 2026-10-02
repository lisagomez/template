#!/usr/bin/env node
/**
 * Una corrida completa en un proceso NUEVO: construye Γ de las dos pymes desde sus fuentes y
 * responde las preguntas del replay. Imprime las huellas (Γ, spec, plan, hechos, certificado).
 * Dos procesos tienen que imprimir exactamente lo mismo: `node e2e/huellas.mjs` dos veces.
 */
import * as xml from '../../extractor-documental/dist/xml/index.js';
import { huellasDeCorrida } from '../dist/laboratorio/index.js';

process.stdout.write(`${JSON.stringify(await huellasDeCorrida(xml), null, 2)}\n`);
