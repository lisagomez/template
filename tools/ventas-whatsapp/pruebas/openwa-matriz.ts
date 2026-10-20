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

/** Una fila clasificada como pide el criterio: estado, nota, certeza y fuente; si contesta 501, su alternativa. */
function revisaFila(f: (typeof MATRIZ_OPENWA)[number]): string | null {
  if (!ESTADOS_OPENWA.includes(f.estado)) return `${f.operacion}: estado ${f.estado}`;
  if (!/^https:\/\/(developers\.facebook\.com|github\.com\/rmyndharis\/OpenWA)\//.test(f.fuente)) return `${f.operacion}: sin fuente`;
  if (!['documentado', 'sin_documentar'].includes(f.certeza) || !f.nota.trim()) return `${f.operacion}: sin nota o certeza`;
  if (f.estado !== 'igual' && f.estado !== 'diferencia' && !f.alternativa?.trim()) return `${f.operacion}: 501 sin alternativa`;
  return null;
}

/**
 * EL CRITERIO TAL COMO SE FIJÓ (goal y spec, 2026-10-20): «201/201 operaciones del contrato pineado». Las 201 se
 * contaron entonces como los `operationId` de GET/POST/PUT/PATCH/DELETE del openapi; ese conjunto se saca aquí DEL
 * CONTRATO (no de la matriz) y se mide entero. No se cambia la cifra ni el conjunto.
 */
test('criterio fijado: 201/201 operaciones GET/POST/PUT/PATCH/DELETE del contrato pineado clasificadas, cada una con su fuente', () => {
  const fijadas = [...operaciones.values()].filter((o) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(o.metodo)).map((o) => o.operationId).sort();
  assert.equal(fijadas.length, 201, 'el conjunto fijado del contrato son 201 operaciones');
  const fila = new Map(MATRIZ_OPENWA.map((f) => [f.operacion, f]));
  const faltan = fijadas.filter((op) => !fila.has(op));
  const mal = fijadas.flatMap((op) => (fila.has(op) ? [revisaFila(fila.get(op)!)] : [])).filter(Boolean);
  const bien = fijadas.length - faltan.length - mal.length;
  const enLas201 = fijadas.map((op) => fila.get(op)!).filter(Boolean);
  const cuenta = ESTADOS_OPENWA.map((e) => `${e} ${enLas201.filter((f) => f.estado === e).length}`).join(' · ');
  console.log(`matriz (criterio fijado): ${bien}/${fijadas.length} operaciones GET/POST/PUT/PATCH/DELETE del contrato pineado clasificadas, cada una con su fuente · ${cuenta}`);
  assert.deepEqual(faltan, [], `sin fila: ${faltan.join(', ')}`);
  assert.deepEqual(mal, []);
  assert.equal(bien, 201);
});

/** Hallazgo APARTE, no un criterio nuevo: el contrato declara además OPTIONS y HEAD del ingress de plugins. */
test('hallazgo aparte: las 2 operaciones OPTIONS/HEAD del contrato también tienen fila (fuera, 501 + alternativa); la matriz no inventa ni omite', () => {
  const delContrato = [...operaciones.keys()].sort();
  const deLaMatriz = MATRIZ_OPENWA.map((f) => f.operacion).sort();
  assert.deepEqual(deLaMatriz, delContrato, 'la matriz no tiene filas que el contrato no declare ni omite ninguna');
  assert.equal(new Set(deLaMatriz).size, deLaMatriz.length, 'sin filas duplicadas');
  const extra = MATRIZ_OPENWA.filter((f) => !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(f.metodo));
  assert.deepEqual(extra.map((f) => `${f.metodo} ${f.estado}`).sort(), ['HEAD fuera', 'OPTIONS fuera']);
  assert.deepEqual(extra.map(revisaFila).filter(Boolean), []);
  const sinDoc = MATRIZ_OPENWA.filter((f) => f.certeza === 'sin_documentar').length;
  console.log(`matriz (hallazgo aparte): el contrato declara además ${extra.length} operaciones ${extra.map((f) => f.metodo).join('/')} del ingress de plugins, clasificadas «fuera» con 501 + alternativa; ${sinDoc} filas en total se sostienen en una ausencia (sin_documentar)`);
});

test('la fachada sirve exactamente las filas igual y diferencia', () => {
  const servidas = MATRIZ_OPENWA.filter((f) => f.estado === 'igual' || f.estado === 'diferencia').map((f) => f.operacion).sort();
  assert.deepEqual(Object.keys(MANEJADORES).sort(), servidas);
});
