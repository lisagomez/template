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
 *
 * Uso:  node scripts/empaqueta-herramienta.mjs <nombre> [--sin-integracion]
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

const nombre = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SIN_INTEGRACION = process.argv.includes('--sin-integracion');
const dirTools = join(raiz, 'tools');

if (!nombre) {
  const disponibles = existsSync(dirTools)
    ? readdirSync(dirTools, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  console.error('Uso: node scripts/empaqueta-herramienta.mjs <nombre> [--sin-integracion]');
  console.error(`Herramientas en tools/: ${disponibles.join(', ') || '(ninguna)'}`);
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

if (problemas.length > 0) {
  console.log(rojo(`\n${problemas.length} aviso(s):`));
  for (const p of problemas) console.log(`  · ${p}`);
  process.exit(1);
}
console.log(verde('\n✓ Empaquetada y probada. Para integrarla en otro proyecto:'));
console.log(`    npm install ${tarball.replace(raiz, '<ruta-a-este-repo>')}`);
console.log(gris('    (o publicala en un registro y pinea la version exacta: C1 aplica igual a tus paquetes)'));
process.exit(0);
