/**
 * Genera la migración ESPEJO del catálogo (`sgi_requisito`): los IDs, su familia, fase, si piden información
 * documentada y sus ediciones. La fuente única es `tools/sistema-integrado` (catalogo/datos.ts); este SQL se deriva.
 *   node scripts/sgi/catalogo-sql.ts             → escribe la migración
 *   node scripts/sgi/catalogo-sql.ts --verifica  → exit 1 si la migración no coincide con el catálogo (deriva)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CATALOGO } from '../../tools/sistema-integrado/dist/catalogo/index.js';

export const RUTA = 'supabase/migrations/20260930100200_sgi_catalogo.sql';
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

export function sqlDelCatalogo(): string {
  const filas = CATALOGO.requisitos.map((r) => {
    const ediciones = [...new Set(r.refs.map((x) => x.edicion))].sort();
    return `  (${q(r.id)}, ${q(r.familia)}, ${r.fase}, ${r.doc !== null}, array[${ediciones.map(q).join(', ')}]::text[], ${q(r.tema)})`;
  });
  return [
    `-- GENERADO por scripts/sgi/catalogo-sql.ts desde tools/sistema-integrado (catálogo ${CATALOGO.version}, ${CATALOGO.requisitos.length} requisitos).`,
    '-- No se edita a mano: `node scripts/sgi/catalogo-sql.ts --verifica` detecta la deriva. Solo IDs y rótulos propios: ningún texto de norma.',
    'insert into public.sgi_requisito (id, familia, fase, obligatorio, ediciones, tema) values',
    filas.join(',\n'),
    'on conflict (id) do update set familia = excluded.familia, fase = excluded.fase, obligatorio = excluded.obligatorio,',
    '  ediciones = excluded.ediciones, tema = excluded.tema;',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = sqlDelCatalogo();
  if (process.argv.includes('--verifica')) {
    const ok = existsSync(RUTA) && readFileSync(RUTA, 'utf8') === sql;
    console.log(ok ? `✓ ${RUTA} coincide con el catálogo (${CATALOGO.requisitos.length} requisitos)` : `✗ ${RUTA} no coincide con el catálogo: node scripts/sgi/catalogo-sql.ts`);
    process.exit(ok ? 0 : 1);
  }
  writeFileSync(RUTA, sql);
  console.log(`escrito ${RUTA}: ${CATALOGO.requisitos.length} requisitos`);
}
