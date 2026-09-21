#!/usr/bin/env node
/**
 * `npm run diagnostico`: lo que un tercero pega en un issue sin filtrar nada. Version, Node,
 * pesos presentes en el banco (presencia, nunca rutas de usuario), runtime instalado y su
 * version, la ultima medicion (fecha y maquina) y si el `dist/` esta construido. Sin secretos
 * y sin `/home/<usuario>`: se limpia antes de imprimir, como hace `dictado diagnostico`.
 *
 *   npm run diagnostico [-- --json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const banco = join(aqui, 'banco');

/** Rutas de usuario, correos, claves y tokens fuera: es lo mismo que limpia `dictado diagnostico`. */
const FORMAS = [
  [/\b(sk|rk|pk)[-_][A-Za-z0-9_-]{10,}/g, '[clave]'],
  [/\beyJ[A-Za-z0-9_-]{20,}/g, '[jwt]'],
  [/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '[correo]'],
  [/\b[0-9a-f]{32}\b/gi, '[token]'],
  [/\/home\/[^/\s]+/g, '/home/[usuario]'],
  [/\/Users\/[^/\s]+/g, '/Users/[usuario]'],
  [/[A-Z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[usuario]'],
];
export const limpiaParaCompartir = (texto) => FORMAS.reduce((t, [forma, por]) => t.replace(forma, por), texto);

const version = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version;
const dist = existsSync(join(raiz, 'dist', 'node', 'pesos.js'));
const lineas = [`voz ${version} · Node ${process.version} · ${process.platform}${process.env.WSL_DISTRO_NAME ? ` · WSL ${process.env.WSL_DISTRO_NAME}` : ''}`];
lineas.push(`dist: ${dist ? 'construido' : 'sin construir (npm run build)'}`);
if (dist) {
  const { PESOS, RUNTIMES } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'pesos.js')).href);
  lineas.push('pesos (en medicion/banco/modelos):');
  for (const p of PESOS) lineas.push(`  ${existsSync(join(banco, 'modelos', p.archivo)) ? '✓' : '✗'} ${p.archivo} — ${p.que} (~${p.mb} MB)`);
  lineas.push('runtimes (peers opcionales):');
  for (const [nombre, esperada] of Object.entries(RUNTIMES)) {
    const pkg = join(banco, 'node_modules', nombre, 'package.json');
    const instalada = existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).version : null;
    lineas.push(`  ${instalada ? '✓' : '·'} ${nombre}@${esperada}${instalada ? (instalada === esperada ? '' : ` (instalado ${instalada}: distinto del medido)`) : ' (no instalado en el banco)'}`);
  }
}
const manifiesto = join(banco, 'manifiesto.json');
lineas.push(`audio de medicion: ${existsSync(manifiesto) ? `${JSON.parse(readFileSync(manifiesto, 'utf8')).length} tomas` : 'no bajado (npm run mide)'}`);
const ultima = join(aqui, 'ultima-medicion.json');
if (existsSync(ultima)) {
  const m = JSON.parse(readFileSync(ultima, 'utf8'));
  lineas.push(`ultima medicion: ${m.fecha} · ${m.maquina?.cpu ?? '?'} · ${m.corpus?.nombre ?? '?'} · calibraUmbral ${m.calibracion?.umbral ?? '?'}`);
} else lineas.push('ultima medicion: ninguna en esta maquina');
const texto = limpiaParaCompartir(lineas.join('\n'));
if (process.argv.includes('--json')) console.log(JSON.stringify({ version, lineas: texto.split('\n') }, null, 1));
else console.log(texto);
