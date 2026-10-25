/**
 * El STAGING de dbt se GENERA del contrato de eventos (Zod): un modelo por tipo, con cada campo tipado, y la
 * prueba de convergencia «filas de staging = eventos del libro, por tipo» para TODOS los tipos. Así un tipo nuevo
 * del contrato no puede quedarse sin staging (el merge que tira una fuente en silencio). No se edita a mano.
 *
 *   node tools/clinica-dental/semantica/genera.ts [--comprueba]
 *
 * `--comprueba` no escribe: exit 1 si un archivo generado diverge, falta, o sobra un `stg_*.sql` de un tipo que
 * el contrato ya no tiene. Lo corre `verifica:generados` del template.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esquemaEvento, TIPOS_EVENTO, VERSION_CONTRATO } from '../dist/index.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = new Set(['v', 'id', 'en', 'clinica', 'tipo', 'sujeto']);
const CABECERA = `-- ALTO: ARTEFACTO AUTOGENERADO desde el contrato de eventos v${VERSION_CONTRATO} por semantica/genera.ts. No lo edites a mano.`;

interface Def { type: string; innerType?: { def: Def }; values?: unknown[]; entries?: Record<string, string>; checks?: { _zod?: { def?: { format?: string } } }[] }
const defDe = (z: unknown): Def => (z as { def: Def }).def;

function tipoSql(z: unknown): { sql: string; nulo: boolean; enumeracion: string[] | null } {
  let d = defDe(z);
  let nulo = false;
  while (d.type === 'nullable' || d.type === 'optional') {
    nulo = true;
    d = d.innerType!.def;
  }
  if (d.type === 'number') return { sql: 'numeric', nulo, enumeracion: null };
  if (d.type === 'boolean') return { sql: 'boolean', nulo, enumeracion: null };
  if (d.type === 'array') return { sql: 'jsonb', nulo, enumeracion: null };
  if (d.type === 'literal') return { sql: (d.values?.[0] === true ? 'boolean' : 'text'), nulo, enumeracion: null };
  if (d.type === 'enum') return { sql: 'text', nulo, enumeracion: Object.values(d.entries ?? {}) };
  if ((d.checks ?? []).some((c) => c._zod?.def?.format === 'datetime')) return { sql: 'timestamptz', nulo, enumeracion: null };
  return { sql: 'text', nulo, enumeracion: null };
}

const columna = (k: string, sql: string) => (sql === 'jsonb' ? `  (datos::jsonb -> '${k}') as ${k}` : `  (datos::jsonb ->> '${k}')::${sql} as ${k}`);

const modelos: { nombre: string; tipo: string; columnas: { k: string; sql: string; nulo: boolean; enumeracion: string[] | null }[] }[] = [];
for (const opcion of esquemaEvento.options) {
  const forma = opcion.shape as Record<string, unknown>;
  const tipo = String((forma['tipo'] as { value: string }).value);
  const columnas = Object.entries(forma).filter(([k]) => !BASE.has(k)).map(([k, z]) => ({ k, ...tipoSql(z) }));
  modelos.push({ nombre: `stg_${tipo}`, tipo, columnas });
}

const dirStg = join(AQUI, 'modelos', 'staging');
/** Ruta → contenido de todo lo que se genera: se escribe, o con `--comprueba` se compara. */
const archivos = new Map<string, string>();
for (const m of modelos) {
  const cols = m.columnas.map((c) => columna(c.k, c.sql));
  archivos.set(join(dirStg, `${m.nombre}.sql`), `${CABECERA}\nselect\n  clinica,\n  seq,\n  evento_id,\n  en::timestamptz as en,\n  sujeto${cols.length ? `,\n${cols.join(',\n')}` : ''}\nfrom {{ ref('raw_eventos') }}\nwhere tipo = '${m.tipo}'\n`);
}

const yml = [
  `# ${CABECERA.slice(3)}`,
  'version: 2',
  'models:',
  ...modelos.flatMap((m) => [
    `  - name: ${m.nombre}`,
    `    description: Eventos «${m.tipo}» del libro, tipados.`,
    '    columns:',
    '      - name: evento_id',
    '        data_tests: [unique, not_null]',
    '      - name: sujeto',
    '        data_tests: [not_null]',
    ...m.columnas.filter((c) => !c.nulo || c.enumeracion).flatMap((c) => [
      `      - name: ${c.k}`,
      `        data_tests: [${[!c.nulo ? 'not_null' : '', c.enumeracion ? `{accepted_values: {arguments: {values: [${c.enumeracion.map((v) => `'${v}'`).join(', ')}]}}}` : ''].filter(Boolean).join(', ')}]`,
    ]),
  ]),
];
archivos.set(join(dirStg, '_staging.yml'), `${yml.join('\n')}\n`);

const union = modelos.map((m) => `select '${m.tipo}' as tipo, count(*) as filas from {{ ref('${m.nombre}') }}`).join('\nunion all\n');
archivos.set(join(AQUI, 'pruebas', 'libro_igual_staging.sql'), `${CABECERA}
-- Convergencia: por cada tipo del contrato, las filas de su staging = los eventos que el libro tiene de ese tipo
-- (contados DIRECTO sobre el libro por corre.mjs, en la semilla conteo_libro). Cualquier fila aquí es una pérdida.
with staging as (
${union}
)
select coalesce(s.tipo, c.tipo) as tipo, s.filas as en_staging, c.eventos as en_libro
from staging s full outer join {{ ref('conteo_libro') }} c on c.tipo = s.tipo
where coalesce(s.filas, 0) <> coalesce(c.eventos, 0)
`);
if (process.argv.includes('--comprueba')) {
  const difieren = [...archivos].filter(([ruta, texto]) => !existsSync(ruta) || readFileSync(ruta, 'utf8') !== texto).map(([ruta]) => ruta);
  const sobran = readdirSync(dirStg).filter((n) => /^stg_.*\.sql$/.test(n) && !archivos.has(join(dirStg, n)));
  const mal = [...difieren, ...sobran.map((n) => `${join(dirStg, n)} (ningún tipo del contrato lo genera)`)];
  console.log(mal.length ? `✗ staging divergente: ${mal.map((r) => r.replace(`${AQUI}/`, '')).join(', ')}` : `✓ staging al día con el contrato v${VERSION_CONTRATO}`);
  process.exit(mal.length ? 1 : 0);
}
mkdirSync(dirStg, { recursive: true });
for (const [ruta, texto] of archivos) writeFileSync(ruta, texto);
console.log(`staging generado: ${modelos.length} modelos (contrato v${VERSION_CONTRATO}, ${TIPOS_EVENTO.length} tipos) y la prueba de convergencia`);
