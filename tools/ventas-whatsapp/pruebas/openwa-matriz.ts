/**
 * La MATRIZ de la puerta de salida es la del contrato pineado y nadie la edita a mano: el sha256 del openapi es el
 * pineado, la matriz escrita es la que genera `genera-matriz.mjs` desde los criterios, cubre todas las operaciones
 * del contrato (cada fila con su fuente), y la fachada sirve exactamente las filas `igual` y `diferencia`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRATO_OPENWA, ESTADOS_OPENWA, MANEJADORES, MATRIZ_OPENWA } from '../dist/openwa/index.js';
import { operaciones } from './_contrato.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHA256_PINEADO = 'sha256:fdb4bd3c7bb26b5ffd5d415d94c9eebdb6630de196c14c2d561a05b76a91789d';

test('el contrato es el pineado (sha256) y la licencia MIT de OpenWA va con él', () => {
  const hash = 'sha256:' + createHash('sha256').update(readFileSync(join(raiz, 'openwa', 'openapi-0.25.0.json'))).digest('hex');
  assert.equal(hash, SHA256_PINEADO);
  assert.equal(CONTRATO_OPENWA.sha256, SHA256_PINEADO);
  assert.match(readFileSync(join(raiz, 'openwa', 'LICENSE-OpenWA'), 'utf8'), /MIT License[\s\S]*Copyright \(c\) 2026 Yudhi Armyndharis and OpenWA Contributors/);
});

test('la matriz escrita es la que generan los criterios (no se edita a mano)', () => {
  const salida = execFileSync(process.execPath, [join(raiz, 'openwa', 'genera-matriz.mjs'), '--revisa'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(salida, '');
});

test('203/203 operaciones del contrato clasificadas, cada fila con su fuente; 201 de ellas son GET/POST/PUT/PATCH/DELETE', () => {
  const delContrato = [...operaciones.keys()].sort();
  const deLaMatriz = MATRIZ_OPENWA.map((f) => f.operacion).sort();
  assert.deepEqual(deLaMatriz, delContrato);
  assert.equal(new Set(deLaMatriz).size, deLaMatriz.length, 'sin filas duplicadas');
  for (const f of MATRIZ_OPENWA) {
    assert.ok(ESTADOS_OPENWA.includes(f.estado), f.operacion);
    assert.match(f.fuente, /^https:\/\/(developers\.facebook\.com|github\.com\/rmyndharis\/OpenWA)\//, `${f.operacion} sin fuente`);
    assert.ok(['documentado', 'sin_documentar'].includes(f.certeza) && f.nota.trim(), f.operacion);
    if (f.estado !== 'igual' && f.estado !== 'diferencia') assert.ok(f.alternativa?.trim(), `${f.operacion} contesta 501 sin alternativa`);
  }
  const cinco = MATRIZ_OPENWA.filter((f) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(f.metodo)).length;
  const cuenta = Object.fromEntries(ESTADOS_OPENWA.map((e) => [e, MATRIZ_OPENWA.filter((f) => f.estado === e).length]));
  const sinDoc = MATRIZ_OPENWA.filter((f) => f.certeza === 'sin_documentar').length;
  console.log(`matriz: ${MATRIZ_OPENWA.length}/${delContrato.length} clasificadas (${cinco} GET/POST/PUT/PATCH/DELETE + ${MATRIZ_OPENWA.length - cinco} OPTIONS/HEAD) · ${Object.entries(cuenta).map(([e, n]) => `${e} ${n}`).join(' · ')} · ${sinDoc} filas se sostienen en una ausencia (sin_documentar)`);
  assert.equal(MATRIZ_OPENWA.length, 203);
  assert.equal(cinco, 201);
});

test('la fachada sirve exactamente las filas igual y diferencia', () => {
  const servidas = MATRIZ_OPENWA.filter((f) => f.estado === 'igual' || f.estado === 'diferencia').map((f) => f.operacion).sort();
  assert.deepEqual(Object.keys(MANEJADORES).sort(), servidas);
});
