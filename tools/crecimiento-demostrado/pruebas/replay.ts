/** Replay entre PROCESOS: mismo snapshot + misma spec ⇒ los mismos hechos y los mismos certificados, byte a byte. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guion = fileURLToPath(new URL('../e2e/huellas.mjs', import.meta.url));
const corre = () => {
  const r = spawnSync(process.execPath, [guion], { encoding: 'utf8', timeout: 240_000 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

test('dos procesos independientes producen las mismas huellas de Γ, spec, planes, hechos y certificados', () => {
  const [a, b] = [corre(), corre()];
  assert.equal(a, b);
  const h = JSON.parse(a) as { respuestas: { estado: string; certificado: string | null }[] };
  assert.ok(h.respuestas.length >= 6);
  for (const r of h.respuestas) if (r.estado === 'demostrada') assert.match(r.certificado ?? '', /^cert:/);
});
