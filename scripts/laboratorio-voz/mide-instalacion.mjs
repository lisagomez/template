#!/usr/bin/env node
/**
 * Mide `dictado instala` en un entorno LIMPIO reproducible: un HOME nuevo y vacio (sin banco,
 * sin modelos, sin runtimes), la herramienta empaquetada con `npm pack` e instalada desde el
 * tarball en un proyecto temporal, y el instalador corriendo con red real. Cronometra cada
 * paso y deja la tabla en Markdown. Lo que Windows tiene que hacer a mano lo lista el propio
 * instalador al final.
 *
 *   node scripts/laboratorio-voz/mide-instalacion.mjs [--salida carpeta] [--conservar]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const salida = resolve(arg('salida', 'tools/dictado/medicion/corpus-propio'));
const raiz = resolve('tools/dictado');
const t = (f) => { const t0 = performance.now(); const r = f(); return [Math.round(performance.now() - t0), r]; };

const temporal = mkdtempSync(join(tmpdir(), 'instala-limpio-'));
const casa = join(temporal, 'casa');
const proyecto = join(temporal, 'proyecto');
mkdirSync(casa); mkdirSync(proyecto);
const env = { ...process.env, HOME: casa };
for (const k of ['DICTADO_DATOS', 'DICTADO_MODELOS', 'DICTADO_RUNTIME', 'DICTADO_PYTHON', 'DICTADO_TRAYECTORIAS']) delete env[k];
console.log(`entorno limpio: HOME=${casa} (vacio), proyecto=${proyecto}`);

const pasos = [];
// 1) empaquetar voz y dictado (lo que un tercero recibiria)
let tarVoz = execFileSync('ls', [join(resolve('tools/voz'))], { encoding: 'utf8' }).split('\n').find((n) => n.endsWith('.tgz'));
tarVoz = join(resolve('tools/voz'), tarVoz);
const [msPack, tarDictado] = t(() => { const nombre = execFileSync('npm', ['pack', '--silent', '--pack-destination', temporal], { cwd: raiz, encoding: 'utf8' }).trim().split('\n').pop(); return join(temporal, nombre); });
pasos.push({ paso: 'empaquetar dictado (npm pack)', quien: 'script', ms: msPack });
// 2) instalar desde el tarball en un proyecto limpio
writeFileSync(join(proyecto, 'package.json'), JSON.stringify({ name: 'tercero', private: true, type: 'module' }));
const [msInstall] = t(() => execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error', tarVoz, tarDictado], { cwd: proyecto, env, stdio: ['ignore', 'ignore', 'inherit'] }));
pasos.push({ paso: 'npm install del tarball en un proyecto limpio', quien: 'script', ms: msInstall });
// 3) el instalador (sin icono: Windows se mide aparte, a mano)
const t0 = performance.now();
const r = spawnSync(process.execPath, [join(proyecto, 'node_modules', '@tu-scope', 'dictado', 'dist', 'node', 'cli.js'), 'instala', '--sin-icono'], { cwd: proyecto, env, encoding: 'utf8' });
const msInstala = Math.round(performance.now() - t0);
const salidaInstala = (r.stdout ?? '') + (r.stderr ?? '');
console.log(salidaInstala);
pasos.push({ paso: 'dictado instala --sin-icono (comprobar, runtimes, pesos, token, diagnostico)', quien: 'script', ms: msInstala, nota: r.status === 0 ? 'ok' : `salio con ${r.status}` });
// 4) una transcripcion real con lo instalado
const wav = resolve('tools/dictado/medicion/corpus-propio/sintetico/limpio-01.wav');
const t1 = performance.now();
const ra = spawnSync(process.execPath, [join(proyecto, 'node_modules', '@tu-scope', 'dictado', 'dist', 'node', 'cli.js'), 'archivo', wav, '--motor', 'parakeet'], { cwd: proyecto, env, encoding: 'utf8' });
const msArchivo = Math.round(performance.now() - t1);
const texto = (ra.stdout ?? '').trim();
if (ra.status !== 0) console.error('archivo fallo:', (ra.stderr ?? '').trim().slice(-400));
pasos.push({ paso: 'primera transcripcion con lo instalado (dictado archivo)', quien: 'script', ms: msArchivo, nota: ra.status === 0 ? texto.slice(0, 60) : `fallo (${ra.status})` });

const total = pasos.reduce((s, p) => s + p.ms, 0);
const fecha = new Date().toISOString().slice(0, 10);
const md = [`# Instalación medida en limpio — ${fecha}`, '', `Entorno: HOME nuevo y vacío en un temporal, proyecto limpio con \`npm install\` de los tarballs de voz y dictado, red real. Sin icono (Windows se lista a mano).`, '', '| paso | quién | tiempo | nota |', '|---|---|---|---|', ...pasos.map((p) => `| ${p.paso} | ${p.quien} | ${(p.ms / 1000).toFixed(1)} s | ${p.nota ?? ''} |`), '', `**Total del script: ${(total / 1000 / 60).toFixed(1)} min.** Acciones humanas del script: 0. Las que quedan a mano las lista el instalador (micrófono, anclar icono, abrir la dirección en el teléfono, y solo por LAN el script de red como administrador): 3 obligatorias, 1 opcional.`, '', '## Salida del instalador', '', '```', salidaInstala.replace(/\x1b\[[0-9;]*m/g, '').trim(), '```', ''].join('\n');
writeFileSync(join(salida, `instalacion-${fecha}.md`), md);
console.log(`\nescrito ${join(salida, `instalacion-${fecha}.md`)} · total ${(total / 1000 / 60).toFixed(1)} min`);
if (process.argv.includes('--conservar')) console.log(`entorno conservado en ${temporal}`); else rmSync(temporal, { recursive: true, force: true });
