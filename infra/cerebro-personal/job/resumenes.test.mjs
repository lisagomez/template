/**
 * El resumen de producto en el VPS, sin Docker: lo válido llega a la agenda del cerebro como una tarea de números y
 * enlaces; un texto libre, una clave inventada, un enlace con consulta o un producto no permitido se rechazan enteros y
 * la agenda queda igual. Usa la capa del repo (`tools/capa/dist`): corre `npm run prueba:tools -- capa` antes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CALENDARIO, procesaResumenes } from './resumenes.mjs';

const permitidos = new Map([['recepcion-demo', { conteos: ['citas-hoy', 'citas-manana'], enlaces: ['agenda'] }]]);
const bueno = { resumen: 1, producto: 'recepcion-demo', generado: '2026-10-25T18:00:00Z', conteos: { 'citas-hoy': 3, 'citas-manana': 1 }, enlaces: { agenda: '/recepcion-demo' } };

function banco() {
  const dir = mkdtempSync(join(tmpdir(), 'resumenes-'));
  const entrada = join(dir, 'entrada'), arbrain = join(dir, 'Arbrain');
  mkdirSync(entrada, { recursive: true });
  mkdirSync(join(arbrain, '.claude/plan'), { recursive: true });
  writeFileSync(join(arbrain, CALENDARIO), `${JSON.stringify({ version: 1, eventos: [], tareas: [], recibos: {} }, null, 2)}\n`);
  const huella = () => createHash('sha256').update(readFileSync(join(arbrain, CALENDARIO))).digest('hex');
  return { dir, entrada, arbrain, huella, deja: (n, x) => writeFileSync(join(entrada, n), typeof x === 'string' ? x : JSON.stringify(x)) };
}

test('un resumen válido llega a la agenda como tarea de números y enlaces, con id estable', async () => {
  const b = banco();
  try {
    b.deja('recepcion.json', bueno);
    const r = await procesaResumenes({ entrada: b.entrada, arbrain: b.arbrain, permitidos });
    assert.deepEqual(r.aceptados.map((a) => a.id), ['resumen-recepcion-demo-2026-10-25']);
    const tarea = JSON.parse(readFileSync(join(b.arbrain, CALENDARIO), 'utf8')).tareas[0];
    assert.equal(tarea.titulo, 'recepcion-demo: 3 citas hoy, 1 citas manana · /recepcion-demo');
    assert.deepEqual(tarea.etiquetas, ['resumen-de-producto']);
    assert.deepEqual(readdirSync(join(b.entrada, 'procesados')), ['recepcion.json']);
    b.deja('otra-vez.json', { ...bueno, conteos: { 'citas-hoy': 4, 'citas-manana': 1 } });
    await procesaResumenes({ entrada: b.entrada, arbrain: b.arbrain, permitidos });
    const tareas = JSON.parse(readFileSync(join(b.arbrain, CALENDARIO), 'utf8')).tareas;
    assert.equal(tareas.length, 1, 'el mismo día se actualiza, no se duplica');
    assert.match(tareas[0].titulo, /4 citas hoy/);
  } finally { rmSync(b.dir, { recursive: true, force: true }); }
});

test('texto libre, clave inventada, consulta en el enlace, producto no permitido o JSON roto: se rechaza entero y la agenda no cambia', async () => {
  const b = banco();
  try {
    const malos = {
      'texto-libre.json': { ...bueno, nota: 'la clienta Ana López llegó molesta' },
      'clave-inventada.json': { ...bueno, conteos: { 'caso-de-ana-lopez': 1 } },
      'consulta.json': { ...bueno, enlaces: { agenda: '/recepcion-demo?nota=Ana%20Lopez' } },
      'texto-en-conteo.json': { ...bueno, conteos: { 'citas-hoy': 'tres' } },
      'ajeno.json': { ...bueno, producto: 'otro-producto' },
      'roto.json': '{ no es json',
    };
    for (const [n, x] of Object.entries(malos)) b.deja(n, x);
    const antes = b.huella();
    const r = await procesaResumenes({ entrada: b.entrada, arbrain: b.arbrain, permitidos });
    assert.equal(r.aceptados.length, 0);
    assert.deepEqual(r.rechazados.map((x) => x.archivo).sort(), Object.keys(malos).sort());
    assert.equal(b.huella(), antes, 'el calendario del cerebro, byte a byte igual');
    assert.ok(readdirSync(join(b.entrada, 'rechazados')).includes('texto-libre.json.motivo.json'));
  } finally { rmSync(b.dir, { recursive: true, force: true }); }
});
