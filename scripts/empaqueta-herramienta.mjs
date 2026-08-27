#!/usr/bin/env node
/**
 * Empaqueta una herramienta de `tools/<nombre>/` y **mide** que se pueda integrar en otro
 * proyecto. No afirma compatibilidad: la comprueba instalando el paquete de verdad.
 *
 * Por que existe: este template servia para "una app que se despliega". El otro caso real
 * es "una herramienta que construyo una vez y reuso en los proyectos que venga". Y ahi el
 * fallo tipico no es el codigo — es el **contrato del paquete**: un `exports` mal puesto,
 * los tipos que no viajan, una dependencia que deberia ser `peer`, o la directiva
 * `'use client'` que se pierde en el build. Todo eso compila en verde y revienta **en el
 * proyecto de destino**, que es el peor sitio para descubrirlo.
 *
 * Pasos:
 *   1. Contrato del `package.json` (campos que deciden si el paquete es consumible).
 *   2. Build con `tsc` — el que declare el propio paquete.
 *   3. `npm pack` en un tarball.
 *   4. **Prueba de integracion real**: proyecto temporal, `npm install <tarball>`, importar
 *      el paquete y ejecutar su API. Si esto pasa, es compatible de verdad.
 *   5. **Encaje con un destino real** (`--en <ruta>`): el proyecto limpio del paso 4 no tiene
 *      React ni Next, asi que no puede decir si el paquete encaja con las versiones que TU
 *      proyecto ya tiene. Con `--en` se instala el tarball en ese proyecto (sin tocar su
 *      package.json ni su lockfile), npm dictamina los peers contra el arbol real, se importa
 *      desde ahi, y se retira. El destino queda como estaba.
 *
 * Uso:  node scripts/empaqueta-herramienta.mjs <nombre> [--sin-integracion] [--en <ruta-proyecto>]
 * Exit: 0 empaquetada y probada · 1 el contrato o la prueba fallan · 2 no pude empaquetar.
 */
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const argv = process.argv.slice(2);
// `--en <ruta>` o `--en=<ruta>`: el valor no es el nombre de la herramienta.
const idxEn = argv.findIndex((a) => a === '--en' || a.startsWith('--en='));
const valorEn = idxEn === -1 ? null : argv[idxEn].startsWith('--en=') ? argv[idxEn].slice(5) : argv[idxEn + 1];
// `--en` sin valor NO puede caer en el cwd: resolve('') es este mismo repo, y se instalaria aqui.
const DESTINO = valorEn && !valorEn.startsWith('--') ? resolve(valorEn) : null;
const nombre = argv.find((a, i) => !a.startsWith('--') && !(idxEn !== -1 && argv[idxEn] === '--en' && i === idxEn + 1));
const SIN_INTEGRACION = argv.includes('--sin-integracion');
const dirTools = join(raiz, 'tools');

if (!nombre) {
  const disponibles = existsSync(dirTools)
    ? readdirSync(dirTools, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  console.error('Uso: node scripts/empaqueta-herramienta.mjs <nombre> [--sin-integracion] [--en <ruta-proyecto>]');
  console.error(`Herramientas en tools/: ${disponibles.join(', ') || '(ninguna)'}`);
  process.exit(2);
}
if (idxEn !== -1 && (!DESTINO || !existsSync(join(DESTINO, 'package.json')))) {
  console.error(rojo(`✗ --en necesita la ruta de un proyecto con package.json (recibi: ${DESTINO || '(nada)'})`));
  process.exit(2);
}

const dir = join(dirTools, nombre);
if (!existsSync(join(dir, 'package.json'))) {
  console.error(rojo(`✗ No existe tools/${nombre}/package.json`));
  console.error('  Copia tools/ejemplo-herramienta/ como andamio.');
  process.exit(2);
}

const corre = (cmd, args, cwd, permisivo = false) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (permisivo) return e.stdout ?? '';
    throw new Error(`${cmd} ${args.join(' ')} fallo:\n${(e.stdout ?? '') + (e.stderr ?? '')}`);
  }
};

const problemas = [];
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

// --- 1. El contrato del paquete --------------------------------------------
// Cada linea de aqui es un fallo que solo aparece en el proyecto de DESTINO.
if (!pkg.name) problemas.push('`name` ausente: sin nombre no se puede instalar.');
if (!/^\d+\.\d+\.\d+/.test(pkg.version ?? '')) {
  problemas.push('`version` ausente o no semver. Un consumidor pinea una version; `latest` es anti-patron aqui igual que en el modelo (C1).');
}
if (!pkg.exports) {
  problemas.push('sin `exports`: Node resolvera lo que le parezca y los subpaths no existiran para el consumidor.');
} else {
  const rutas = JSON.stringify(pkg.exports);
  if (!rutas.includes('types')) problemas.push('`exports` no declara `types`: el consumidor pierde el autocompletado y el typecheck del paquete.');
  if (!rutas.includes('./dist/')) problemas.push('`exports` no apunta a `dist/`: estarias publicando fuentes o rutas que no existen tras el build.');
}
if (!Array.isArray(pkg.files) || !pkg.files.includes('dist')) {
  problemas.push('`files` no incluye "dist": el tarball saldria sin el build (o con el codigo fuente entero).');
}
if (!pkg.type) problemas.push('sin `type`: Node adivina si es ESM o CJS y acierta la mitad de las veces.');
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  if (['react', 'react-dom', 'next'].includes(dep)) {
    problemas.push(`\`${dep}\` esta en dependencies y debe ser peerDependency: si se empaqueta una copia, el proyecto de destino acaba con dos y los hooks fallan de formas que nadie sabe depurar.`);
  }
}
if (!pkg.engines?.node) problemas.push('sin `engines.node`: el consumidor no sabe en que Node corre esto.');

