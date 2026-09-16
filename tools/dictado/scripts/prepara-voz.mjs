#!/usr/bin/env node
/**
 * Deja `@tu-scope/voz` instalado en `node_modules/` ANTES de compilar, desde su tarball y con
 * la version exacta que declara `peerDependencies`. Corre como `prebuild`, asi `npm run build`
 * (y con el `prepara:gate` de la raiz) funciona en un clon limpio.
 *
 * Tarball y no `npm link`: el enlace resuelve por symlink y hace funcionar cosas que en una
 * instalacion real fallan (`docs/EMPAQUETAR-HERRAMIENTA.md` §4). Si el tarball no existe, se
 * empaqueta `tools/voz` con `npm pack` — lo mismo que hace el empaquetador, sin sus pruebas.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(aqui, 'package.json'), 'utf8'));
const version = pkg.peerDependencies['@tu-scope/voz'];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`prepara-voz: el peer @tu-scope/voz debe ir pineado exacto, no "${version}" (C1)`);
  process.exit(1);
}

const instalado = join(aqui, 'node_modules', '@tu-scope', 'voz', 'package.json');
if (existsSync(instalado) && JSON.parse(readFileSync(instalado, 'utf8')).version === version) process.exit(0);

const dirVoz = resolve(aqui, '..', 'voz');
const tarball = join(dirVoz, `tu-scope-voz-${version}.tgz`);
if (!existsSync(tarball)) {
  const declarada = JSON.parse(readFileSync(join(dirVoz, 'package.json'), 'utf8')).version;
  if (declarada !== version) {
    console.error(`prepara-voz: tools/voz esta en ${declarada} y este paquete pide ${version}: sube el peer a proposito, no por accidente`);
    process.exit(1);
  }
  execFileSync('npm', ['run', 'build'], { cwd: dirVoz, stdio: 'ignore' });
  execFileSync('npm', ['pack', '--silent', '--pack-destination', dirVoz], { cwd: dirVoz, stdio: 'ignore' });
}
console.log(`prepara-voz: instalando @tu-scope/voz@${version} desde ${tarball}`);
execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--silent', tarball], { cwd: aqui, stdio: 'inherit' });
