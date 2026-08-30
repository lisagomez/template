#!/usr/bin/env node
/**
 * Lo que `validate` daba por hecho y no lo estaba. Corre ANTES del typecheck.
 *
 * Dos fallos reales, los dos del 2026-08-30, los dos con el mismo sintoma: el gate
 * reventaba diciendo algo que no era el problema.
 *
 *   1. **Las herramientas de `tools/` no estaban construidas.** El typecheck de la raiz
 *      incluye sus pruebas, y esas importan `../dist/index.js`. Como `dist/` no se versiona
 *      y ningun script lo generaba, un clon limpio daba 14 errores de "no se encuentra el
 *      modulo" — que suena a import mal escrito y era un build que faltaba.
 *
 *   2. **La version de Node no cumplia `engines`.** `package.json` pide >=22.18 porque hay
 *      scripts `.ts` que se ejecutan sin loader. Con Node 20 el gate moria con
 *      `ERR_UNKNOWN_FILE_EXTENSION`, que no le dice a nadie que actualice Node. npm no hace
 *      cumplir `engines` sin `engine-strict`, asi que el requisito estaba declarado y no
 *      vigilado: una nota, no un requisito.
 *
 * La doctrina del repo aplicada a los gates mismos: **un gate que falla por la razon
 * equivocada cuesta mas que uno que no existe**, porque manda a buscar donde no es.
 *
 * Exit 0 listo · 1 el entorno no da o una herramienta no compila.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));

// --- 1. La version de Node, contra lo que el propio repo declara --------------------------
const exigido = pkg.engines?.node;
if (exigido) {
  // Se soporta la forma que este repo usa: ">=X.Y". Cualquier otra se declara no
  // comprobada en vez de fingir que se entiende — un comparador de rangos completo es un
  // paquete, y aqui el gate no puede depender de node_modules.
  const m = /^>=\s*(\d+)\.(\d+)/.exec(exigido);
  if (!m) {
    console.log(gris(`  · engines.node = "${exigido}": forma no reconocida, sin comprobar`));
  } else {
    const [, maj, min] = m.map(Number);
    const [aMaj, aMin] = process.versions.node.split('.').map(Number);
    const cumple = aMaj > maj || (aMaj === maj && aMin >= min);
    if (!cumple) {
      console.error(rojo(`\n✗ Node ${process.version} no cumple engines "${exigido}".`));
      console.error('  El gate necesita ejecutar scripts .ts sin loader, y eso llega en 22.18.');
      console.error(`  Sin esto, ${gris('prueba:contabilidad')} muere con ERR_UNKNOWN_FILE_EXTENSION,`);
      console.error('  que no dice que el problema sea la version.\n');
      console.error(`  Arreglo:  nvm install ${maj}   ${gris('(el .nvmrc del repo ya pide ' + maj + ')')}\n`);
      process.exit(1);
    }
    console.log(`  ${verde('✓')} Node ${process.version} cumple engines "${exigido}"`);
  }
}

// --- 2. Las herramientas de tools/, construidas -------------------------------------------
const dirTools = join(raiz, 'tools');
const herramientas = existsSync(dirTools)
  ? readdirSync(dirTools, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

for (const nombre of herramientas) {
  const dir = join(dirTools, nombre);
  const rutaPkg = join(dir, 'package.json');
  if (!existsSync(rutaPkg)) continue;
  let build;
  try {
    build = JSON.parse(readFileSync(rutaPkg, 'utf8')).scripts?.build;
  } catch {
    console.error(rojo(`  ✗ tools/${nombre}: package.json ilegible`));
    process.exit(1);
  }
  if (!build) {
    console.log(gris(`  · tools/${nombre}: sin script build, nada que construir`));
    continue;
  }
  try {
    execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'pipe' });
    console.log(`  ${verde('✓')} tools/${nombre} construida`);
  } catch (e) {
    console.error(rojo(`\n✗ tools/${nombre} no compila — el typecheck de la raiz iba a fallar`));
    console.error('  citando sus pruebas, que es donde NO esta el problema.\n');
    console.error(String(e.stdout ?? '') + String(e.stderr ?? ''));
    process.exit(1);
  }
}

console.log(gris(`  ${herramientas.length} herramienta(s) en tools/ · entorno listo\n`));
