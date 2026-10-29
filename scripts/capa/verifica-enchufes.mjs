#!/usr/bin/env node
/**
 * Los enchufes de la capa (`tools/capa`), cruzados con lo que existe y nadie mantiene a mano: las rutas con
 * pantalla de `src/app`, las features que cada página importa, el inventario y el código de las herramientas.
 *
 *   1. Toda página está DENTRO de la capa o FUERA con su motivo: una página nueva no se queda sin decidir.
 *   2. Toda ruta de dentro la declara UN enchufe, y ese enchufe es de una feature que la página importa.
 *   3. Cada enchufe pasa el esquema y las reglas de la capa (lo irreversible por el freno, el freno no se
 *      reclama, intenciones con el prefijo del módulo…), su activo existe y vive donde dice el inventario.
 *   4. Cada pantalla declarada existe; módulos e intenciones no se repiten.
 *   5. N/N: todo activo con pantalla (dueño de una ruta de dentro, o herramienta con entrada `./react`) tiene
 *      enchufe.
 *   6. El núcleo de ninguna herramienta importa la capa: sin ella, el módulo sigue funcionando.
 *
 * Después siembra cada defecto sobre una copia del contexto y exige que su comprobación caiga.
 *
 * Uso: node scripts/capa/verifica-enchufes.mjs [--sin-siembras] [--json]
 * Exit: 0 verde · 1 rojo · 2 falta el build de la capa (npm run prepara:gate).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;

/** Lo que está dentro de la capa: estos grupos de rutas se montan en la ventana. */
export const DENTRO = ['src/app/(main)/', 'src/app/mesa/', 'src/app/(productos)/'];
/** Lo que está fuera, con su motivo. Cambiarlo es una decisión: se dice aquí, no en silencio. */
export const FUERA = [
  { prefijo: 'src/app/(auth)/', motivo: 'antes de la sesión: entrar y registrarse son de la base, sin producto ni inquilino todavía' },
  { prefijo: 'src/app/(paciente)/', motivo: 'portal de pacientes de la clínica (terceros): montarlo en la capa cambia su C3 y su AISIA firmadas; es fase aparte' },
  { prefijo: 'src/app/vitrina/', motivo: 'vitrina pública de Soporte SAP, desplegada aparte: cambiarla es un despliegue, fuera de este goal' },
  { prefijo: 'src/app/page.tsx', motivo: 'la portada del template: no es de ningún módulo' },
];

