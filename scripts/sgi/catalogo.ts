/**
 * Gates del catálogo (PRP-013 fase 3):
 *   L2 cobertura — todas las cláusulas y controles cubiertos, IDs únicos, sin referencias fuera, sin huérfanos.
 *   L1 derechos  — contra la copia LICENCIADA de la norma, que vive FUERA del repo: SGI_NORMAS_LICENCIADAS apunta a un
 *                  archivo de texto (o a varios, separados por «:»). Sin ella: «no medido», nunca «pasa». El informe
 *                  dice dónde hay coincidencias, jamás el fragmento.
 * Uso: npm run sgi:catalogo
 */
import { readFileSync } from 'node:fs';
import { CATALOGO, verificaCobertura, verificaDerechos, mapeoCruzado } from '../../tools/sistema-integrado/dist/catalogo/index.js';

const v = verificaCobertura();
console.log(`Catálogo ${CATALOGO.version} · ${CATALOGO.estado} · ${CATALOGO.requisitos.length} requisitos`);
const familias: Record<string, number> = {};
for (const r of CATALOGO.requisitos) familias[r.familia] = (familias[r.familia] ?? 0) + 1;
console.log(`Por familia: común ${familias.C} · solo calidad ${familias.Q} · solo IA (cuerpo) ${familias.IA} · Anexo A ${familias.A}`);
console.log('\n| Edición | Números en la estructura | Cubiertos | Requisitos por cláusula principal |\n|---|---|---|---|');
for (const [ed, cuenta] of Object.entries(v.conteo)) {
  const nums = Object.keys(cuenta);
  const cubiertos = nums.filter((n) => (cuenta[n] ?? 0) > 0).length;
  const porPrincipal: Record<string, number> = {};
  for (const r of CATALOGO.requisitos) for (const x of r.refs) {
    if (`${x.edicion}${x.clausula.startsWith('A.') ? '#anexo-a' : ''}` !== ed) continue;
    const k = x.clausula.startsWith('A.') ? x.clausula.split('.').slice(0, 2).join('.') : x.clausula.split('.')[0]!;
    porPrincipal[k] = (porPrincipal[k] ?? 0) + 1;
  }
  console.log(`| ${ed} | ${nums.length} | ${cubiertos} | ${Object.entries(porPrincipal).map(([k, n]) => `${k}:${n}`).join(' ')} |`);
}
const supuestas = CATALOGO.requisitos.flatMap((r) => r.refs).filter((x) => x.supuesta).length;
console.log(`\nReferencias a 9001:2026 marcadas como SUPUESTAS (sin cotejar): ${supuestas}`);
console.log(`Mapeo cruzado 9001:2015+A1 ↔ 42001: ${mapeoCruzado().length} pares de cláusulas`);
console.log(`\nL2 cobertura: ${v.ok ? '✓ verde' : '✗ ROJO'} · sin cubrir ${v.sinCubrir.length} · IDs duplicados ${v.idsDuplicados.length} · mal formados ${v.idsMalFormados.length} · refs fuera ${v.refsFuera.length} · huérfanos ${v.huerfanosMapeo.length}`);

const rutas = (process.env.SGI_NORMAS_LICENCIADAS ?? '').split(':').filter(Boolean);
const referencia = rutas.length ? rutas.map((r) => readFileSync(r, 'utf8')).join('\n') : null;
const d = verificaDerechos(referencia, 8);
if (!d.medido) console.log('L1 derechos: NO MEDIDO — no hay copia licenciada (SGI_NORMAS_LICENCIADAS vacía). Revisión cualitativa: revisor dedicado (revision-catalogo.md).');
else console.log(`L1 derechos: ${d.ok ? '✓ verde' : '✗ ROJO'} · ${d.coincidencias.length} coincidencia(s) de ${d.n}+ palabras seguidas${d.coincidencias.length ? `: ${d.coincidencias.map((c) => `${c.id}/${c.campo}`).join(', ')}` : ''} (contra ${rutas.length} archivo(s); la copia útil es la versión en español)`);
process.exit(v.ok && d.ok !== false ? 0 : 1);