console.log(`Herramienta: ${pkg.name}@${pkg.version}  ${gris(`(tools/${nombre})`)}`);
if (problemas.length > 0) {
  console.log(rojo(`\n${problemas.length} problema(s) en el contrato del paquete:`));
  for (const p of problemas) console.log(`  · ${p}`);
  console.log('\nNada de esto rompe el build: rompe la instalacion en el proyecto de destino.');
  process.exit(1);
}
console.log(verde('✓ contrato del package.json'));

// --- 2. Build ---------------------------------------------------------------
try {
  corre('npx', ['tsc', '-p', 'tsconfig.json'], dir);
} catch (e) {
  console.log(rojo('✗ el build fallo'));
  console.log(e.message);
  process.exit(1);
}
const dist = join(dir, 'dist');
if (!existsSync(dist) || readdirSync(dist).length === 0) {
  console.log(rojo('✗ el build no dejo nada en dist/'));
  process.exit(1);
}
console.log(verde(`✓ build (${readdirSync(dist).length} archivos en dist/)`));

// --- 2b. La directiva 'use client' sobrevive al build -----------------------
// Se pierde en silencio con algunos bundlers. El consumidor recibe un componente que Next
// intenta renderizar en el servidor, y el error no menciona a este paquete.
for (const archivo of readdirSync(dist).filter((f) => f.endsWith('.js'))) {
  const fuente = ['tsx', 'ts'].map((ext) => join(dir, 'src', archivo.replace(/\.js$/, `.${ext}`))).find(existsSync);
  if (!fuente) continue;
  const declaraCliente = /^\s*(['"])use client\1/.test(readFileSync(fuente, 'utf8'));
  if (!declaraCliente) continue;
  const salida = readFileSync(join(dist, archivo), 'utf8');
  if (!/^\s*(['"])use client\1/.test(salida)) {
    problemas.push(`${archivo}: la directiva 'use client' se perdio en el build. En el proyecto de destino esto revienta en el servidor.`);
  } else {
    console.log(verde(`✓ 'use client' conservada en ${archivo}`));
  }
}

// --- 3. Tarball -------------------------------------------------------------
let tarball;
try {
  const salida = corre('npm', ['pack', '--silent', '--pack-destination', dir], dir);
  tarball = join(dir, salida.trim().split('\n').pop().trim());
} catch (e) {
  console.log(rojo(`✗ npm pack fallo: ${e.message}`));
  process.exit(1);
}
const contenido = corre('tar', ['-tzf', tarball], dir).split('\n').filter(Boolean);
const traeFuentes = contenido.some((f) => /package\/src\//.test(f));
console.log(verde(`✓ tarball (${contenido.length} archivos)`) + gris(` ${tarball.replace(raiz, '.')}`));
if (traeFuentes) problemas.push('el tarball incluye `src/`: revisa `files`. No es un fallo de seguridad, pero publicas mas de lo que crees.');

// --- 4. Prueba de integracion REAL ------------------------------------------
// Aqui es donde "compatible" deja de ser una opinion.
if (!SIN_INTEGRACION) {
  const temporal = mkdtempSync(join(tmpdir(), 'integra-'));
  try {
    writeFileSync(join(temporal, 'package.json'), JSON.stringify({ name: 'consumidor', version: '1.0.0', type: 'module', private: true }, null, 2));
    corre('npm', ['install', '--no-audit', '--no-fund', '--silent', tarball], temporal);

    const principal = Object.keys(pkg.exports).includes('.') ? pkg.name : pkg.name;
    const prueba = `
import * as api from ${JSON.stringify(principal)};
const exportados = Object.keys(api);
if (exportados.length === 0) { console.error('el paquete no exporta nada'); process.exit(1); }
console.log('exporta: ' + exportados.join(', '));
`;
    writeFileSync(join(temporal, 'prueba.mjs'), prueba);
    const salida = corre('node', ['prueba.mjs'], temporal);
    console.log(verde('✓ integracion: instalado e importado en un proyecto limpio'));
    console.log(gris(`  ${salida.trim()}`));

    // Los tipos tienen que viajar: sin esto el consumidor pierde el typecheck en silencio.
    const dts = contenido.filter((f) => f.endsWith('.d.ts'));
    if (dts.length === 0) problemas.push('el tarball no lleva ningun .d.ts: el consumidor se queda sin tipos.');
    else console.log(verde(`✓ tipos incluidos (${dts.length} .d.ts)`));
  } catch (e) {
    console.log(rojo('✗ la prueba de integracion fallo — el paquete NO es consumible tal cual:'));
    console.log(e.message.split('\n').slice(0, 12).join('\n'));
    rmSync(temporal, { recursive: true, force: true });
    process.exit(1);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
} else {
  console.log(gris('· prueba de integracion omitida (--sin-integracion)'));
}

// --- 5. Encaje con un proyecto de destino REAL (--en) ------------------------
// El paso 4 prueba el contrato en un proyecto sin React ni Next: no puede ver un React
// duplicado ni un peer que el destino tiene en otra major. Aqui se instala en el proyecto
// del usuario SIN tocar su package.json ni su lockfile (`--no-save`), se pregunta a npm por
// los peers contra el arbol real, se importa desde ahi, y se retira lo instalado.
if (DESTINO) {
  const segmentos = pkg.name.split('/');
  const instalado = join(DESTINO, 'node_modules', ...segmentos);
  const pruebaDestino = join(DESTINO, `.empaqueta-prueba-${process.pid}.mjs`);
  console.log(`\nEncaje con ${gris(DESTINO)}`);
  try {
    // Sin --silent a proposito: si npm rechaza la instalacion (ERESOLVE por un peer en otra
    // major), la razon esta en stderr y es exactamente lo que hay que enseñar.
    corre('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--loglevel=error', tarball], DESTINO);

    // Los peers los dictamina npm contra lo que el destino tiene instalado de verdad.
    // `extraneous` es el propio paquete, que va con --no-save: no es una queja.
    const ls = JSON.parse(corre('npm', ['ls', pkg.name, '--json', '--depth=0'], DESTINO, true) || '{}');
    const quejas = (ls.problems ?? []).filter((p) => !/missing:.*optional/i.test(p) && !new RegExp(`^extraneous: ${pkg.name.replace(/[/@.]/g, '\\$&')}@`).test(p));
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      const opcional = Boolean(pkg.peerDependenciesMeta?.[peer]?.optional);
      const manifiesto = join(DESTINO, 'node_modules', ...peer.split('/'), 'package.json');
      if (!existsSync(manifiesto)) {
        if (opcional) console.log(gris(`· peer opcional ${peer}: el destino no lo tiene (no aplica)`));
        else problemas.push(`el destino no tiene ${peer} (peer obligatorio ${pkg.peerDependencies[peer]}).`);
        continue;
      }
      const version = JSON.parse(readFileSync(manifiesto, 'utf8')).version;
      const queja = quejas.find((q) => q.includes(`${peer}@`));
      if (queja) problemas.push(`${peer}@${version} en el destino NO satisface el peer ${pkg.peerDependencies[peer]} — npm: ${queja.split('\n')[0]}`);
      else console.log(verde(`✓ peer ${peer}: destino tiene ${version}, pedido ${pkg.peerDependencies[peer]}`));
    }
    for (const q of quejas.filter((q) => !Object.keys(pkg.peerDependencies ?? {}).some((p) => q.includes(`${p}@`)))) {
      problemas.push(`npm ls en el destino: ${q.split('\n')[0]}`);
    }

    // Y se importa DESDE el destino: con su Node, su resolucion y su arbol.
    writeFileSync(pruebaDestino, `import * as api from ${JSON.stringify(pkg.name)};\nif (Object.keys(api).length === 0) { console.error('el paquete no exporta nada'); process.exit(1); }\nconsole.log('exporta: ' + Object.keys(api).join(', '));\n`);
    const salida = corre('node', [pruebaDestino], DESTINO);
    console.log(verde('✓ integracion en el destino: instalado e importado con su arbol real'));
    console.log(gris(`  ${salida.trim()}`));
  } catch (e) {
    console.log(rojo('✗ el encaje con el destino fallo — asi se veria en TU proyecto:'));
    console.log(e.message.split('\n').slice(0, 12).join('\n'));
    problemas.push('el paquete no encaja con el proyecto de destino (ver arriba).');
  } finally {
    rmSync(pruebaDestino, { force: true });
    rmSync(instalado, { recursive: true, force: true });
    // Un paquete con scope deja `node_modules/@scope/` vacio: se retira tambien.
    const scope = dirname(instalado);
    if (segmentos.length > 1 && existsSync(scope) && readdirSync(scope).length === 0) rmSync(scope, { recursive: true, force: true });
    console.log(gris('· retirado del destino: su package.json y su lockfile no se tocaron'));
  }
}

if (problemas.length > 0) {
  console.log(rojo(`\n${problemas.length} aviso(s):`));
  for (const p of problemas) console.log(`  · ${p}`);
  process.exit(1);
}
console.log(verde('\n✓ Empaquetada y probada. Para integrarla en otro proyecto:'));
console.log(`    npm install ${tarball.replace(raiz, '<ruta-a-este-repo>')}`);
console.log(gris('    (o publicala en un registro y pinea la version exacta: C1 aplica igual a tus paquetes)'));
process.exit(0);