const git = (args) => execFileSync('git', ['-C', RAIZ, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
const lee = (p) => readFileSync(join(RAIZ, p), 'utf8');

/** La ruta pública de una página: sin `src/app`, sin grupos `(x)` y sin `page.tsx`. */
export const rutaDe = (archivo) => `/${archivo.replace(/^src\/app\//, '').replace(/(^|\/)page\.tsx$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/')}`;

/** Lee el repo una vez. Las siembras alteran una copia de esto, nunca el disco. */
export function contexto() {
  const archivos = git(['ls-files', '-co', '--exclude-standard']).filter((a) => existsSync(join(RAIZ, a)));
  const paginas = archivos.filter((a) => a.startsWith('src/app/') && a.endsWith('/page.tsx') || a === 'src/app/page.tsx')
    .map((archivo) => ({ archivo, ruta: rutaDe(archivo), features: [...new Set([...lee(archivo).matchAll(/@\/features\/([a-z0-9-]+)/g)].map((m) => m[1]))] }));
  const enchufes = archivos.filter((a) => /(^|\/)enchufe\.json$/.test(a) && !a.startsWith('tools/capa/'))
    .map((archivo) => { try { return { archivo, json: JSON.parse(lee(archivo)) }; } catch (e) { return { archivo, json: null, error: e.message }; } });
  const herramientas = archivos.filter((a) => /^tools\/[^/]+\/package\.json$/.test(a)).map((a) => ({ dir: dirname(a), pkg: JSON.parse(lee(a)) }));
  const conReact = herramientas.filter((h) => h.pkg.exports?.['./react'] && h.dir !== 'tools/capa').map((h) => h.dir);
  const nucleos = archivos.filter((a) => /^tools\/[^/]+\/src\/.*\.(ts|tsx)$/.test(a) && !a.startsWith('tools/capa/'))
    .map((archivo) => ({ archivo, importaCapa: /from\s+['"](@tu-scope\/capa|[./]*\/capa\/(dist|src))/.test(lee(archivo)) }));
  const inventario = JSON.parse(lee('inventario/activos.json')).activos;
  const REGISTRO = 'src/shared/capa/enchufes.ts';
  const registro = existsSync(join(RAIZ, REGISTRO)) ? [...lee(REGISTRO).matchAll(/'([^']+\/enchufe\.json)'/g)].map((m) => m[1]).filter((a) => !a.startsWith('.')) : [];
  return { paginas, enchufes, conReact, nucleos, inventario, registro };
}

const lista = (x) => (Array.isArray(x) ? x : []);

/** Las comprobaciones. Cada una: [nombre, ok, pista]. `valida` es `validaEnchufe` de la capa. */
export function verifica(ctx, valida) {
  const c = [];
  const comprueba = (nombre, ok, pista) => c.push([nombre, Boolean(ok), ok ? '' : pista]);
  const fueraDe = (a) => FUERA.find((f) => a.startsWith(f.prefijo) || a === f.prefijo);
  const sinDecidir = ctx.paginas.filter((p) => !DENTRO.some((d) => p.archivo.startsWith(d)) && !fueraDe(p.archivo)).map((p) => p.archivo);
  comprueba('toda página está dentro de la capa o fuera con su motivo', sinDecidir.length === 0, `sin decidir: ${sinDecidir.join(', ')}`);
  const dentro = ctx.paginas.filter((p) => DENTRO.some((d) => p.archivo.startsWith(d)));
  const porActivo = new Map(ctx.inventario.map((a) => [a.id, a]));
  const resultados = ctx.enchufes.map((e) => ({ ...e, r: e.json ? valida(e.json) : { ok: false, problemas: [{ donde: e.archivo, que: e.error }] } }));
  const malos = resultados.filter((e) => !e.r.ok).flatMap((e) => e.r.problemas.map((p) => `${e.archivo}: ${p.donde} — ${p.que}`));
  comprueba('cada enchufe pasa el esquema y las reglas de la capa', malos.length === 0, malos.slice(0, 8).join(' | '));
  const validos = resultados.filter((e) => e.r.ok).map((e) => ({ archivo: e.archivo, e: e.r.enchufe }));
  /** Vive junto al módulo: en la ubicación del activo o en una carpeta que el activo cubre (`src/features/buzon-cfdi`). */
  const dondePuede = (a) => [a.ubicacion, ...lista(a.cubre)].filter((d) => !/[*.]/.test(d.split('/').pop())).map((d) => `${d}/enchufe.json`);
  const malUbicados = validos.filter(({ archivo, e }) => !porActivo.has(e.activo) || !dondePuede(porActivo.get(e.activo)).includes(archivo)).map(({ archivo, e }) => `${archivo} (${e.activo})`);
  comprueba('cada enchufe es de un activo del inventario y vive en su ubicación', malUbicados.length === 0, `no cuadran: ${malUbicados.join(', ')}`);
  const modulos = validos.map(({ e }) => e.modulo);
  const intenciones = validos.flatMap(({ e }) => e.intenciones.map((i) => i.id));
  const repetidos = [...modulos, ...intenciones].filter((x, k, xs) => xs.indexOf(x) !== k);
  comprueba('ningún módulo ni intención se repite entre enchufes', repetidos.length === 0, `repetidos: ${[...new Set(repetidos)].join(', ')}`);
  const declarantes = (ruta) => validos.filter(({ e }) => e.pantallas.includes(ruta));
  const huerfanas = dentro.filter((p) => declarantes(p.ruta).length !== 1).map((p) => `${p.ruta} (${declarantes(p.ruta).length} enchufes)`);
  comprueba('toda ruta de dentro la declara exactamente un enchufe', huerfanas.length === 0, huerfanas.join(', '));
  const cubre = (activo, feature) => lista(porActivo.get(activo)?.cubre).includes(`src/features/${feature}`);
  const ajenas = dentro.filter((p) => p.features.length && declarantes(p.ruta).length === 1 && !p.features.some((f) => cubre(declarantes(p.ruta)[0].e.activo, f)))
    .map((p) => `${p.ruta} → ${declarantes(p.ruta)[0].e.activo} (la página importa ${p.features.join(', ')})`);
  comprueba('quien declara una ruta es dueño de una feature que la página importa', ajenas.length === 0, ajenas.join(', '));
  const rutas = new Set(dentro.map((p) => p.ruta));
  const inexistentes = validos.flatMap(({ e }) => e.pantallas.filter((r) => !rutas.has(r)).map((r) => `${e.modulo}: ${r}`));
  comprueba('cada pantalla declarada existe dentro de la capa', inexistentes.length === 0, inexistentes.join(', '));
  const conEnchufe = new Set(validos.map(({ e }) => e.activo));
  /** El dueño de una ruta: quien la declara; si nadie, la feature importada cuyo nombre está en la ruta (la
   *  sesión de `auth` no hace dueño a nadie), y si no, la única que importa. Entre varias, la MÁS específica: en
   *  `/agora/agentes`, `agora-agentes` (dos segmentos) y no `agora` (uno), o quitarle el enchufe pasaría sin verse. */
  const duenoDe = (p) => {
    const d = declarantes(p.ruta);
    if (d.length === 1) return d[0].e.activo;
    const segmentos = p.ruta.split('/').filter(Boolean);
    const casa = (f) => segmentos.some((s) => s === f || f.startsWith(s) || s.startsWith(f));
    const especificidad = (f) => segmentos.filter((s) => f === s || f.split('-').includes(s)).length;
    const candidatas = p.features.filter(casa).sort((a, b) => especificidad(b) - especificidad(a) || a.length - b.length);
    const feature = candidatas[0] ?? (p.features.length === 1 ? p.features[0] : null);
    return feature ? ctx.inventario.find((a) => lista(a.cubre).includes(`src/features/${feature}`))?.id ?? `src/features/${feature} (sin asiento)` : `${p.ruta} (sin dueño)`;
  };
  const duenos = new Set(dentro.map(duenoDe));
  for (const dir of ctx.conReact) { const a = ctx.inventario.find((x) => x.ubicacion === dir); if (a) duenos.add(a.id); }
  const sinEnchufe = [...duenos].filter((id) => !conEnchufe.has(id));
  comprueba(`todo activo con pantalla tiene enchufe (${duenos.size - sinEnchufe.length}/${duenos.size})`, sinEnchufe.length === 0, `sin enchufe: ${sinEnchufe.join(', ')}`);
  const enDisco = ctx.enchufes.map((e) => e.archivo).sort();
  const registrados = [...new Set(ctx.registro)].sort();
  const sinRegistrar = enDisco.filter((a) => !registrados.includes(a));
  const fantasmas = registrados.filter((a) => !enDisco.includes(a));
  comprueba('la app registra todos los enchufes (src/shared/capa/enchufes.ts, generado)', sinRegistrar.length === 0 && fantasmas.length === 0,
    `${sinRegistrar.length ? `sin registrar: ${sinRegistrar.join(', ')}` : ''}${fantasmas.length ? ` registrados sin archivo: ${fantasmas.join(', ')}` : ''} — node scripts/capa/registra-enchufes.mjs`);
  const dependientes = ctx.nucleos.filter((n) => n.importaCapa).map((n) => n.archivo);
  comprueba('el núcleo de ninguna herramienta importa la capa', dependientes.length === 0, `importan la capa: ${dependientes.join(', ')}`);
  return { comprobaciones: c, n: duenos.size - sinEnchufe.length, total: duenos.size };
}

/** Las siembras: cada defecto sobre una copia del contexto, con la comprobación que debe caer. */
export const SIEMBRAS = [
  ['un activo con pantalla sin enchufe', (x) => { x.enchufes.shift(); }, /^todo activo con pantalla tiene enchufe/],
  ['una acción irreversible que no pasa por el freno', (x) => { const e = x.enchufes.find((y) => y.json?.freno?.length); e.json.freno = []; }, /esquema y las reglas/],
  ['un módulo que reclama la ranura del freno', (x) => { x.enchufes[0].json.ranuras.push('freno'); }, /esquema y las reglas/],
  ['una ruta del módulo sin declarar', (x) => { const e = x.enchufes.find((y) => y.json?.pantallas?.length); e.json.pantallas.pop(); e.json.intenciones = e.json.intenciones.map((i) => ({ ...i, pantalla: undefined })); }, /exactamente un enchufe/],
  ['una pantalla que no existe', (x) => { const e = x.enchufes.find((y) => y.json?.pantallas?.length); e.json.pantallas.push('/no-existe'); }, /pantalla declarada existe/],
  ['el núcleo de una herramienta que importa la capa', (x) => { x.nucleos.push({ archivo: 'tools/calendario/src/sabotaje.ts', importaCapa: true }); }, /núcleo de ninguna herramienta/],
  ['dos enchufes con el mismo módulo', (x) => { x.enchufes.push(structuredClone(x.enchufes[0])); }, /se repite entre enchufes/],
  ['una página nueva sin decidir', (x) => { x.paginas.push({ archivo: 'src/app/nueva/page.tsx', ruta: '/nueva', features: [] }); }, /dentro de la capa o fuera/],
  ['un enchufe con un activo que no es el suyo', (x) => { x.enchufes[0].json.activo = 'TPL-reel'; }, /vive en su ubicación/],
  ['un enchufe que la app no registra', (x) => { x.registro.pop(); }, /la app registra todos los enchufes/],
];

export function siembra(ctx, valida) {
  let malas = 0;
  console.log('\nSiembras (cada defecto debe tumbar su comprobación):');
  for (const [que, rompe, caza] of SIEMBRAS) {
    const x = structuredClone(ctx);
    rompe(x);
    const c = verifica(x, valida).comprobaciones.find(([n]) => caza.test(n));
    const cae = c !== undefined && c[1] === false;
    if (!cae) malas++;
    console.log(`  ${cae ? verde('✓ cae') : rojo('✗ NO cae')}  ${que}`);
  }
  console.log(malas ? rojo(`${malas} siembra(s) no cayeron: el gate no muerde`) : verde(`${SIEMBRAS.length}/${SIEMBRAS.length} siembras cazadas`));
  return malas;
}

async function corre() {
  const dist = join(RAIZ, 'tools/capa/dist/index.js');
  if (!existsSync(dist)) { console.error(rojo('✗ falta el build de la capa: npm run prepara:gate')); process.exit(2); }
  const { validaEnchufe } = await import(pathToFileURL(dist).href);
  const ctx = contexto();
  const { comprobaciones, n, total } = verifica(ctx, validaEnchufe);
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ n, total, comprobaciones })); process.exit(comprobaciones.every(([, ok]) => ok) ? 0 : 1); }
  console.log(`Enchufes de la capa: ${ctx.enchufes.length} enchufe(s), ${ctx.paginas.length} página(s), fuera: ${FUERA.length} grupo(s) con motivo`);
  for (const [nombre, ok, pista] of comprobaciones) console.log(`  ${ok ? verde('✓') : rojo('✗')} ${nombre}${ok ? '' : ` — ${pista}`}`);
  for (const f of FUERA) console.log(ambar(`  · fuera: ${f.prefijo} — ${f.motivo}`));
  const rojas = comprobaciones.filter(([, ok]) => !ok).length;
  const malas = process.argv.includes('--sin-siembras') ? 0 : siembra(ctx, validaEnchufe);
  console.log(rojas || malas ? rojo(`\nEnchufes EN ROJO: ${rojas} comprobación(es) y ${malas} siembra(s). ${n}/${total} activos con pantalla.`) : verde(`\nEnchufes en verde: ${n}/${total} activos con pantalla.`));
  process.exit(rojas || malas ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) corre();
