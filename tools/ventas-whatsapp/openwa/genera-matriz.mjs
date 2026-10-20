#!/usr/bin/env node
/**
 * Genera la MATRIZ de compatibilidad de la puerta de salida de OpenWA: las operaciones salen del `openapi.json` pineado
 * (nunca a mano) y su estado de los criterios (`src/openwa/criterios.ts`, ya compilados en `dist/`). Falla si el
 * contrato no es el pineado, si una operación no cae en ninguna regla o cae en dos, o si una regla no clasifica nada.
 *
 *   node openwa/genera-matriz.mjs          escribe src/openwa/matriz.ts y openwa/MATRIZ.md
 *   node openwa/genera-matriz.mjs --revisa  no escribe: sale con 1 si lo escrito no es lo que genera
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRATO = join(RAIZ, 'openwa', 'openapi-0.25.0.json');
const SHA256 = 'sha256:fdb4bd3c7bb26b5ffd5d415d94c9eebdb6630de196c14c2d561a05b76a91789d';
const METODOS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

const { REGLAS_OPENWA, ESTADOS_OPENWA } = await import(join(RAIZ, 'dist', 'openwa', 'criterios.js'));

function operaciones() {
  const bytes = readFileSync(CONTRATO);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (`sha256:${hash}` !== SHA256) throw new Error(`el contrato no es el pineado: sha256:${hash}`);
  const api = JSON.parse(bytes.toString('utf8'));
  return Object.entries(api.paths).flatMap(([ruta, ops]) => METODOS.filter((m) => ops[m]).map((m) => ({
    operacion: ops[m].operationId, metodo: m.toUpperCase(), ruta, etiqueta: (ops[m].tags ?? [''])[0],
  })));
}

function clasifica(ops) {
  const usadas = new Map(REGLAS_OPENWA.map((r) => [r.id, 0]));
  const explicitas = new Map();
  for (const r of REGLAS_OPENWA) for (const id of r.operaciones ?? []) {
    if (explicitas.has(id)) throw new Error(`${id} está en dos reglas: ${explicitas.get(id).id} y ${r.id}`);
    explicitas.set(id, r);
  }
  const conocidas = new Set(ops.map((o) => o.operacion));
  for (const id of explicitas.keys()) if (!conocidas.has(id)) throw new Error(`la regla ${explicitas.get(id).id} nombra ${id}, que no está en el contrato`);
  const filas = ops.map((o) => {
    const r = explicitas.get(o.operacion) ?? REGLAS_OPENWA.find((x) => !x.operaciones && x.etiqueta === o.etiqueta);
    if (!r) throw new Error(`${o.operacion} (${o.metodo} ${o.ruta}) no cae en ninguna regla`);
    if (!ESTADOS_OPENWA.includes(r.estado)) throw new Error(`estado desconocido en ${r.id}`);
    usadas.set(r.id, usadas.get(r.id) + 1);
    return { ...o, estado: r.estado, regla: r.id, fuente: r.fuente, certeza: r.certeza, nota: r.nota, ...(r.alternativa ? { alternativa: r.alternativa } : {}) };
  });
  const sinUso = [...usadas].filter(([, n]) => n === 0).map(([id]) => id);
  if (sinUso.length) throw new Error(`reglas que no clasifican nada: ${sinUso.join(', ')}`);
  return filas.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta) || a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo));
}

const cuenta = (filas) => Object.fromEntries(ESTADOS_OPENWA.map((e) => [e, filas.filter((f) => f.estado === e).length]));

function modulo(filas) {
  return `/**\n * GENERADO por \`openwa/genera-matriz.mjs\` desde el openapi.json de OpenWA 0.25.0 (${SHA256}) y\n * \`criterios.ts\`. No se edita a mano: una prueba regenera y compara.\n */\nimport type { Certeza, EstadoOpenWA } from './criterios.js';\n\nexport interface FilaMatriz { operacion: string; metodo: string; ruta: string; etiqueta: string; estado: EstadoOpenWA; regla: string; fuente: string; certeza: Certeza; nota: string; alternativa?: string }\n\nexport const CONTRATO_OPENWA = { version: '0.25.0', sha256: '${SHA256}', operaciones: ${filas.length} } as const;\n\nexport const MATRIZ_OPENWA: readonly FilaMatriz[] = ${JSON.stringify(filas, null, 1)};\n`;
}

const celda = (s) => String(s ?? '').replaceAll('|', '\\|');

function markdown(filas) {
  const c = cuenta(filas);
  const resumen = Object.entries(c).map(([e, n]) => `${e} ${n}`).join(' · ');
  const tabla = filas.map((f) => `| \`${f.metodo} ${f.ruta}\` | ${f.estado} | ${celda(f.nota)}${f.alternativa ? ` **Alternativa:** ${celda(f.alternativa)}` : ''} | [fuente](${f.fuente}) (${f.certeza === 'documentado' ? 'documentado' : 'sin documentar'}) |`);
  return [
    '# Matriz de compatibilidad OpenWA 0.25.0 → BSP oficial', '',
    `> Generada por \`openwa/genera-matriz.mjs\` desde el contrato pineado (\`${SHA256}\`) y \`src/openwa/criterios.ts\`. No se edita a mano.`,
    `> **${filas.length} operaciones:** ${resumen}.`, '',
    '| Operación | Estado | Qué pasa por la vía oficial | Fuente |', '|---|---|---|---|', ...tabla, '',
  ].join('\n');
}

const filas = clasifica(operaciones());
const salidas = [[join(RAIZ, 'src', 'openwa', 'matriz.ts'), modulo(filas)], [join(RAIZ, 'openwa', 'MATRIZ.md'), markdown(filas)]];
if (process.argv.includes('--revisa')) {
  const distintas = salidas.filter(([ruta, texto]) => { try { return readFileSync(ruta, 'utf8') !== texto; } catch { return true; } });
  for (const [ruta] of distintas) console.error(`✗ ${ruta} no es lo que genera la matriz`);
  process.exit(distintas.length ? 1 : 0);
}
for (const [ruta, texto] of salidas) writeFileSync(ruta, texto);
console.log(`matriz: ${filas.length} operaciones · ${Object.entries(cuenta(filas)).map(([e, n]) => `${e} ${n}`).join(' · ')}`);
